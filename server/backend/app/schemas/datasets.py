from typing import Literal

from pydantic import BaseModel, Field

Status = Literal["verified", "unverified", "synthetic", "partial"]


class DatasetProvenance(BaseModel):
    id: str
    name: str
    authoritative_source: str
    access_url: str | None = None  # only fill after the URL was actually checked
    format: str
    crs: str | None = None
    coverage: str
    resolution: str | None = None
    units: str | None = None
    license: str | None = None
    storage_estimate_mb: float | None = None
    processing_steps: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    status: Status = "unverified"
    verified_on: str | None = None  # ISO date
    terrain_file: str | None = None  # .asc file name inside data/processed/<region_id>/ (elevation in metres, degrees)


class Region(BaseModel):
    id: str
    name: str
    bbox: list[float] = Field(min_length=4, max_length=4, description="[min_lon, min_lat, max_lon, max_lat]")
    description: str = ""
    layer_ids: list[str] = Field(default_factory=list)
    terrain_dataset_id: str | None = None
    status: Status = "unverified"
