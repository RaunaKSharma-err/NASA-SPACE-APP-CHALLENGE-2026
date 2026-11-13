"""Provider-based scientific data API endpoints.

These endpoints expose the ProviderManager to the frontend so that
remote scientific resources can be discovered, validated, and sampled
through a consistent contract. No NASA endpoints are assumed — all
configuration comes from backend settings (environment variables).
"""

from fastapi import APIRouter, Query, Header, HTTPException

from app.core.config import get_settings
from app.core.errors import AppError
from app.services.providers.manager import ProviderManager, SourceSelectionMode
from app.schemas.providers import (
    DatasetListResponse,
    DatasetOut,
    ElevationOut,
    ElevationResponse,
    ElevationRequest,
    ImageryResponse,
    ImageryOut,
    ProviderHealthResponse,
    ProviderInfo,
    SourceModeRequest,
    SourceModeResponse,
    ValidationResultOut,
)

router = APIRouter()

# Process-local manager instance. In production this would be scoped per-request
# or per-session; for MARSYN it mirrors the existing singleton pattern.
_manager: ProviderManager | None = None


def _get_manager() -> ProviderManager:
    global _manager
    if _manager is None:
        from app.core.config import get_settings as _gs
        _manager = ProviderManager(_gs(), remote_enabled=False)
    return _manager


def _dataset_to_out(d) -> DatasetOut:
    return DatasetOut(
        id=d.id,
        name=d.name,
        type=d.type,
        source=d.source,
        format=d.format,
        crs_name=d.crs_name,
        crs_authority=d.crs_authority,
        crs_code=d.crs_code,
        crs_units=d.crs_units,
        lon_min=d.lon_min,
        lon_max=d.lon_max,
        lat_min=d.lat_min,
        lat_max=d.lat_max,
        resolution_value=d.resolution_value,
        resolution_unit=d.resolution_unit,
        value_unit=d.value_unit,
        value_reference=d.value_reference,
        organization=d.organization,
        dataset_title=d.dataset_title,
        source_url=d.source_url,
        access_url=d.access_url,
        acquisition_date=d.acquisition_date,
        processing_date=d.processing_date,
        processing_steps=list(d.processing_steps),
        license=d.license,
        limitations=list(d.limitations),
        status=d.status,
        validated_at=d.validated_at,
        size_bytes=d.size_bytes,
        checksum=d.checksum,
        terrain_file=d.terrain_file,
    )


def _elevation_to_out(s) -> ElevationOut:
    return ElevationOut(
        id=s.id,
        dataset_id=s.dataset_id,
        lat=s.lat,
        lon=s.lon,
        value=s.value,
        valid=s.valid,
        units=s.units,
        nodata=s.nodata,
        crs_name=s.crs_name,
        crs_units=s.crs_units,
    )


# ------------------------------------------------------------------ provider configuration

@router.get("/providers/health", response_model=ProviderHealthResponse)
def provider_health():
    """Return provider status and current source selection mode."""
    m = _get_manager()
    return ProviderHealthResponse(
        local_enabled=m.local_provider.enabled,
        remote_enabled=m.remote_enabled,
        remote_configured=bool(m.remote_provider.base_url),
        source_mode=m.source_selection_mode,
        providers=[
            ProviderInfo(
                id=p.id,
                type=p.type,
                enabled=p.enabled,
                priority=p.priority,
                capabilities=list(p.capabilities.capabilities),
                requires_auth=p.capabilities.requires_auth,
            )
            for p in [m.local_provider, m.remote_provider]
        ],
    )


@router.post("/providers/source-mode", response_model=SourceModeResponse)
def set_source_mode(req: SourceModeRequest, x_admin_token: str | None = Header(None)):
    """Configure the source selection mode.

    Requires admin token when remote_data_admin_token is configured.

    Modes:
    - "local": only local resources (default).
    - "remote": prefer remote; error if unavailable (no silent local fallback).
    - "remote_with_fallback": prefer remote, fall back to local on failure.
    """
    settings = get_settings()
    admin_token = settings.remote_data_admin_token
    if admin_token and x_admin_token != admin_token:
        raise HTTPException(status_code=401, detail="Admin token required to change source mode")
    m = _get_manager()
    m.set_source_mode(req.mode)
    return SourceModeResponse(
        mode=m.source_selection_mode,
        remote_enabled=m.remote_enabled,
        remote_configured=bool(m.remote_provider.base_url),
    )


# ------------------------------------------------------------------ datasets

@router.get("/providers/datasets", response_model=DatasetListResponse)
def list_datasets(region_id: str | None = Query(None), dtype: str | None = Query(None)):
    """List available datasets with explicit source attribution."""
    m = _get_manager()
    result = m.list_datasets(region_id=region_id, dtype=dtype)
    return DatasetListResponse(
        datasets=[_dataset_to_out(d) for d in result.data],
        source=result.source,
        mode=m.source_selection_mode,
        provider_used=result.provider_used,
        fallback_reason=result.fallback_reason,
    )


@router.get("/providers/datasets/{dataset_id}", response_model=DatasetOut)
def get_dataset(dataset_id: str):
    """Retrieve metadata for a single dataset."""
    m = _get_manager()
    dataset = m.get_dataset(dataset_id)
    if dataset is None:
        raise AppError(404, "dataset_not_found", f"Dataset '{dataset_id}' not found.")
    return _dataset_to_out(dataset)


# ------------------------------------------------------------------ elevation

@router.get("/providers/elevation", response_model=ElevationResponse)
def sample_elevation(dataset_id: str, lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-180, le=360)):
    """Sample elevation at a geographic coordinate with source attribution."""
    m = _get_manager()
    result = m.sample_elevation(dataset_id, lat, lon)
    return ElevationResponse(
        sample=_elevation_to_out(result.data),
        source=result.source,
        mode=m.source_selection_mode,
        provider_used=result.provider_used,
        fallback_reason=result.fallback_reason,
    )


# ------------------------------------------------------------------ imagery

@router.get("/providers/imagery", response_model=ImageryResponse)
def get_imagery(
    dataset_id: str,
    lat_min: float = Query(ge=-90, le=90),
    lat_max: float = Query(ge=-90, le=90),
    lon_min: float = Query(ge=-180, le=360),
    lon_max: float = Query(ge=-180, le=360),
):
    """Retrieve imagery references for a bounding box with source attribution."""
    m = _get_manager()
    result = m.get_imagery(dataset_id, lat_min, lat_max, lon_min, lon_max)
    return ImageryResponse(
        imagery=[ImageryOut(**item) if isinstance(item, dict) else ImageryOut(
            id=getattr(item, "id", "unknown"),
            dataset_id=getattr(item, "dataset_id", dataset_id),
            bounds=getattr(item, "bounds", {}),
            url=getattr(item, "url", None),
            format=getattr(item, "format", "png"),
            attribution=getattr(item, "attribution", {}),
        ) for item in result.data],
        source=result.source,
        mode=m.source_selection_mode,
        provider_used=result.provider_used,
        fallback_reason=result.fallback_reason,
    )


# ------------------------------------------------------------------ validation

@router.post("/providers/validate", response_model=ValidationResultOut)
def validate_resource(dataset: DatasetOut):
    """Validate a dataset resource and return detailed check results."""
    m = _get_manager()
    # Convert DatasetOut back to DatasetMetadata for validation
    from app.services.providers.base import DatasetMetadata as BackendDatasetMetadata
    bd = BackendDatasetMetadata(
        id=dataset.id,
        name=dataset.name,
        type=dataset.type,
        source=dataset.source,
        format=dataset.format,
        crs_name=dataset.crs_name,
        crs_authority=dataset.crs_authority,
        crs_code=dataset.crs_code,
        lon_min=dataset.lon_min,
        lon_max=dataset.lon_max,
        lat_min=dataset.lat_min,
        lat_max=dataset.lat_max,
        crs_units=dataset.crs_units,
        resolution_value=dataset.resolution_value,
        resolution_unit=dataset.resolution_unit,
        value_unit=dataset.value_unit,
        value_reference=dataset.value_reference,
        organization=dataset.organization,
        dataset_title=dataset.dataset_title,
        source_url=dataset.source_url,
        access_url=dataset.access_url,
        acquisition_date=dataset.acquisition_date,
        processing_date=dataset.processing_date,
        processing_steps=tuple(dataset.processing_steps),
        license=dataset.license,
        limitations=tuple(dataset.limitations),
        status=dataset.status,
        validated_at=dataset.validated_at,
        size_bytes=dataset.size_bytes,
        checksum=dataset.checksum,
        terrain_file=dataset.terrain_file,
    )
    result = m.validate_resource(bd)
    return ValidationResultOut(
        valid=result.valid,
        errors=list(result.errors),
        warnings=list(result.warnings),
        checks={k: ValidationCheckOut(
            passed=c.passed,
            message=c.message,
            detail=c.detail,
        ) for k, c in result.checks.items()},
    )
