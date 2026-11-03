"""Loads dataset/region metadata from JSON files in data/metadata. Empty dir => empty registry."""
import json
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


def load_models(directory: Path, model: type[T]) -> list[T]:
    if not directory.is_dir():
        return []
    return [model.model_validate(json.loads(p.read_text())) for p in sorted(directory.glob("*.json"))]
