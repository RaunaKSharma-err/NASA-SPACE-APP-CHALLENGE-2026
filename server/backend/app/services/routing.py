"""Terrain-aware route planning on a regular elevation grid. Pure Python: no HTTP, no DB.

Evaluated hazard dimension: SLOPE ONLY (derived from the elevation grid).
Nothing else (rocks, sand, thermal, radiation, dust) is evaluated. A returned
route is "slope-feasible under these settings", never "safe".
"""
from __future__ import annotations

import heapq
import math
from dataclasses import dataclass, field
from itertools import pairwise

MARS_RADIUS_M = 3_396_000.0  # MOLA PDS label A/B/C_AXIS_RADIUS (3396.0 km)


class RoutingError(ValueError):
    """Invalid input or missing coverage (map to HTTP 422 in the API layer)."""


class NoRouteError(RoutingError):
    """Both points are valid but no path satisfies the constraints."""


# ---------------------------------------------------------------------------
# Slope classification thresholds (degrees). Provisional rover-navigation
# parameters — not verified universal Mars rover safety limits.
# ---------------------------------------------------------------------------
class SlopeClass:
    LOW = "low"          # normal traversal
    MODERATE = "moderate"  # increased traversal cost
    HIGH = "high"        # severe penalty
    BLOCKED = "blocked"  # beyond max safe slope


@dataclass(frozen=True)
class ElevationGrid:
    """North-up grid. elevation[row][col] in metres; None = no data.

    origin_lon/origin_lat: coordinates of the TOP-LEFT CELL CENTRE (degrees).
    cell_deg: cell size in degrees (square cells in lon/lat).
    """

    elevation: list[list[float | None]]
    origin_lon: float
    origin_lat: float
    cell_deg: float

    @property
    def rows(self) -> int:
        return len(self.elevation)

    @property
    def cols(self) -> int:
        return len(self.elevation[0]) if self.elevation else 0

    def cell_size_m(self, row: int) -> tuple[float, float]:
        """(east-west, north-south) cell size in metres at a row (equirectangular)."""
        lat = self.origin_lat - row * self.cell_deg
        ns = math.radians(self.cell_deg) * MARS_RADIUS_M
        return ns * math.cos(math.radians(lat)), ns

    def to_cell(self, lon: float, lat: float) -> tuple[int, int]:
        col = round((lon - self.origin_lon) / self.cell_deg)
        row = round((self.origin_lat - lat) / self.cell_deg)
        if not (0 <= row < self.rows and 0 <= col < self.cols):
            raise RoutingError(f"({lon}, {lat}) is outside the terrain coverage")
        if self.elevation[row][col] is None:
            raise RoutingError(f"({lon}, {lat}) falls on a no-data cell")
        return row, col

    def to_lonlat(self, row: int, col: int) -> tuple[float, float]:
        return self.origin_lon + col * self.cell_deg, self.origin_lat - row * self.cell_deg


@dataclass(frozen=True)
class SlopeClassification:
    low_max: float = 10.0      # below: normal cost
    moderate_max: float = 20.0 # below: increased cost
    high_max: float = 30.0     # below: severe penalty
    blocked_max: float = 45.0  # at/above: impassable (overrides max_slope_deg if lower)

    def classify(self, slope_deg: float) -> str:
        if slope_deg < self.low_max:
            return SlopeClass.LOW
        if slope_deg < self.moderate_max:
            return SlopeClass.MODERATE
        if slope_deg < self.high_max:
            return SlopeClass.HIGH
        return SlopeClass.BLOCKED


@dataclass(frozen=True)
class CostConfig:
    """Terrain-aware movement cost configuration.

    movement_cost = distance * (
        1 + slope_weight * slope_penalty +
        elevation_weight * elevation_penalty +
        hazard_weight * hazard_penalty
    )

    slope_penalty = (slope_deg / max_slope_deg)^2, clamped to [0, 1].
    elevation_penalty = abs(delta_h) / max_slope_deg_scaled (normalised).
    hazard_penalty = 1.0 if cell has a known hazard, else 0.0.

    All weights are dimensionless multipliers. All thresholds are in degrees
    or metres as documented.
    """

    max_slope_deg: float = 25.0          # impassable slope threshold (deg)
    slope_weight: float = 4.0            # multiplier for slope penalty term
    elevation_weight: float = 0.5        # multiplier for elevation-difference term
    hazard_weight: float = 10.0          # multiplier for hazard penalty term
    low_slope_max: float = 10.0          # low-slope classification threshold (deg)
    moderate_slope_max: float = 20.0     # moderate-slope classification threshold (deg)
    high_slope_max: float = 30.0         # high-slope classification threshold (deg)

    def step_cost(
        self,
        horizontal_m: float,
        slope_deg: float,
        delta_h: float,
        hazard_penalty: float = 0.0,
    ) -> float | None:
        """Return movement cost for a step, or None if impassable."""
        if slope_deg > self.max_slope_deg:
            return None
        slope_penalty = min(1.0, (slope_deg / self.max_slope_deg) ** 2)
        # Normalise elevation difference to a 0-1 penalty using max_slope_deg
        # as a reference vertical scale (metres per degree of slope at 1 cell)
        elevation_penalty = min(1.0, abs(delta_h) / (self.max_slope_deg * 10.0))
        cost = horizontal_m * (
            1.0
            + self.slope_weight * slope_penalty
            + self.elevation_weight * elevation_penalty
            + self.hazard_weight * hazard_penalty
        )
        return max(cost, 0.0)


@dataclass
class RouteResult:
    coordinates: list[tuple[float, float]]  # (lon, lat)
    horizontal_distance_m: float
    surface_distance_m: float
    total_cost: float
    max_slope_deg: float
    mean_slope_deg: float
    straight_line_distance_m: float = 0.0
    distance_ratio: float = 1.0
    elevation_gain_m: float = 0.0
    elevation_loss_m: float = 0.0
    max_elevation_m: float | None = None
    min_elevation_m: float | None = None
    high_slope_segments: int = 0
    no_data_cells_encountered: int = 0
    hazards_evaluated: list[str] = field(default_factory=lambda: ["slope"])
    assumptions: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Movement: 8-connected neighbours
# ---------------------------------------------------------------------------

_NEIGHBOURS = [
    (-1, 0), (1, 0), (0, -1), (0, 1),   # cardinal (N, S, W, E)
    (-1, -1), (-1, 1), (1, -1), (1, 1),  # diagonal (NW, NE, SW, SE)
]

_DIAGONAL_PAIRS = [
    # (dr, dc, block_r1, block_c1, block_r2, block_c2) — for diagonal move (dr,dc),
    # block if either of the two corner-adjacent cardinal cells is impassable
    (-1, -1, -1, 0, 0, -1),
    (-1, 1, -1, 0, 0, 1),
    (1, -1, 1, 0, 0, -1),
    (1, 1, 1, 0, 0, 1),
]


def _validate_lonlat(lon: float, lat: float, label: str) -> None:
    if not (-90.0 <= lat <= 90.0):
        raise RoutingError(f"{label} latitude {lat} out of range [-90, 90]")
    if not (-180.0 <= lon <= 360.0):
        raise RoutingError(f"{label} longitude {lon} out of range [-180, 360]")


def _step(
    grid: ElevationGrid,
    a: tuple[int, int],
    b: tuple[int, int],
    cfg: CostConfig,
    hazard_fn=None,
) -> tuple[float, float, float, float, str] | None:
    """Return (cost, horizontal_m, surface_m, slope_deg, slope_class), or None if impassable.

    Also prevents diagonal corner-cutting: a diagonal move is blocked if either
    of the two intermediate cardinal cells is impassable (NoData or above
    max slope).
    """
    za, zb = grid.elevation[a[0]][a[1]], grid.elevation[b[0]][b[1]]
    if za is None or zb is None:
        return None

    # Diagonal corner-cutting prevention
    dr, dc = b[0] - a[0], b[1] - a[1]
    if abs(dr) == 1 and abs(dc) == 1:
        for ddr, ddc, br1, bc1, br2, bc2 in _DIAGONAL_PAIRS:
            if ddr == dr and ddc == dc:
                for br_, bc_ in ((br1, bc1), (br2, bc2)):
                    corner = (a[0] + br_, a[1] + bc_)
                    if not (0 <= corner[0] < grid.rows and 0 <= corner[1] < grid.cols):
                        return None
                    cz = grid.elevation[corner[0]][corner[1]]
                    if cz is None:
                        return None
                    # Also check if corner cell itself is above max slope from `a`
                    c_ew, c_ns = grid.cell_size_m((a[0] + corner[0]) // 2)
                    c_h = math.hypot((corner[1] - a[1]) * c_ew, (corner[0] - a[0]) * c_ns)
                    c_dz = cz - za
                    c_slope = math.degrees(math.atan2(abs(c_dz), c_h)) if c_h > 0 else 0.0
                    if c_slope > cfg.max_slope_deg:
                        return None
                break

    ew, ns = grid.cell_size_m((a[0] + b[0]) // 2)
    horiz = math.hypot((b[1] - a[1]) * ew, (b[0] - a[0]) * ns)
    dz = zb - za
    slope = math.degrees(math.atan2(abs(dz), horiz)) if horiz > 0 else 0.0

    # Hazard penalty from caller-provided function (returns 0.0 if none)
    hazard_penalty = 0.0
    if hazard_fn is not None:
        try:
            hazard_penalty = hazard_fn(b[0], b[1], za, zb)
        except Exception:
            hazard_penalty = 0.0

    cost = cfg.step_cost(horiz, slope, dz, hazard_penalty)
    if cost is None:
        return None

    surface = math.hypot(horiz, dz)
    sc = SlopeClassification(
        low_max=cfg.low_slope_max,
        moderate_max=cfg.moderate_slope_max,
        high_max=cfg.high_slope_max,
        blocked_max=cfg.max_slope_deg,
    ).classify(slope)

    return cost, horiz, surface, slope, sc


def plan_route(
    grid: ElevationGrid,
    start: tuple[float, float],
    target: tuple[float, float],
    cfg: CostConfig | None = None,
    hazard_fn=None,
) -> RouteResult:
    """A* over an 8-connected grid. start/target are (lon, lat) in degrees.

    hazard_fn: optional callable(row, col, elev_from, elev_to) -> float penalty.
               Returns 0.0 when no hazard data is available.
    """
    cfg = cfg or CostConfig()
    if cfg.max_slope_deg <= 0 or cfg.slope_weight < 0:
        raise RoutingError("max_slope_deg must be > 0 and slope_weight >= 0")
    if cfg.elevation_weight < 0 or cfg.hazard_weight < 0:
        raise RoutingError("elevation_weight and hazard_weight must be >= 0")
    if grid.rows == 0 or grid.cols == 0:
        raise RoutingError("Terrain grid is empty")
    _validate_lonlat(*start, "start")
    _validate_lonlat(*target, "target")
    s, t = grid.to_cell(*start), grid.to_cell(*target)

    def h(c: tuple[int, int]) -> float:  # admissible: step cost >= horizontal distance
        ew, ns = grid.cell_size_m(c[0])
        return math.hypot((c[1] - t[1]) * ew, (c[0] - t[0]) * ns)

    best = {s: 0.0}
    parent: dict[tuple[int, int], tuple[int, int]] = {}
    heap = [(h(s), s)]
    closed: set[tuple[int, int]] = set()

    while heap:
        _, cur = heapq.heappop(heap)
        if cur in closed:
            continue
        if cur == t:
            break
        closed.add(cur)
        for dr, dc in _NEIGHBOURS:
            nxt = (cur[0] + dr, cur[1] + dc)
            if not (0 <= nxt[0] < grid.rows and 0 <= nxt[1] < grid.cols) or nxt in closed:
                continue
            st = _step(grid, cur, nxt, cfg, hazard_fn)
            if st is None:
                continue
            cost, _hz, _sf, _sl, _sc = st
            g = best[cur] + cost
            if g < best.get(nxt, math.inf):
                best[nxt] = g
                parent[nxt] = cur
                heapq.heappush(heap, (g + h(nxt), nxt))

    if t not in best:
        raise NoRouteError(
            "No path satisfies the slope limit / data coverage constraints. "
            "Start or destination may be on no-data cells, or terrain may block all routes."
        )

    cells = [t]
    while cells[-1] != s:
        cells.append(parent[cells[-1]])
    cells.reverse()

    # Compute route metrics from actual path
    horiz_total = surf_total = 0.0
    elev_gain = elev_loss = 0.0
    slopes: list[float] = []
    high_slope_count = 0
    no_data_count = 0
    elevs: list[float] = []

    for a, b in pairwise(cells):
        st = _step(grid, a, b, cfg, hazard_fn)  # type: ignore[misc]
        if st is None:
            # Should not happen on a valid path, but guard anyway
            no_data_count += 1
            continue
        _, hz, sf, sl, sc = st
        horiz_total += hz
        surf_total += sf
        slopes.append(sl)
        za = grid.elevation[a[0]][a[1]] or 0.0
        zb = grid.elevation[b[0]][b[1]] or 0.0
        elevs.extend([za, zb])
        dz = zb - za
        if dz > 0:
            elev_gain += dz
        elif dz < 0:
            elev_loss += abs(dz)
        if sc == SlopeClass.HIGH:
            high_slope_count += 1

    # Straight-line distance between start and target (haversine on Mars)
    start_lon, start_lat = start
    target_lon, target_lat = target
    d_lat = math.radians(target_lat - start_lat)
    d_lon = math.radians(target_lon - start_lon)
    a_h = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(start_lat))
        * math.cos(math.radians(target_lat))
        * math.sin(d_lon / 2) ** 2
    )
    straight_line = MARS_RADIUS_M * 2 * math.atan2(math.sqrt(a_h), math.sqrt(1 - a_h))

    distance_ratio = (horiz_total / straight_line) if straight_line > 0 else 1.0

    max_elev = max(elevs) if elevs else None
    min_elev = min(elevs) if elevs else None

    return RouteResult(
        coordinates=[grid.to_lonlat(*c) for c in cells],
        horizontal_distance_m=horiz_total,
        surface_distance_m=surf_total,
        straight_line_distance_m=straight_line,
        distance_ratio=distance_ratio,
        total_cost=best[t],
        max_slope_deg=max(slopes, default=0.0),
        mean_slope_deg=sum(slopes) / len(slopes) if slopes else 0.0,
        elevation_gain_m=elev_gain,
        elevation_loss_m=elev_loss,
        max_elevation_m=max_elev,
        min_elevation_m=min_elev,
        high_slope_segments=high_slope_count,
        no_data_cells_encountered=no_data_count,
        assumptions=[
            "Slope is computed between adjacent cell centres, so it depends on grid resolution.",
            "Degrees are converted to metres with an equirectangular spherical approximation.",
            (
                f"Slope limit {cfg.max_slope_deg} deg and weight {cfg.slope_weight} are configurable "
                "placeholders, not validated rover specifications."
            ),
            "Diagonal movement is allowed; corner-cutting through blocked cells is prevented.",
        ],
        warnings=[
            "Only slope was evaluated. Rocks, loose regolith, thermal, dust and radiation were NOT assessed.",
            "This is a slope-feasible route, not a verified safe route.",
            "Hazard layers beyond slope-derived classification are not available.",
        ],
    )
