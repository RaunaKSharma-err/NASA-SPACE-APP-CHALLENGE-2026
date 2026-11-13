"""Local file provider: reads Esri ASCII Grid terrain + JSON metadata from disk.

This is the default provider. It is always enabled and wraps the existing
terrain.get_grid(), grid_io.load_ascii_grid(), and registry.load_models()
so no existing functionality is duplicated or replaced.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from app.core.config import Settings
from app.services.grid_io import GridFormatError, load_ascii_grid
from app.services.registry import load_models
from app.services.routing import ElevationGrid
from app.schemas.datasets import DatasetProvenance as BackendDatasetProvenance, Region as BackendRegion

from .base import (
    BaseProvider,
    DatasetMetadata,
    ElevationSample,
    ProviderCapabilities,
    ProviderUnavailable,
    ValidationCheck,
    ValidationResult,
)


class LocalFileProvider(BaseProvider):
    id = "local"
    type = "local"

    def __init__(self, settings: Settings, enabled: bool = True, priority: int = 0):
        self.settings = settings
        self.enabled = enabled
        self.priority = priority
        self.capabilities = ProviderCapabilities(
            capabilities=("elevation", "regions", "observations"),
            supports_streaming=False,
            supports_caching=True,
            requires_auth=False,
        )
        self._grid_cache: dict[str, tuple[ElevationGrid, str]] = {}

    # ------------------------------------------------------------------ datasets

    def list_datasets(self, region_id: str | None = None, dtype: str | None = None) -> list[DatasetMetadata]:
        datasets: list[DatasetMetadata] = []
        for bd in load_models(self.settings.metadata_dir / "datasets", BackendDatasetProvenance):
            if dtype and bd.format.lower() != dtype.lower():
                continue
            datasets.append(self._backend_dataset_to_metadata(bd))
        if region_id:
            # Only return datasets that back a terrain file for this region
            region = next(
                (r for r in load_models(self.settings.metadata_dir / "regions", BackendRegion) if r.id == region_id),
                None,
            )
            if region and region.terrain_dataset_id:
                datasets = [d for d in datasets if d.id == region.terrain_dataset_id]
        return datasets

    # ------------------------------------------------------------------ elevation

    def sample_elevation(self, dataset_id: str, lat: float, lon: float) -> ElevationSample:
        if not self.enabled:
            return self._invalid_sample(dataset_id, lat, lon, "Local provider is disabled")

        # Find which region uses this dataset
        region_id = self._region_for_dataset(dataset_id)
        if region_id is None:
            return self._invalid_sample(dataset_id, lat, lon, f"No region uses dataset '{dataset_id}'")

        found = self._load_grid(region_id)
        if found is None:
            return self._invalid_sample(dataset_id, lat, lon, f"No terrain coverage for region '{region_id}'")

        grid, _status = found
        try:
            row, col = grid.to_cell(lon, lat)
        except Exception:
            return self._invalid_sample(dataset_id, lat, lon, f"({lon}, {lat}) is outside terrain coverage")

        value = grid.elevation[row][col]
        nodata = value is None
        return ElevationSample(
            id="local",
            dataset_id=dataset_id,
            lat=lat,
            lon=lon,
            value=value,
            valid=value is not None,
            units="metres",
            nodata=nodata,
        )

    # ------------------------------------------------------------------ imagery (local has none)

    def get_imagery(self, dataset_id: str, lat_min: float, lat_max: float, lon_min: float, lon_max: float) -> list[dict]:
        return []

    # ------------------------------------------------------------------ validation

    def validate_resource(self, dataset: DatasetMetadata) -> ValidationResult:
        checks: dict[str, ValidationCheck] = {}
        errors: list[str] = []
        warnings: list[str] = []

        checks["format"] = ValidationCheck(
            passed=bool(dataset.format),
            message=f"Format declared: {dataset.format}" if dataset.format else "No format declared",
        )

        checks["crs_units"] = ValidationCheck(
            passed=dataset.crs_units == "degrees",
            message="CRS uses geographic degrees" if dataset.crs_units == "degrees"
            else "CRS units are not degrees — may require reprojection",
        )
        if dataset.crs_units != "degrees":
            errors.append("CRS units are not degrees")

        checks["bounds"] = ValidationCheck(
            passed=self._valid_bounds(dataset),
            message="Bounds within valid lat/lon ranges" if self._valid_bounds(dataset) else "Invalid lat/lon bounds",
        )
        if not self._valid_bounds(dataset):
            errors.append("Bounds contain invalid latitude or longitude")

        checks["units"] = ValidationCheck(
            passed=bool(dataset.value_unit),
            message=f"Units: {dataset.value_unit}" if dataset.value_unit else "No units declared",
        )

        checks["attribution"] = ValidationCheck(
            passed=bool(dataset.organization and dataset.dataset_title),
            message="Attribution present" if (dataset.organization and dataset.dataset_title)
            else "Missing source attribution",
        )

        # Check that the terrain file actually exists on disk
        if dataset.terrain_file:
            path = self.settings.processed_dir / dataset.id / dataset.terrain_file
            checks["terrain_file_exists"] = ValidationCheck(
                passed=path.is_file(),
                message=f"Terrain file present: {dataset.terrain_file}" if path.is_file()
                else f"Terrain file missing: {dataset.terrain_file}",
            )
            if not path.is_file():
                errors.append(f"Terrain file not found: {dataset.terrain_file}")
        else:
            warnings.append("No terrain_file declared (elevation dataset without grid)")

        return ValidationResult(
            valid=len(errors) == 0,
            errors=tuple(errors),
            warnings=tuple(warnings),
            checks=checks,
        )

    # ------------------------------------------------------------------ internals

    def _backend_dataset_to_metadata(self, bd: BackendDatasetProvenance) -> DatasetMetadata:
        return DatasetMetadata(
            id=bd.id,
            name=bd.name,
            type=bd.format.split()[0].lower() if bd.format else "elevation",
            source=bd.authoritative_source,
            format=bd.format,
            crs_name=bd.crs or "Unknown",
            crs_authority=None,
            crs_code=None,
            lon_min=-180.0,
            lon_max=180.0,
            lat_min=-90.0,
            lat_max=90.0,
            crs_units="degrees",
            resolution_value=0.0,
            resolution_unit="metres",
            value_unit=bd.units or "unknown",
            value_reference=None,
            organization=bd.authoritative_source,
            dataset_title=bd.name,
            source_url=bd.access_url,
            access_url=bd.access_url,
            acquisition_date=bd.verified_on,
            processing_date=None,
            processing_steps=tuple(bd.processing_steps),
            license=bd.license,
            limitations=tuple(bd.limitations),
            status=bd.status,
            validated_at=bd.verified_on,
            validation_notes=tuple(),
            size_bytes=int(bd.storage_estimate_mb * 1_000_000) if bd.storage_estimate_mb else None,
            checksum=None,
            terrain_file=bd.terrain_file,
        )

    def _region_for_dataset(self, dataset_id: str) -> str | None:
        for r in load_models(self.settings.metadata_dir / "regions", BackendRegion):
            if r.terrain_dataset_id == dataset_id:
                return r.id
        return None

    def _load_grid(self, region_id: str) -> Optional[tuple[ElevationGrid, str]]:
        if region_id in self._grid_cache:
            return self._grid_cache[region_id]

        # Delegate to the existing terrain service (no duplication)
        from app.services.terrain import get_grid as _get_grid
        try:
            result = _get_grid(region_id, self.settings)
        except Exception:
            result = None

        if result is not None:
            self._grid_cache[region_id] = result
        return result

    def _valid_bounds(self, dataset: DatasetMetadata) -> bool:
        return (
            -180 <= dataset.lon_min <= 360
            and -180 <= dataset.lon_max <= 360
            and -90 <= dataset.lat_min <= 90
            and -90 <= dataset.lat_max <= 90
            and dataset.lon_min <= dataset.lon_max
            and dataset.lat_min <= dataset.lat_max
        )

    def _invalid_sample(self, dataset_id: str, lat: float, lon: float, reason: str) -> ElevationSample:
        return ElevationSample(
            id="local",
            dataset_id=dataset_id,
            lat=lat,
            lon=lon,
            value=None,
            valid=False,
            units="metres",
            nodata=True,
        )
