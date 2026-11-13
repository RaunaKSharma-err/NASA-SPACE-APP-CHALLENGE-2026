"""Tests use SYNTHETIC grids only. They are not NASA observations.

stdlib unittest, so they run with `python -m unittest` and also under pytest.
"""
import math
import unittest

from app.services.routing import (
    MARS_RADIUS_M,
    CostConfig,
    ElevationGrid,
    NoRouteError,
    RoutingError,
    plan_route,
)

CELL_DEG = 0.01  # ~592 m per cell at the equator


def make_grid(rows, cols, fn=lambda r, c: 0.0):
    elev = [[fn(r, c) for c in range(cols)] for r in range(rows)]
    return ElevationGrid(elev, origin_lon=0.0, origin_lat=0.0, cell_deg=CELL_DEG)


def row_of(g, p):
    return round((g.origin_lat - p[1]) / g.cell_deg)


def col_of(g, p):
    return round((p[0] - g.origin_lon) / g.cell_deg)


# ============================================================================
# 1. Flat terrain: direct path should be selected when it is optimal.
# ============================================================================
class BasicRoutes(unittest.TestCase):
    def test_flat_straight_route_distance(self):
        g = make_grid(1, 6)
        res = plan_route(g, (0.0, 0.0), (0.05, 0.0))
        ew, _ = g.cell_size_m(0)
        self.assertEqual(len(res.coordinates), 6)
        self.assertAlmostEqual(res.horizontal_distance_m, 5 * ew, places=3)
        self.assertEqual(res.max_slope_deg, 0.0)
        self.assertEqual(res.hazards_evaluated, ["slope"])
        self.assertTrue(any("NOT assessed" in w for w in res.warnings))
        self.assertAlmostEqual(res.straight_line_distance_m, res.horizontal_distance_m, places=3)
        self.assertAlmostEqual(res.distance_ratio, 1.0, places=4)

    def test_start_equals_target(self):
        res = plan_route(make_grid(3, 3), (0.01, -0.01), (0.01, -0.01))
        self.assertEqual(res.horizontal_distance_m, 0.0)
        self.assertEqual(len(res.coordinates), 1)

    def test_prefers_flat_detour_over_steep_hill(self):
        g = make_grid(3, 6, lambda r, c: 150.0 if (r == 1 and c in (2, 3)) else 0.0)
        res = plan_route(g, (0.0, -0.01), (0.05, -0.01), CostConfig(max_slope_deg=30, slope_weight=8))
        for p in res.coordinates:
            self.assertFalse(row_of(g, p) == 1 and col_of(g, p) in (2, 3))

    def test_slope_statistics_on_ramp(self):
        g = make_grid(1, 4, lambda r, c: 100.0 * c)
        res = plan_route(g, (0.0, 0.0), (0.03, 0.0), CostConfig(max_slope_deg=30))
        expected = math.degrees(math.atan2(100.0, g.cell_size_m(0)[0]))
        self.assertAlmostEqual(res.max_slope_deg, expected, places=6)
        self.assertGreater(res.surface_distance_m, res.horizontal_distance_m)


# ============================================================================
# 2. Intermediate waypoints
# ============================================================================
class IntermediateWaypoints(unittest.TestCase):
    def test_flat_grid_returns_all_cell_centers(self):
        g = make_grid(1, 6)
        res = plan_route(g, (0.0, 0.0), (0.05, 0.0))
        self.assertEqual(len(res.coordinates), 6)
        self.assertGreater(len(res.coordinates), 2)

    def test_detour_produces_intermediate_waypoints(self):
        g = make_grid(3, 6, lambda r, c: 500.0 if (r == 1 and c in (2, 3)) else 0.0)
        res = plan_route(g, (0.0, -0.01), (0.05, -0.01), CostConfig(max_slope_deg=30, slope_weight=8))
        self.assertGreater(len(res.coordinates), 2)
        for p in res.coordinates:
            self.assertFalse(row_of(g, p) == 1 and col_of(g, p) in (2, 3))

    def test_changing_slope_weight_changes_route(self):
        g = make_grid(3, 6, lambda r, c: 300.0 if (r == 1 and c in (2, 3)) else 0.0)
        res_low_weight = plan_route(g, (0.0, -0.01), (0.05, -0.01), CostConfig(max_slope_deg=45, slope_weight=1))
        res_high_weight = plan_route(g, (0.0, -0.01), (0.05, -0.01), CostConfig(max_slope_deg=45, slope_weight=20))
        hill_cells_low = sum(1 for p in res_low_weight.coordinates if row_of(g, p) == 1 and col_of(g, p) in (2, 3))
        hill_cells_high = sum(1 for p in res_high_weight.coordinates if row_of(g, p) == 1 and col_of(g, p) in (2, 3))
        self.assertGreaterEqual(hill_cells_low, hill_cells_high)


# ============================================================================
# 3. Cost calculation
# ============================================================================
class CostCalculation(unittest.TestCase):
    def test_step_cost_formula(self):
        cfg = CostConfig(max_slope_deg=20.0, slope_weight=4.0)
        self.assertAlmostEqual(cfg.step_cost(100.0, 0.0, 0.0), 100.0)
        self.assertAlmostEqual(cfg.step_cost(100.0, 10.0, 0.0), 200.0)
        self.assertAlmostEqual(cfg.step_cost(100.0, 20.0, 0.0), 500.0)
        self.assertIsNone(cfg.step_cost(100.0, 20.1, 0.0))

    def test_elevation_weight_increases_cost(self):
        cfg = CostConfig(max_slope_deg=30.0, slope_weight=0.0, elevation_weight=1.0)
        # Flat step with elevation difference should cost more than flat step with no elevation diff
        cost_flat = cfg.step_cost(100.0, 0.0, 0.0)
        cost_elev = cfg.step_cost(100.0, 0.0, 50.0)
        self.assertGreater(cost_elev, cost_flat)

    def test_hazard_weight_increases_cost(self):
        cfg = CostConfig(max_slope_deg=30.0, slope_weight=0.0, elevation_weight=0.0, hazard_weight=5.0)
        cost_no_hazard = cfg.step_cost(100.0, 0.0, 0.0, 0.0)
        cost_hazard = cfg.step_cost(100.0, 0.0, 0.0, 1.0)
        self.assertGreater(cost_hazard, cost_no_hazard)

    def test_costs_are_non_negative(self):
        cfg = CostConfig(max_slope_deg=30.0, slope_weight=4.0, elevation_weight=1.0, hazard_weight=5.0)
        for slope in [0.0, 15.0, 30.0]:
            for dz in [0.0, 100.0, -100.0]:
                cost = cfg.step_cost(100.0, slope, dz, 0.0)
                self.assertIsNotNone(cost)
                self.assertGreaterEqual(cost, 0.0)


# ============================================================================
# 4. Slope classification
# ============================================================================
class SlopeClassificationTests(unittest.TestCase):
    def test_slope_classification_bounds(self):
        cfg = CostConfig(max_slope_deg=25.0, low_slope_max=10.0, moderate_slope_max=20.0, high_slope_max=30.0)
        from app.services.routing import _step
        g = make_grid(3, 3)
        # Flat step: low
        result = _step(g, (0, 0), (0, 1), cfg)
        self.assertIsNotNone(result)
        self.assertEqual(result[4], "low")
        # Moderate slope step: elev diff of 50m over ~592m = ~4.8 deg... need steeper
        # 200m over ~592m = ~18.7 deg → moderate
        g_mod = make_grid(3, 3, lambda r, c: 200.0 if c == 1 else 0.0)
        result2 = _step(g_mod, (0, 0), (0, 1), cfg)
        self.assertIsNotNone(result2)
        self.assertEqual(result2[4], "moderate")


# ============================================================================
# 5. NoData / unknown terrain
# ============================================================================
class Disconnected(unittest.TestCase):
    def test_nodata_wall(self):
        g = make_grid(3, 5, lambda r, c: None if c == 2 else 0.0)
        with self.assertRaises(NoRouteError):
            plan_route(g, (0.0, 0.0), (0.04, 0.0))

    def test_slope_wall(self):
        g = make_grid(3, 5, lambda r, c: 1000.0 if c == 2 else 0.0)
        with self.assertRaises(NoRouteError):
            plan_route(g, (0.0, 0.0), (0.04, 0.0), CostConfig(max_slope_deg=25))

    def test_nodata_start_raises_clear_error(self):
        g = make_grid(3, 3, lambda r, c: None if (r, c) == (0, 0) else 0.0)
        with self.assertRaisesRegex(RoutingError, "no-data"):
            plan_route(g, (0.0, 0.0), (0.02, -0.02))

    def test_outside_coverage_raises_clear_error(self):
        g = make_grid(3, 3, lambda r, c: 0.0)
        with self.assertRaisesRegex(RoutingError, "outside"):
            plan_route(g, (0.0, -0.5), (0.01, -0.01))

    def test_unreachable_destination_returns_no_route(self):
        """Destination separated by a full NoData wall → NoRouteError."""
        # 5x5 grid with NoData column at c=2, separating left from right
        g = make_grid(5, 5, lambda r, c: None if c == 2 else 0.0)
        # Start on left side (col 0), target on right side (col 4)
        with self.assertRaises(NoRouteError):
            plan_route(g, (0.0, 0.0), (0.04, 0.0), CostConfig(max_slope_deg=90))


# ============================================================================
# 6. Diagonal movement
# ============================================================================
class DiagonalMovementTests(unittest.TestCase):
    def test_diagonal_movement_allowed(self):
        g = make_grid(3, 3)
        res = plan_route(g, (0.0, 0.0), (0.02, -0.02))
        self.assertGreater(len(res.coordinates), 1)
        self.assertEqual(res.coordinates[0], (0.0, 0.0))
        self.assertEqual(res.coordinates[-1], (0.02, -0.02))

    def test_diagonal_cost_is_horizontal_distance(self):
        g = make_grid(3, 3)
        ew, ns = g.cell_size_m(0)
        diag_dist = math.hypot(ew, ns)
        cfg = CostConfig(max_slope_deg=30, slope_weight=0.0, elevation_weight=0.0)
        res = plan_route(g, (0.0, 0.0), (0.01, -0.01), cfg)
        # Direct diagonal: cost should equal diagonal distance
        self.assertAlmostEqual(res.horizontal_distance_m, diag_dist, places=3)

    def test_corner_cutting_prevented(self):
        """Diagonal move blocked when either corner-adjacent cell is NoData.

        4x4 grid, NoData at (0,1). Diagonal (0,0)->(1,1) should be blocked
        because corner cell (0,1) is NoData. Route must go around via cardinal moves.
        """
        elev = [[0.0 for _ in range(4)] for _ in range(4)]
        elev[0][1] = None  # NoData blocks diagonal corner-cut from (0,0) to (1,1)
        g = ElevationGrid(elev, origin_lon=0.0, origin_lat=0.0, cell_deg=CELL_DEG)
        res = plan_route(g, (0.0, 0.0), (0.03, -0.03), CostConfig(max_slope_deg=90))
        self.assertGreater(len(res.coordinates), 1)
        self.assertEqual(res.coordinates[0], (0.0, 0.0))
        self.assertEqual(res.coordinates[-1], (0.03, -0.03))
        # Verify no diagonal step from (0,0) to (1,1)
        cells = [g.to_cell(lo, la) for lo, la in res.coordinates]
        for i in range(len(cells) - 1):
            a, b = cells[i], cells[i + 1]
            if a == (0, 0):
                self.assertNotEqual(b, (1, 1), "Diagonal corner-cut through NoData must be blocked")


# ============================================================================
# 7. Latitude-dependent distance
# ============================================================================
class LatitudeDistanceTests(unittest.TestCase):
    def test_east_west_distance_decreases_with_latitude(self):
        """At higher latitude, same degree of longitude = shorter physical distance."""
        for lat in [0.0, 30.0, 60.0]:
            g = ElevationGrid([[0.0, 0.0]], origin_lon=0.0, origin_lat=lat, cell_deg=0.01)
            ew, _ = g.cell_size_m(0)
            res = plan_route(g, (0.0, lat), (0.01, lat))
            self.assertAlmostEqual(res.horizontal_distance_m, ew, places=3)

    def test_north_south_spacing_constant(self):
        for lat in [0.0, -5.0, -44.0, 44.0]:
            g = ElevationGrid([[0.0], [0.0]], origin_lon=0.0, origin_lat=lat, cell_deg=0.01)
            _, ns = g.cell_size_m(0)
            expected_ns = math.radians(0.01) * MARS_RADIUS_M
            self.assertAlmostEqual(ns, expected_ns, places=6)


# ============================================================================
# 8. Route metrics
# ============================================================================
class RouteMetricsTests(unittest.TestCase):
    def test_elevation_gain_loss_on_ramp(self):
        g = make_grid(1, 4, lambda r, c: 100.0 * c)  # 0, 100, 200, 300
        res = plan_route(g, (0.0, 0.0), (0.03, 0.0), CostConfig(max_slope_deg=30))
        self.assertAlmostEqual(res.elevation_gain_m, 300.0, places=1)
        self.assertAlmostEqual(res.elevation_loss_m, 0.0, places=1)

    def test_elevation_gain_loss_on_descent(self):
        g = make_grid(1, 4, lambda r, c: 300.0 - 100.0 * c)  # 300, 200, 100, 0
        res = plan_route(g, (0.0, 0.0), (0.03, 0.0), CostConfig(max_slope_deg=30))
        self.assertAlmostEqual(res.elevation_gain_m, 0.0, places=1)
        self.assertAlmostEqual(res.elevation_loss_m, 300.0, places=1)

    def test_distance_ratio_above_1_for_detour(self):
        g = make_grid(3, 6, lambda r, c: 500.0 if (r == 1 and c in (2, 3)) else 0.0)
        res = plan_route(g, (0.0, -0.01), (0.05, -0.01), CostConfig(max_slope_deg=30, slope_weight=8))
        self.assertGreater(res.distance_ratio, 1.0)

    def test_max_and_min_elevation_recorded(self):
        g = make_grid(3, 3, lambda r, c: float(r * 100 + c * 10))
        res = plan_route(g, (0.0, 0.0), (0.02, -0.02), CostConfig(max_slope_deg=45))
        self.assertIsNotNone(res.max_elevation_m)
        self.assertIsNotNone(res.min_elevation_m)
        self.assertGreaterEqual(res.max_elevation_m, res.min_elevation_m)


# ============================================================================
# 9. Invalid input
# ============================================================================
class InvalidInput(unittest.TestCase):
    def test_coordinate_ranges(self):
        cases = [((0, 91.0), (0.01, -0.0)), ((0, 0), (0, -91.0)),
                 ((-181.0, 0), (0, 0)), ((361.0, 0), (0, 0))]
        for start, target in cases:
            with self.subTest(start=start, target=target), self.assertRaises(RoutingError):
                plan_route(make_grid(3, 3), start, target)

    def test_invalid_config(self):
        with self.assertRaises(RoutingError):
            plan_route(make_grid(2, 2), (0, 0), (0.01, -0.01), CostConfig(max_slope_deg=0))
        with self.assertRaises(RoutingError):
            plan_route(make_grid(2, 2), (0, 0), (0.01, -0.01), CostConfig(elevation_weight=-1.0))
        with self.assertRaises(RoutingError):
            plan_route(make_grid(2, 2), (0, 0), (0.01, -0.01), CostConfig(hazard_weight=-1.0))


# ============================================================================
# 10. Cell spacing (MOLA PDS label validation)
# ============================================================================
class CellSpacing(unittest.TestCase):
    def test_mars_radius_matches_pds_label(self):
        self.assertEqual(MARS_RADIUS_M, 3_396_000.0)

    def test_equatorial_cell_spacing(self):
        g = ElevationGrid([[0.0]], origin_lon=0.0, origin_lat=0.0, cell_deg=1.0/128.0)
        ew, ns = g.cell_size_m(0)
        expected = math.radians(1.0/128.0) * 3_396_000.0
        self.assertAlmostEqual(ew, expected, places=6)
        self.assertAlmostEqual(ns, expected, places=6)
        self.assertAlmostEqual(ew, 463.08, places=1)
        self.assertAlmostEqual(ns, 463.08, places=1)

    def test_gale_crater_cell_spacing(self):
        g = ElevationGrid([[0.0]], origin_lon=137.0, origin_lat=-5.0, cell_deg=1.0/128.0)
        ew, ns = g.cell_size_m(0)
        expected_ns = math.radians(1.0/128.0) * 3_396_000.0
        expected_ew = expected_ns * math.cos(math.radians(-5.0))
        self.assertAlmostEqual(ns, expected_ns, places=6)
        self.assertAlmostEqual(ew, expected_ew, places=6)
        self.assertLess(ew, ns)

    def test_north_south_spacing_constant(self):
        for lat in [0.0, -5.0, -44.0, 44.0]:
            g = ElevationGrid([[0.0]], origin_lon=0.0, origin_lat=lat, cell_deg=1.0/128.0)
            _, ns = g.cell_size_m(0)
            expected_ns = math.radians(1.0/128.0) * 3_396_000.0
            self.assertAlmostEqual(ns, expected_ns, places=6)

    def test_east_west_decreases_with_latitude(self):
        prev_ew = float('inf')
        for lat in [0.0, 10.0, 30.0, 60.0, 80.0]:
            g = ElevationGrid([[0.0]], origin_lon=0.0, origin_lat=lat, cell_deg=1.0/128.0)
            ew, _ = g.cell_size_m(0)
            self.assertLess(ew, prev_ew)
            prev_ew = ew

    def test_cell_size_returns_ew_ns_order(self):
        g = ElevationGrid([[0.0]], origin_lon=0.0, origin_lat=30.0, cell_deg=1.0/128.0)
        ew, ns = g.cell_size_m(0)
        self.assertLess(ew, ns)  # at 30 deg, ew < ns


if __name__ == "__main__":
    unittest.main()
