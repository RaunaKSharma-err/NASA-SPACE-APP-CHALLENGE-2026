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


class CostCalculation(unittest.TestCase):
    def test_step_cost_formula(self):
        cfg = CostConfig(max_slope_deg=20.0, slope_weight=4.0)
        self.assertAlmostEqual(cfg.step_cost(100.0, 0.0), 100.0)
        self.assertAlmostEqual(cfg.step_cost(100.0, 10.0), 200.0)
        self.assertAlmostEqual(cfg.step_cost(100.0, 20.0), 500.0)
        self.assertIsNone(cfg.step_cost(100.0, 20.1))


class Disconnected(unittest.TestCase):
    def test_nodata_wall(self):
        g = make_grid(3, 5, lambda r, c: None if c == 2 else 0.0)
        with self.assertRaises(NoRouteError):
            plan_route(g, (0.0, 0.0), (0.04, 0.0))

    def test_slope_wall(self):
        g = make_grid(3, 5, lambda r, c: 1000.0 if c == 2 else 0.0)
        with self.assertRaises(NoRouteError):
            plan_route(g, (0.0, 0.0), (0.04, 0.0), CostConfig(max_slope_deg=25))


class InvalidInput(unittest.TestCase):
    def test_coordinate_ranges(self):
        cases = [((0, 91.0), (0.01, 0)), ((0, 0), (0, -91.0)),
                 ((-181.0, 0), (0, 0)), ((361.0, 0), (0, 0))]
        for start, target in cases:
            with self.subTest(start=start, target=target), self.assertRaises(RoutingError):
                plan_route(make_grid(3, 3), start, target)

    def test_outside_coverage_and_nodata_endpoint(self):
        g = make_grid(3, 3, lambda r, c: None if (r, c) == (0, 0) else 0.0)
        with self.assertRaisesRegex(RoutingError, "outside"):
            plan_route(g, (0.0, -0.5), (0.01, 0.0))
        with self.assertRaisesRegex(RoutingError, "no-data"):
            plan_route(g, (0.0, 0.0), (0.02, 0.0))

    def test_invalid_config(self):
        with self.assertRaises(RoutingError):
            plan_route(make_grid(2, 2), (0, 0), (0.01, 0), CostConfig(max_slope_deg=0))


class CellSpacing(unittest.TestCase):
    """Verify planetary cell spacing calculations against MOLA PDS label values."""

    def test_mars_radius_matches_pds_label(self):
        # MOLA PDS label: A_AXIS_RADIUS = B_AXIS_RADIUS = C_AXIS_RADIUS = 3396.0 km
        self.assertEqual(MARS_RADIUS_M, 3_396_000.0)

    def test_equatorial_cell_spacing(self):
        # At equator: 1/128 degree = (pi/180)/128 * 3396000 m
        # Expected: ~463.08 m (PDS label claims 463.0836 m)
        g = ElevationGrid([[0.0]], origin_lon=0.0, origin_lat=0.0, cell_deg=1.0/128.0)
        ew, ns = g.cell_size_m(0)
        expected = math.radians(1.0/128.0) * 3_396_000.0
        self.assertAlmostEqual(ew, expected, places=6)
        self.assertAlmostEqual(ns, expected, places=6)
        self.assertAlmostEqual(ew, 463.08, places=1)
        self.assertAlmostEqual(ns, 463.08, places=1)

    def test_gale_crater_cell_spacing(self):
        # At Gale Crater latitude (~-5 deg): ew = ns * cos(5), ns = 463.08 m
        g = ElevationGrid([[0.0]], origin_lon=137.0, origin_lat=-5.0, cell_deg=1.0/128.0)
        ew, ns = g.cell_size_m(0)
        expected_ns = math.radians(1.0/128.0) * 3_396_000.0
        expected_ew = expected_ns * math.cos(math.radians(-5.0))
        self.assertAlmostEqual(ns, expected_ns, places=6)
        self.assertAlmostEqual(ew, expected_ew, places=6)
        # ew should be slightly less than ns at non-equatorial latitude
        self.assertLess(ew, ns)

    def test_north_south_spacing_constant(self):
        # NS spacing should be the same at all latitudes
        for lat in [0.0, -5.0, -44.0, 44.0]:
            g = ElevationGrid([[0.0]], origin_lon=0.0, origin_lat=lat, cell_deg=1.0/128.0)
            _, ns = g.cell_size_m(0)
            expected_ns = math.radians(1.0/128.0) * 3_396_000.0
            self.assertAlmostEqual(ns, expected_ns, places=6)

    def test_east_west_decreases_with_latitude(self):
        # EW spacing should decrease as |latitude| increases
        prev_ew = float('inf')
        for lat in [0.0, 10.0, 30.0, 60.0, 80.0]:
            g = ElevationGrid([[0.0]], origin_lon=0.0, origin_lat=lat, cell_deg=1.0/128.0)
            ew, _ = g.cell_size_m(0)
            self.assertLess(ew, prev_ew)
            prev_ew = ew

    def test_cell_size_returns_ew_ns_order(self):
        # cell_size_m returns (east-west, north-south) in that order
        g = ElevationGrid([[0.0]], origin_lon=0.0, origin_lat=30.0, cell_deg=1.0/128.0)
        ew, ns = g.cell_size_m(0)
        self.assertLess(ew, ns)  # at 30 deg, ew < ns


if __name__ == "__main__":
    unittest.main()
