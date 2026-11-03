"""Terrain provider: region -> terrain dataset -> .asc file under processed_dir/<region_id>/."""
from functools import lru_cache
from pathlib import Path

from app.core.config import Settings
from app.core.errors import AppError
from app.schemas.datasets import DatasetProvenance, Region
from app.services.grid_io import GridFormatError, load_ascii_grid
from app.services.registry import load_models
from app.services.routing import ElevationGrid

SYNTHETIC_REGION_ID = "synthetic-demo"


@lru_cache(maxsize=8)
def _load_cached(path: str, mtime_ns: int) -> ElevationGrid:
    return load_ascii_grid(Path(path))


def get_grid(region_id: str, settings: Settings) -> tuple[ElevationGrid, str] | None:
    """Return (grid, dataset_status) or None when no terrain coverage exists."""
    if region_id == SYNTHETIC_REGION_ID and settings.allow_synthetic_fixtures:
        # SYNTHETIC: 20x20 flat plain with a steep ridge at column 10 (gap at row 15). Not Mars data.
        elev = [[0.0 if (c != 10 or r == 15) else 800.0 for c in range(20)] for r in range(20)]
        return ElevationGrid(elev, origin_lon=0.0, origin_lat=0.0, cell_deg=0.01), "synthetic"
    region = next((r for r in load_models(settings.metadata_dir / "regions", Region) if r.id == region_id), None)
    if region is None or not region.terrain_dataset_id:
        return None
    ds = next((d for d in load_models(settings.metadata_dir / "datasets", DatasetProvenance)
               if d.id == region.terrain_dataset_id), None)
    if ds is None or not ds.terrain_file or Path(ds.terrain_file).name != ds.terrain_file:
        return None
    path = settings.processed_dir / region_id / ds.terrain_file
    if not path.is_file():
        return None
    try:
        return _load_cached(str(path), path.stat().st_mtime_ns), ds.status
    except GridFormatError as e:
        raise AppError(500, "terrain_corrupt", f"Terrain file for '{region_id}' is invalid: {e}") from e
