"""Pydantic schemas for the provider-based scientific data API.

These schemas define the contract between frontend and backend for
provider-agnostic scientific data access. No NASA endpoints or schemas
are assumed — all fields are provider-agnostic.
"""

from typing import Any, Literal

from pydantic import BaseModel, Field

SourceMode = Literal["local", "remote", "remote_with_fallback"]
DataSource = Literal["local", "remote", "fallback"]


class ProviderInfo(BaseModel):
    id: str
    type: str                      # "local" | "remote"
    enabled: bool
    priority: int
    capabilities: list[str]
    requires_auth: bool


class SourceModeRequest(BaseModel):
    mode: SourceMode = "local"


class SourceModeResponse(BaseModel):
    mode: SourceMode
    remote_enabled: bool
    remote_configured: bool      # base_url is set


class DatasetOut(BaseModel):
    id: str
    name: str
    type: str
    source: str
    format: str
    crs_name: str
    crs_authority: str | None = None
    crs_code: str | None = None
    crs_units: str = "degrees"
    lon_min: float = -180.0
    lon_max: float = 180.0
    lat_min: float = -90.0
    lat_max: float = 90.0
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
    processing_steps: list[str] = Field(default_factory=list)
    license: str | None = None
    limitations: list[str] = Field(default_factory=list)
    status: str = "unverified"
    validated_at: str | None = None
    size_bytes: int | None = None
    checksum: str | None = None
    terrain_file: str | None = None


class DatasetListResponse(BaseModel):
    datasets: list[DatasetOut]
    source: DataSource
    mode: SourceMode
    provider_used: str | None = None
    fallback_reason: str | None = None


class ElevationRequest(BaseModel):
    dataset_id: str
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=360)


class ElevationOut(BaseModel):
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


class ElevationResponse(BaseModel):
    sample: ElevationOut
    source: DataSource
    mode: SourceMode
    provider_used: str | None = None
    fallback_reason: str | None = None


class ImageryOut(BaseModel):
    id: str
    dataset_id: str
    bounds: dict[str, Any]
    url: str | None = None
    format: str = "png"
    attribution: dict[str, Any]


class ImageryResponse(BaseModel):
    imagery: list[ImageryOut]
    source: DataSource
    mode: SourceMode
    provider_used: str | None = None
    fallback_reason: str | None = None


class ValidationCheckOut(BaseModel):
    passed: bool
    message: str
    detail: Any | None = None


class ValidationResultOut(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    checks: dict[str, ValidationCheckOut] = Field(default_factory=dict)


class ProviderHealthResponse(BaseModel):
    local_enabled: bool
    remote_enabled: bool
    remote_configured: bool
    source_mode: SourceMode
    providers: list[ProviderInfo]
