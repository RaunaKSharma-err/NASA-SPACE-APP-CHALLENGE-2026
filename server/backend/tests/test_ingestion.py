"""Ingestion + packaging tests. All grids are SYNTHETIC temp files, not NASA data."""
import json
import tempfile
import unittest
from pathlib import Path

from app.cli import main as cli_main
from app.services.grid_io import GridFormatError, load_ascii_grid
from app.services.routing import plan_route

ASC = """ncols 4
nrows 2
xllcorner 10.0
yllcorner -1.0
cellsize 0.5
NODATA_value -9999
0 0 -9999 0
0 100 0 0
"""


def write(d, text, name="t.asc"):
    p = Path(d) / name
    p.write_text(text)
    return p


class AsciiGrid(unittest.TestCase):
    def test_parse_origin_nodata_and_routing(self):
        with tempfile.TemporaryDirectory() as d:
            g = load_ascii_grid(write(d, ASC))
        self.assertEqual((g.rows, g.cols), (2, 4))
        self.assertAlmostEqual(g.origin_lon, 10.25)
        self.assertAlmostEqual(g.origin_lat, -0.25)  # yll + (nrows - 0.5) * cell = -1 + 0.75
        self.assertIsNone(g.elevation[0][2])
        res = plan_route(g, (10.25, -0.25), (11.75, -0.75))
        self.assertGreater(len(res.coordinates), 1)

    def test_center_reference(self):
        with tempfile.TemporaryDirectory() as d:
            txt = ASC.replace("xllcorner 10.0", "xllcenter 10.25").replace("yllcorner -1.0", "yllcenter -0.75")
            g = load_ascii_grid(write(d, txt))
        self.assertAlmostEqual(g.origin_lat, -0.25)  # same grid as the corner form
        self.assertAlmostEqual(g.origin_lon, 10.25)

    def test_rejects_bad_files(self):
        bad = {
            "missing header": ASC.replace("cellsize 0.5\n", ""),
            "short row": ASC.replace("0 0 -9999 0", "0 0 -9999"),
            "row count": ASC.replace("nrows 2", "nrows 3"),
            "non numeric": ASC.replace("0 100 0 0", "0 abc 0 0"),
            "projected": ASC.replace("xllcorner 10.0", "xllcorner 500000.0"),
            "dx": ASC.replace("cellsize 0.5", "dx 0.5\ncellsize 0.5"),
        }
        for name, txt in bad.items():
            with self.subTest(name), tempfile.TemporaryDirectory() as d, self.assertRaises(GridFormatError):
                load_ascii_grid(write(d, txt))


class Cli(unittest.TestCase):
    def test_build_and_verify_package(self):
        with tempfile.TemporaryDirectory() as d:
            region = Path(d) / "r1"
            region.mkdir()
            (region / "t.asc").write_text(ASC)
            self.assertEqual(cli_main(["build-package", "r1", "--version", "1", "--processed-dir", d]), 0)
            m = json.loads((region / "manifest.json").read_text())
            self.assertEqual(list(m["files"]), ["t.asc"])
            self.assertEqual(cli_main(["verify-package", "r1", "--processed-dir", d]), 0)
            (region / "t.asc").write_text("tampered")
            self.assertEqual(cli_main(["verify-package", "r1", "--processed-dir", d]), 1)

    def test_missing_region(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(cli_main(["build-package", "nope", "--version", "1", "--processed-dir", d]), 2)


if __name__ == "__main__":
    unittest.main()
