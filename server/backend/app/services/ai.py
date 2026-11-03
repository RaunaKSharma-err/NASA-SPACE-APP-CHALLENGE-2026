"""Replaceable AI interface plus deterministic keyword retrieval over project metadata.

Rules: never fabricate when evidence is empty; separate evidence from model text;
the model never influences route validation (that lives in routing.py).
"""
from __future__ import annotations

import json
import re
import threading
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Protocol

from app.core.config import get_settings


@dataclass(frozen=True)
class Document:
    id: str
    title: str
    text: str
    kind: str  # "dataset_metadata" | "documentation"


@dataclass(frozen=True)
class Evidence:
    doc_id: str
    title: str
    kind: str
    snippet: str
    score: int


class ProviderUnavailable(RuntimeError):
    pass


class AIProvider(Protocol):
    def complete(self, prompt: str) -> str: ...


class NullProvider:
    """Default: no provider configured. Credentials for real providers stay server-side."""

    def complete(self, prompt: str) -> str:
        raise ProviderUnavailable("No AI provider is configured")


class OllamaProvider:
    """Local inference via Ollama. Default provider for offline operation.

    Uses qwen2.5:0.5b by default — small enough for 6 GB RAM machines.
    """

    _lock = threading.Lock()

    def __init__(self, base_url: str, model: str, timeout: int = 60):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout

    def complete(self, prompt: str) -> str:
        url = f"{self.base_url}/api/generate"
        payload = json.dumps({
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.3, "num_predict": 256},
        }).encode("utf-8")
        req = urllib.request.Request(
            url, data=payload, headers={"Content-Type": "application/json"}, method="POST"
        )
        with self._lock:
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                raise ProviderUnavailable(f"Ollama unavailable: {exc}") from exc
            except json.JSONDecodeError as exc:
                raise ProviderUnavailable(f"Ollama returned invalid JSON: {exc}") from exc
        text = data.get("response", "").strip()
        if not text:
            raise ProviderUnavailable("Ollama returned an empty response")
        return text


class OpenRouterProvider:
    """Optional cloud provider. Only enabled when an API key is explicitly configured."""

    def __init__(self, api_key: str, model: str, timeout: int = 30):
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    def complete(self, prompt: str) -> str:
        if not self.api_key:
            raise ProviderUnavailable("OpenRouter API key not configured")
        url = "https://openrouter.ai/api/v1/chat/completions"
        payload = json.dumps({
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 256,
            "temperature": 0.3,
        }).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise ProviderUnavailable(f"OpenRouter unavailable: {exc}") from exc
        except json.JSONDecodeError as exc:
            raise ProviderUnavailable(f"OpenRouter returned invalid JSON: {exc}") from exc
        choices = data.get("choices", [])
        if not choices:
            raise ProviderUnavailable("OpenRouter returned no choices")
        text = choices[0].get("message", {}).get("content", "").strip()
        if not text:
            raise ProviderUnavailable("OpenRouter returned an empty response")
        return text


@dataclass
class AssistantResult:
    status: str  # "ok" | "no_evidence" | "provider_unavailable"
    answer: str | None
    evidence: list[Evidence] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


_STOP = {"the", "and", "for", "what", "which", "that", "this", "with", "are", "from", "how", "does", "can"}


def _tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", text.lower()) if len(t) > 2 and t not in _STOP}


def retrieve(query: str, docs: list[Document], k: int = 3) -> list[Evidence]:
    q = _tokens(query)
    scored = []
    for d in docs:
        score = len(q & _tokens(d.title + " " + d.text))
        if score > 0:
            scored.append((score, d))
    scored.sort(key=lambda x: (-x[0], x[1].id))
    return [Evidence(d.id, d.title, d.kind, d.text[:400], s) for s, d in scored[:k]]


def build_prompt(query: str, evidence: list[Evidence]) -> str:
    ev = "\n".join(f"[{e.doc_id}] {e.title}: {e.snippet}" for e in evidence)
    return (
        "Answer ONLY from the evidence below. Label statements as OBSERVATION (stated in evidence) "
        "or INFERENCE (your reasoning). If the evidence is insufficient, say so. Cite [doc_id].\n"
        f"EVIDENCE:\n{ev}\n\nQUESTION: {query}"
    )


def answer_query(query: str, docs: list[Document], provider: AIProvider) -> AssistantResult:
    evidence = retrieve(query, docs)
    if not evidence:
        return AssistantResult("no_evidence", None, [],
                               ["No project data or documentation matched this question."])
    try:
        text = provider.complete(build_prompt(query, evidence))
    except ProviderUnavailable:
        return AssistantResult("provider_unavailable", None, evidence,
                               ["Retrieved evidence is shown; no generated answer is available."])
    return AssistantResult("ok", text, evidence, ["Generated text is not a validated scientific result."])


def get_provider(name: str) -> AIProvider:
    s = get_settings()
    name = (name or "").strip().lower()
    if name == "ollama" or name == "local":
        return OllamaProvider(s.ollama_url, s.ollama_model, s.ollama_timeout)
    if name == "openrouter":
        if not s.openrouter_api_key:
            return NullProvider()
        return OpenRouterProvider(s.openrouter_api_key, s.openrouter_model, s.openrouter_timeout)
    return NullProvider()