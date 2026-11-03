from fastapi import APIRouter

from app.core.config import get_settings
from app.schemas.datasets import DatasetProvenance, Region
from app.services.registry import load_models

router = APIRouter()


@router.get("/layers", response_model=list[DatasetProvenance])
def list_layers():
    """Dataset/layer metadata with provenance and status. Empty until datasets are verified."""
    return load_models(get_settings().metadata_dir / "datasets", DatasetProvenance)


@router.get("/regions", response_model=list[Region])
def list_regions():
    return load_models(get_settings().metadata_dir / "regions", Region)
