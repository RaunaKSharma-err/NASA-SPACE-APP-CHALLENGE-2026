"""Abstract base class for scientific data providers.

All providers implement the same interface so the ProviderManager can
switch between them without knowing the underlying source format.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class ProviderCapabilities:
    capabilities: tuple[str, ...] = field(default_factory=tuple)
    supports_streaming: bool = False
    supports_caching: bool = False
    requires_auth: bool = False


@dataclass(frozen=True)
class DatasetMetadata:
    """Provider-agnostic dataset descriptor."""

    id: str
    name: str
    type: str                      # "elevation" | "imagery" | "composition" | ...
    source: str                    # e.g. "MGS/MOLA", "MRO/CRISM"
    format: str                    # e.g. "Esri ASCII Grid", "GeoTIFF", "JSON"
    crs_name: str
    crs_authority: str | None = None
    crs_code: str | None = None
    lon_min: float = -180.0
    lon_max: float = 180.0
    lat_min: float = -90.0
    lat_max: float = 90.0
    crs_units: str = "degrees"
    crs_type: str = "geographic"      # "geographic" | "projected" | "unknown"
    transformation_required: bool = False
    resolution_value: float = 0.0
    resolution_unit: str = "metres"
    value_unit: str = "unknown"
    value_reference: str | None = None
    organization: str = "Unknown"
    dataset_title: str = "Unknown"
    source_url: str | None = None
    access_url: str | None = None
    acquisition_date: str | None = None
    processing_date: str | None = None
    processing_steps: tuple[str, ...] = field(default_factory=tuple)
    license: str | None = None
    limitations: tuple[str, ...] = field(default_factory=tuple)
    status: str = "unverified"
    validated_at: str | None = None
    validation_notes: tuple[str, ...] = field(default_factory=tuple)
    size_bytes: int | None = None
    checksum: str | None = None
    terrain_file: str | None = None


@dataclass(frozen=True)
class ValidationCheck:
    passed: bool
    message: str
    detail: object | None = None


@dataclass(frozen=True)
class ValidationResult:
    valid: bool
    errors: tuple[str, ...] = field(default_factory=tuple)
    warnings: tuple[str, ...] = field(default_factory=tuple)
    checks: dict[str, ValidationCheck] = field(default_factory=dict)


@dataclass(frozen=True)
class ElevationSample:
    id: str
    dataset_id: str
    lat: float
    lon: float
    value: float | None
    valid: bool
    units: str
    nodata: bool
    crs_name: str = "Simple cylindrical (planetocentric)"
    crs_units: str = "degrees"


class ProviderUnavailable(RuntimeError):
    """Raised when a provider cannot fulfill a request."""


class BaseProvider(ABC):
    """Abstract base for all scientific data providers."""

    id: str
    type: str                      # "local" | "remote"
    enabled: bool
    priority: int                  # lower = tried first
    capabilities: ProviderCapabilities

    @abstractmethod
    def list_datasets(self, region_id: str | None = None, dtype: str | None = None) -> list[DatasetMetadata]:
        ...

    @abstractmethod
    def sample_elevation(self, dataset_id: str, lat: float, lon: float) -> ElevationSample:
        ...

    @abstractmethod
    def get_imagery(self, dataset_id: str, lat_min: float, lat_max: float, lon_min: float, lon_max: float) -> list[dict]:
        ...

    @abstractmethod
    def validate_resource(self, dataset: DatasetMetadata) -> ValidationResult:
        ...
