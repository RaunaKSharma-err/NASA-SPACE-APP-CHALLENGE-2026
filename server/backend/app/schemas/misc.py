from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class AssistantQuery(BaseModel):
    query: str = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def _reject_whitespace_only(self) -> "AssistantQuery":
        if not self.query.strip():
            raise ValueError("query must not be empty or whitespace-only")
        return self


class EvidenceOut(BaseModel):
    doc_id: str
    title: str
    kind: str
    snippet: str
    score: int


class AssistantResponse(BaseModel):
    status: Literal["ok", "no_evidence", "provider_unavailable"]
    answer: str | None
    evidence: list[EvidenceOut]
    notes: list[str]


class OfflinePackage(BaseModel):
    package_id: str
    version: str
    created_at: str
    file_count: int
    integrity_ok: bool
    problems: list[str]


class SyncRequest(BaseModel):
    action: Literal["status", "disconnect", "reconnect", "enqueue", "sync"] = "status"
    message: dict[str, Any] | None = None


class ObservationsResponse(BaseModel):
    region_id: str
    status: str
    observations: list[dict[str, Any]]
    notes: list[str]
