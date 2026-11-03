"""Ingestion of elevation grids from Esri ASCII Grid (.asc). Stdlib only.

Any GeoTIFF can be converted with GDAL:  gdal_translate -of AAIGrid in.tif out.asc
Requirements (checked, with clear errors): geographic coordinates in DEGREES, square cells, elevation in
METRES. The loader cannot verify the units or CRS from an .asc file, so the dataset metadata JSON must state
them and the person ingesting the data is responsible for that being true.
"""
from __future__ import annotations

from pathlib import Path

from app.services.routing import ElevationGrid

_REQUIRED = ("ncols", "nrows", "cellsize")


class GridFormatError(ValueError):
    pass


def load_ascii_grid(path: Path) -> ElevationGrid:
    try:
        lines = path.read_text().splitlines()
    except OSError as e:
        raise GridFormatError(f"cannot read {path.name}: {e}") from e
    header: dict[str, float] = {}
    i = 0
    while i < len(lines):
        parts = lines[i].split()
        if len(parts) == 2 and parts[0].isalpha() or (len(parts) == 2 and parts[0].replace("_", "").isalpha()):
            try:
                header[parts[0].lower()] = float(parts[1])
            except ValueError as e:
                raise GridFormatError(f"bad header value: {lines[i]!r}") from e
            i += 1
        else:
            break
    for k in _REQUIRED:
        if k not in header:
            raise GridFormatError(f"missing header field '{k}'")
    if "dx" in header or "dy" in header:
        raise GridFormatError("non-square cells (dx/dy) are not supported")
    corner = "xllcorner" in header and "yllcorner" in header
    center = "xllcenter" in header and "yllcenter" in header
    if not (corner or center):
        raise GridFormatError("missing xll/yll lower-left reference")
    ncols, nrows, cell = int(header["ncols"]), int(header["nrows"]), header["cellsize"]
    if ncols < 1 or nrows < 1 or cell <= 0:
        raise GridFormatError("ncols, nrows and cellsize must be positive")
    nodata = header.get("nodata_value")
    rows: list[list[float | None]] = []
    for ln in lines[i:]:
        if not ln.strip():
            continue
        try:
            vals = [float(v) for v in ln.split()]
        except ValueError as e:
            raise GridFormatError("non-numeric value in data block") from e
        if len(vals) != ncols:
            raise GridFormatError(f"row has {len(vals)} values, expected {ncols}")
        rows.append([None if (nodata is not None and v == nodata) else v for v in vals])
    if len(rows) != nrows:
        raise GridFormatError(f"found {len(rows)} data rows, expected {nrows}")
    if corner:
        lon0 = header["xllcorner"] + cell / 2
        lat0 = header["yllcorner"] + (nrows - 0.5) * cell
    else:
        lon0 = header["xllcenter"]
        lat0 = header["yllcenter"] + (nrows - 1) * cell
    if not (-90 <= lat0 <= 90) or not (-180 <= lon0 <= 360):
        raise GridFormatError("grid origin is outside degree ranges; projected coordinates are unsupported")
    return ElevationGrid(rows, origin_lon=lon0, origin_lat=lat0, cell_deg=cell)
