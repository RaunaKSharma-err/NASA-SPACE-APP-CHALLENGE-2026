import json

from fastapi import APIRouter

from app.core.config import get_settings
from app.core.errors import AppError
from app.schemas.datasets import DatasetProvenance, Region
from app.schemas.misc import (
    AssistantQuery,
    AssistantResponse,
    EvidenceOut,
    ObservationsResponse,
    OfflinePackage,
    SyncRequest,
)
from app.services.ai import Document, answer_query, get_provider
from app.services.offline import SimulatedRelay, verify_manifest
from app.services.registry import load_models

router = APIRouter()
_relay = SimulatedRelay()  # process-local demo state


@router.get("/regions/{region_id}/observations", response_model=ObservationsResponse)
def observations(region_id: str):
    s = get_settings()
    if region_id not in {r.id for r in load_models(s.metadata_dir / "regions", Region)}:
        raise AppError(404, "region_not_found", f"Unknown region '{region_id}'.")
    f = s.metadata_dir / "observations" / f"{region_id}.json"  # provenance-bearing records, ingested by hand
    if not f.is_file():
        return ObservationsResponse(region_id=region_id, status="no_observations_available", observations=[],
                                    notes=["No observation records have been ingested for this region."])
    data = json.loads(f.read_text())
    if not isinstance(data, list):
        raise AppError(500, "observations_corrupt", "Observation file must contain a JSON list.")
    return ObservationsResponse(region_id=region_id, status="available", observations=data, notes=[])


@router.post("/assistant/query", response_model=AssistantResponse)
def assistant(req: AssistantQuery):
    s = get_settings()
    docs = [Document(d.id, d.name,
                     f"Status: {d.status}. Source: {d.authoritative_source}. Coverage: {d.coverage}. "
                     f"Format: {d.format}. Limitations: {'; '.join(d.limitations) or 'none recorded'}.",
                     "dataset_metadata")
            for d in load_models(s.metadata_dir / "datasets", DatasetProvenance)]
    r = answer_query(req.query, docs, get_provider(s.ai_provider))
    return AssistantResponse(status=r.status, answer=r.answer, notes=r.notes,
                             evidence=[EvidenceOut(**e.__dict__) for e in r.evidence])


@router.get("/offline/regions", response_model=list[OfflinePackage])
def offline_regions():
    base = get_settings().processed_dir
    out = []
    if base.is_dir():
        for mf in sorted(base.glob("*/manifest.json")):
            m = json.loads(mf.read_text())
            problems = verify_manifest(m, mf.parent)
            out.append(OfflinePackage(package_id=m["package_id"], version=m["version"],
                                      created_at=m["created_at"], file_count=len(m["files"]),
                                      integrity_ok=not problems, problems=problems))
    return out


@router.post("/sync/status")
def sync_status(req: SyncRequest):
    """SIMULATED relay. Not Mars communications."""
    if req.action == "disconnect":
        _relay.disconnect()
    elif req.action == "reconnect":
        _relay.reconnect()
    elif req.action == "enqueue":
        if req.message is None:
            raise AppError(422, "message_required", "action 'enqueue' needs a message")
        _relay.enqueue(req.message)
    if req.action == "sync":
        return _relay.sync()
    return {"simulated": True, "connected": _relay.connected, "pending": len(_relay.pending),
            "last_synchronized": _relay.last_synchronized}
