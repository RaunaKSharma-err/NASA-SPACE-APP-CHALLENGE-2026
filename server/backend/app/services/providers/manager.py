"""Provider manager: coordinates local and remote scientific data providers.

Guarantees:
- Local provider is always the default and always enabled.
- Remote provider is opt-in and disabled until explicitly configured.
- Missing remote configuration never breaks the application.
- Source selection mode is explicit and never silently switches sources.
- Fallback reasons are recorded when a source switch occurs.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.core.config import Settings
from app.core.errors import AppError
from app.services.terrain import get_grid as terrain_get_grid
from app.services.providers.base import (
    DatasetMetadata,
    ElevationSample,
    ProviderCapabilities,
    ProviderUnavailable,
    ValidationResult,
)
from app.services.providers.local import LocalFileProvider
from app.services.providers.remote import RemoteHttpProvider
from app.services.providers.validation import ResourceValidator, ValidationConfig


class ProviderSourceError(RuntimeError):
    """Raised when remote-only mode is selected but remote is unavailable."""


@dataclass(frozen=True)
class ProviderCallResult:
    """Result of a provider call with source attribution."""
    data: object
    source: str                      # "local" | "remote" | "fallback"
    provider_used: Optional[str] = None
    fallback_reason: Optional[str] = None


SourceSelectionMode = str  # "local" | "remote" | "remote_with_fallback"


class ProviderManager:
    """High-level facade over all scientific data providers."""

    def __init__(self, settings: Settings, remote_enabled: bool = False, source_mode: SourceSelectionMode = "local"):
        self.settings = settings
        self.validator = ResourceValidator(
            ValidationConfig(require_verified_status=False)
        )
        self.source_mode: SourceSelectionMode = source_mode

        # Providers sorted by priority (lower = tried first)
        self._providers: list = []
        self._local = LocalFileProvider(settings, enabled=True, priority=0)
        self._remote = RemoteHttpProvider(settings, enabled=remote_enabled, priority=10)

        self._providers = [self._local, self._remote]

    # ------------------------------------------------------------------ providers

    @property
    def local_provider(self) -> LocalFileProvider:
        return self._local

    @property
    def remote_provider(self) -> RemoteHttpProvider:
        return self._remote

    @property
    def remote_enabled(self) -> bool:
        return self._remote.enabled

    @property
    def source_selection_mode(self) -> SourceSelectionMode:
        return self.source_mode

    def set_source_mode(self, mode: SourceSelectionMode) -> None:
        self.source_mode = mode

    def enable_remote(self) -> None:
        """Enable the remote provider only if it has a base URL configured."""
        if self._remote.base_url:
            self._remote.enabled = True
        # If no base URL, remote stays disabled (safe default)

    def disable_remote(self) -> None:
        self._remote.enabled = False

    def list_providers(self) -> list[dict]:
        return [
            {
                "id": p.id,
                "type": p.type,
                "enabled": p.enabled,
                "priority": p.priority,
                "capabilities": p.capabilities.capabilities,
                "requires_auth": p.capabilities.requires_auth,
            }
            for p in self._providers
        ]

    # ------------------------------------------------------------------ datasets

    def list_datasets(self, region_id: Optional[str] = None, dtype: Optional[str] = None) -> ProviderCallResult:
        """Return datasets with explicit source attribution based on source_mode."""
        local = self._local
        remote = self._remote

        if self.source_mode == "local":
            datasets = local.list_datasets(region_id=region_id, dtype=dtype) if local.enabled else []
            return ProviderCallResult(
                data=datasets,
                source="local" if datasets else "fallback",
                provider_used=local.id if datasets else None,
            )

        if self.source_mode == "remote":
            if not remote.enabled:
                return ProviderCallResult(
                    data=[],
                    source="fallback",
                    provider_used=None,
                    fallback_reason="Remote provider is not enabled",
                )
            try:
                datasets = remote.list_datasets(region_id=region_id, dtype=dtype)
                return ProviderCallResult(
                    data=datasets,
                    source="remote" if datasets else "fallback",
                    provider_used=remote.id if datasets else None,
                    fallback_reason=None if datasets else "Remote provider returned no datasets",
                )
            except Exception as exc:
                return ProviderCallResult(
                    data=[],
                    source="fallback",
                    provider_used=remote.id,
                    fallback_reason=f"Remote provider error: {exc}",
                )

        # remote_with_fallback
        if remote.enabled:
            try:
                datasets = remote.list_datasets(region_id=region_id, dtype=dtype)
                if datasets:
                    return ProviderCallResult(
                        data=datasets,
                        source="remote",
                        provider_used=remote.id,
                    )
            except Exception:
                pass  # fall through to local

        datasets = local.list_datasets(region_id=region_id, dtype=dtype) if local.enabled else []
        return ProviderCallResult(
            data=datasets,
            source="local" if datasets else "fallback",
            provider_used=local.id if datasets else None,
            fallback_reason="Remote provider unavailable or returned no datasets" if remote.enabled
            else "Remote provider not enabled",
        )

    def get_dataset(self, dataset_id: str) -> Optional[DatasetMetadata]:
        result = self.list_datasets()
        for dataset in result.data:
            if dataset.id == dataset_id:
                return dataset
        return None

    # ------------------------------------------------------------------ elevation

    def sample_elevation(self, dataset_id: str, lat: float, lon: float) -> ProviderCallResult:
        """Sample elevation with explicit source attribution based on source_mode."""
        local = self._local
        remote = self._remote

        if self.source_mode == "local":
            result = local.sample_elevation(dataset_id, lat, lon) if local.enabled \
                else self._invalid_sample(dataset_id, lat, lon, "Local provider is disabled")
            return ProviderCallResult(
                data=result,
                source="local" if result.valid else "fallback",
                provider_used=local.id if result.valid else None,
            )

        if self.source_mode == "remote":
            if not remote.enabled:
                return ProviderCallResult(
                    data=self._invalid_sample(dataset_id, lat, lon, "Remote provider is not enabled"),
                    source="fallback",
                    provider_used=None,
                    fallback_reason="Remote provider is not enabled",
                )
            try:
                result = remote.sample_elevation(dataset_id, lat, lon)
                return ProviderCallResult(
                    data=result,
                    source="remote" if result.valid else "fallback",
                    provider_used=remote.id if result.valid else remote.id,
                    fallback_reason=None if result.valid else "Remote provider returned invalid elevation",
                )
            except Exception as exc:
                return ProviderCallResult(
                    data=self._invalid_sample(dataset_id, lat, lon, str(exc)),
                    source="fallback",
                    provider_used=remote.id,
                    fallback_reason=f"Remote provider error: {exc}",
                )

        # remote_with_fallback
        if remote.enabled:
            try:
                result = remote.sample_elevation(dataset_id, lat, lon)
                if result.valid:
                    return ProviderCallResult(
                        data=result,
                        source="remote",
                        provider_used=remote.id,
                    )
            except Exception:
                pass  # fall through to local

        result = local.sample_elevation(dataset_id, lat, lon) if local.enabled \
            else self._invalid_sample(dataset_id, lat, lon, "Local provider is disabled")
        return ProviderCallResult(
            data=result,
            source="local" if result.valid else "fallback",
            provider_used=local.id if result.valid else None,
            fallback_reason="Remote provider unavailable or returned invalid elevation" if remote.enabled
            else "Remote provider not enabled",
        )

    # ------------------------------------------------------------------ imagery

    def get_imagery(
        self, dataset_id: str, lat_min: float, lat_max: float, lon_min: float, lon_max: float
    ) -> ProviderCallResult:
        """Retrieve imagery references with explicit source attribution."""
        local = self._local
        remote = self._remote

        if self.source_mode == "local":
            imagery = local.get_imagery(dataset_id, lat_min, lat_max, lon_min, lon_max) if local.enabled else []
            return ProviderCallResult(
                data=imagery,
                source="local" if imagery else "fallback",
                provider_used=local.id if imagery else None,
            )

        if self.source_mode == "remote":
            if not remote.enabled:
                return ProviderCallResult(
                    data=[],
                    source="fallback",
                    provider_used=None,
                    fallback_reason="Remote provider is not enabled",
                )
            try:
                imagery = remote.get_imagery(dataset_id, lat_min, lat_max, lon_min, lon_max)
                return ProviderCallResult(
                    data=imagery,
                    source="remote" if imagery else "fallback",
                    provider_used=remote.id if imagery else remote.id,
                    fallback_reason=None if imagery else "Remote provider returned no imagery",
                )
            except Exception as exc:
                return ProviderCallResult(
                    data=[],
                    source="fallback",
                    provider_used=remote.id,
                    fallback_reason=f"Remote provider error: {exc}",
                )

        # remote_with_fallback
        if remote.enabled:
            try:
                imagery = remote.get_imagery(dataset_id, lat_min, lat_max, lon_min, lon_max)
                if imagery:
                    return ProviderCallResult(
                        data=imagery,
                        source="remote",
                        provider_used=remote.id,
                    )
            except Exception:
                pass  # fall through to local

        imagery = local.get_imagery(dataset_id, lat_min, lat_max, lon_min, lon_max) if local.enabled else []
        return ProviderCallResult(
            data=imagery,
            source="local" if imagery else "fallback",
            provider_used=local.id if imagery else None,
            fallback_reason="Remote provider unavailable or returned no imagery" if remote.enabled
            else "Remote provider not enabled",
        )

    # ------------------------------------------------------------------ validation

    def validate_resource(self, dataset: DatasetMetadata) -> ValidationResult:
        """Validate a resource; never raises, returns a detailed result."""
        try:
            return self.validator.validate(dataset)
        except Exception as exc:
            return ValidationResult(
                valid=False,
                errors=(f"Validation error: {exc}",),
                warnings=(),
                checks={},
            )

    def validate_and_require(self, dataset: DatasetMetadata) -> DatasetMetadata:
        """Validate a dataset and raise AppError if invalid."""
        result = self.validate_resource(dataset)
        if not result.valid:
            raise AppError(
                400,
                "invalid_resource",
                f"Resource '{dataset.id}' failed validation: {'; '.join(result.errors)}",
                details={"warnings": list(result.warnings), "checks": {k: c.__dict__ for k, c in result.checks.items()}},
            )
        return dataset

    # ------------------------------------------------------------------ terrain grid access (existing backend integration)

    def get_terrain_grid(self, region_id: str):
        """Delegate to the existing terrain.get_grid for route planning.

        This preserves the existing backend route-planning integration
        without duplicating the A* logic or grid loading.
        """
        from app.services.terrain import get_grid as _get_grid
        return _get_grid(region_id, self.settings)

    # ------------------------------------------------------------------ internals

    @staticmethod
    def _invalid_sample(dataset_id: str, lat: float, lon: float, reason: str) -> ElevationSample:
        return ElevationSample(
            id="none",
            dataset_id=dataset_id,
            lat=lat,
            lon=lon,
            value=None,
            valid=False,
            units="metres",
            nodata=True,
        )
