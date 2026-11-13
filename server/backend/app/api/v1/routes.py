from fastapi import APIRouter

from app.core.config import get_settings
from app.core.errors import AppError
from app.schemas.routes import Coordinate, RoutePlanRequest, RoutePlanResponse
from app.services.routing import CostConfig, NoRouteError, RoutingError, plan_route
from app.services.terrain import get_grid

router = APIRouter()


@router.post("/routes/plan", response_model=RoutePlanResponse)
def plan(req: RoutePlanRequest) -> RoutePlanResponse:
    found = get_grid(req.region_id, get_settings())
    if found is None:
        raise AppError(404, "terrain_unavailable",
                       f"No terrain coverage is available for region '{req.region_id}'.")
    grid, status = found
    cfg = CostConfig(
        max_slope_deg=req.max_slope_deg,
        slope_weight=req.slope_weight,
        elevation_weight=req.elevation_weight,
        hazard_weight=req.hazard_weight,
    )
    try:
        r = plan_route(grid, (req.start.lon, req.start.lat), (req.target.lon, req.target.lat), cfg)
    except NoRouteError as e:
        raise AppError(422, "no_route", str(e)) from e
    except RoutingError as e:
        raise AppError(422, "invalid_route_request", str(e)) from e
    warnings = list(r.warnings)
    if status == "synthetic":
        warnings.insert(0, "SYNTHETIC terrain fixture: not real Mars data.")
    elif status != "verified":
        warnings.insert(0, f"Terrain dataset status is '{status}', not 'verified'.")
    return RoutePlanResponse(
        region_id=req.region_id, terrain_status=status,
        coordinates=[Coordinate(lon=lo, lat=la) for lo, la in r.coordinates],
        horizontal_distance_m=r.horizontal_distance_m,
        surface_distance_m=r.surface_distance_m,
        straight_line_distance_m=r.straight_line_distance_m,
        distance_ratio=r.distance_ratio,
        total_cost=r.total_cost,
        max_slope_deg=r.max_slope_deg,
        mean_slope_deg=r.mean_slope_deg,
        elevation_gain_m=r.elevation_gain_m,
        elevation_loss_m=r.elevation_loss_m,
        max_elevation_m=r.max_elevation_m,
        min_elevation_m=r.min_elevation_m,
        high_slope_segments=r.high_slope_segments,
        no_data_cells_encountered=r.no_data_cells_encountered,
        hazards_evaluated=r.hazards_evaluated,
        assumptions=r.assumptions,
        warnings=warnings,
    )
