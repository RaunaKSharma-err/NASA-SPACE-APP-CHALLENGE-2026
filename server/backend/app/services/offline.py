"""Mission-region package manifests (integrity) and a SIMULATED relay. Stdlib only.

The relay is a demonstration of sync behaviour, not Mars communications.
"""
from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def build_manifest(package_id: str, version: str, base_dir: Path, files: list[str]) -> dict:
    return {
        "package_id": package_id,
        "version": version,
        "created_at": datetime.now(UTC).isoformat(),
        "files": {name: {"sha256": _sha256(base_dir / name), "bytes": (base_dir / name).stat().st_size}
                  for name in sorted(files)},
    }


def verify_manifest(manifest: dict, base_dir: Path) -> list[str]:
    """Return a list of problems; empty list means every file matches."""
    problems = []
    for name, meta in manifest.get("files", {}).items():
        p = base_dir / name
        if not p.is_file():
            problems.append(f"missing: {name}")
        elif _sha256(p) != meta["sha256"]:
            problems.append(f"checksum mismatch: {name}")
    return problems


class SimulatedRelay:
    """Queues messages while disconnected; flushes them on sync when connected."""

    def __init__(self) -> None:
        self.connected = True
        self.pending: list[dict] = []
        self.delivered: list[dict] = []
        self.last_synchronized: str | None = None

    def disconnect(self) -> None:
        self.connected = False

    def reconnect(self) -> None:
        self.connected = True

    def enqueue(self, message: dict) -> None:
        self.pending.append(message)

    def sync(self) -> dict:
        if not self.connected:
            return {"simulated": True, "connected": False, "synced": 0, "pending": len(self.pending),
                    "last_synchronized": self.last_synchronized}
        n = len(self.pending)
        self.delivered.extend(self.pending)
        self.pending.clear()
        self.last_synchronized = datetime.now(UTC).isoformat()
        return {"simulated": True, "connected": True, "synced": n, "pending": 0,
                "last_synchronized": self.last_synchronized}

    def to_json(self) -> str:
        return json.dumps({"connected": self.connected, "pending": len(self.pending),
                           "last_synchronized": self.last_synchronized, "simulated": True})
