"""Route planning on a regular elevation grid. Pure Python: no HTTP, no DB.

Evaluated hazard dimension: SLOPE ONLY (derived from the elevation grid).
Nothing else (rocks, sand, thermal, radiation, dust) is evaluated. A returned
route is "slope-feasible under these settings", never "safe".
"""
from __future__ import annotations

import heapq
import math
from dataclasses import dataclass, field
from itertools import pairwise

MARS_RADIUS_M = 3_396_000.0  # MOLA PDS label A/B/C_AXIS_RADIUS (3396.0 km); used to convert degrees to metres


class RoutingError(ValueError):
    """Invalid input or missing coverage (map to HTTP 422 in the API layer)."""


class NoRouteError(RoutingError):
    """Both points are valid but no path satisfies the constraints."""


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
class CostConfig:
    max_slope_deg: float = 25.0  # PLACEHOLDER default, not a validated rover limit
    slope_weight: float = 4.0  # step cost = horizontal * (1 + w * (slope/max)^2)

    def step_cost(self, horizontal_m: float, slope_deg: float) -> float | None:
        if slope_deg > self.max_slope_deg:
            return None
        return horizontal_m * (1.0 + self.slope_weight * (slope_deg / self.max_slope_deg) ** 2)


@dataclass
class RouteResult:
    coordinates: list[tuple[float, float]]  # (lon, lat)
    horizontal_distance_m: float
    surface_distance_m: float
    total_cost: float
    max_slope_deg: float
    mean_slope_deg: float
    hazards_evaluated: list[str] = field(default_factory=lambda: ["slope"])
    assumptions: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


_NEIGHBOURS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def _validate_lonlat(lon: float, lat: float, label: str) -> None:
    if not (-90.0 <= lat <= 90.0):
        raise RoutingError(f"{label} latitude {lat} out of range [-90, 90]")
    if not (-180.0 <= lon <= 360.0):
        raise RoutingError(f"{label} longitude {lon} out of range [-180, 360]")


def _step(grid: ElevationGrid, a: tuple[int, int], b: tuple[int, int], cfg: CostConfig):
    """Return (cost, horizontal_m, surface_m, slope_deg), or None if impassable."""
    za, zb = grid.elevation[a[0]][a[1]], grid.elevation[b[0]][b[1]]
    if za is None or zb is None:
        return None
    ew, ns = grid.cell_size_m((a[0] + b[0]) // 2)
    horiz = math.hypot((b[1] - a[1]) * ew, (b[0] - a[0]) * ns)
    dz = zb - za
    slope = math.degrees(math.atan2(abs(dz), horiz))
    cost = cfg.step_cost(horiz, slope)
    if cost is None:
        return None
    return cost, horiz, math.hypot(horiz, dz), slope


def plan_route(
    grid: ElevationGrid,
    start: tuple[float, float],
    target: tuple[float, float],
    cfg: CostConfig | None = None,
) -> RouteResult:
    """A* over an 8-connected grid. start/target are (lon, lat) in degrees."""
    cfg = cfg or CostConfig()
    if cfg.max_slope_deg <= 0 or cfg.slope_weight < 0:
        raise RoutingError("max_slope_deg must be > 0 and slope_weight >= 0")
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
            st = _step(grid, cur, nxt, cfg)
            if st is None:
                continue
            g = best[cur] + st[0]
            if g < best.get(nxt, math.inf):
                best[nxt] = g
                parent[nxt] = cur
                heapq.heappush(heap, (g + h(nxt), nxt))
    if t not in best:
        raise NoRouteError("No path satisfies the slope limit / data coverage constraints")

    cells = [t]
    while cells[-1] != s:
        cells.append(parent[cells[-1]])
    cells.reverse()

    horiz_total = surf_total = 0.0
    slopes: list[float] = []
    for a, b in pairwise(cells):
        _, hz, sf, sl = _step(grid, a, b, cfg)  # type: ignore[misc]
        horiz_total += hz
        surf_total += sf
        slopes.append(sl)
    return RouteResult(
        coordinates=[grid.to_lonlat(*c) for c in cells],
        horizontal_distance_m=horiz_total,
        surface_distance_m=surf_total,
        total_cost=best[t],
        max_slope_deg=max(slopes, default=0.0),
        mean_slope_deg=sum(slopes) / len(slopes) if slopes else 0.0,
        assumptions=[
            "Slope is computed between adjacent cell centres, so it depends on grid resolution.",
            "Degrees are converted to metres with an equirectangular spherical approximation.",
            (
                f"Slope limit {cfg.max_slope_deg} deg and weight {cfg.slope_weight} are configurable "
                "placeholders, not validated rover specifications."
            ),
        ],
        warnings=[
            "Only slope was evaluated. Rocks, loose regolith, thermal, dust and radiation were NOT assessed.",
            "This is a slope-feasible route, not a verified safe route.",
        ],
    )
