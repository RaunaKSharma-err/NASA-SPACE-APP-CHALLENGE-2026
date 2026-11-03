from pydantic import BaseModel, Field


class Coordinate(BaseModel):
    lon: float = Field(ge=-180, le=360)
    lat: float = Field(ge=-90, le=90)


class RoutePlanRequest(BaseModel):
    region_id: str
    start: Coordinate
    target: Coordinate
    max_slope_deg: float = Field(default=25.0, gt=0, le=90)
    slope_weight: float = Field(default=4.0, ge=0, le=100)


class RoutePlanResponse(BaseModel):
    region_id: str
    terrain_status: str  # "synthetic" or the dataset status backing the grid
    coordinates: list[Coordinate]
    horizontal_distance_m: float
    surface_distance_m: float
    total_cost: float
    max_slope_deg: float
    mean_slope_deg: float
    hazards_evaluated: list[str]
    assumptions: list[str]
    warnings: list[str]
