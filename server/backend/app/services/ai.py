"""Replaceable AI interface plus deterministic keyword retrieval over project metadata.

Rules: never fabricate when evidence is empty; separate evidence from model text;
the model never influences route validation (that lives in routing.py).
"""
from __future__ import annotations

import json
import logging
import re
import threading
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Protocol

from app.core.config import get_settings

logger = logging.getLogger("marsyn.assistant")


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


# ---------------------------------------------------------------------------
# Intent classification (deterministic, no model dependency)
# ---------------------------------------------------------------------------

_INTENT_CONVERSATIONAL = "conversational"   # greetings, chit-chat, jokes, general knowledge
_INTENT_SCIENTIFIC = "scientific"           # Mars/science questions with project grounding

_GREETING_STARTS = (
    "hi", "hello", "hey", "hiya", "howdy", "greetings",
    "good morning", "good afternoon", "good evening", "yo",
)
_CONVERSATIONAL_PHRASES = (
    "how are you", "how's it going", "how is it going",
    "tell me a joke", "joke", "funny", "laugh",
    "thanks", "thank you", "thx",
    "who are you", "what are you", "who is this", "what is this",
    "what can you help me with", "what can you do", "help", "capabilities",
    "your name", "your purpose", "introduce yourself", "tell me about yourself",
    "nice to meet you", "goodbye", "bye", "see you",
)
# General knowledge topics that bypass project retrieval but use LLM knowledge
_GENERAL_KNOWLEDGE_TOPICS = (
    "earth", "the earth", "moon", "sun", "planet", "venus", "jupiter",
    "gravity", "atmosphere", "climate", "space", "universe", "star",
)


def _classify_intent(query: str) -> str:
    """Classify a query as conversational (bypass retrieval) or scientific (use retrieval).

    Returns one of _INTENT_CONVERSATIONAL or _INTENT_SCIENTIFIC.
    """
    q = query.strip().lower().rstrip("?.!.,;")
    if not q:
        return _INTENT_SCIENTIFIC

    # 1. Greetings and chit-chat
    if q in _GREETING_STARTS:
        return _INTENT_CONVERSATIONAL
    if any(q.startswith(s + " ") for s in _GREETING_STARTS):
        return _INTENT_CONVERSATIONAL
    if any(p in q for p in _CONVERSATIONAL_PHRASES):
        return _INTENT_CONVERSATIONAL

    # Short greeting + optional word (e.g. "hi there", "hello MARSYN")
    tokens = q.split()
    if len(tokens) <= 3 and any(t in _GREETING_STARTS for t in tokens):
        return _INTENT_CONVERSATIONAL

    # 2. General knowledge questions (Earth, moon, planets, etc.) —
    #    bypass project retrieval, answer from LLM general knowledge
    if any(q.startswith(s + " ") for s in ("tell me about", "what is", "what are", "how does")):
        if any(topic in q for topic in _GENERAL_KNOWLEDGE_TOPICS):
            return _INTENT_CONVERSATIONAL

    return _INTENT_SCIENTIFIC


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------

def _build_conversational_prompt(query: str) -> str:
    """Prompt for general conversation / general knowledge — no project evidence."""
    return (
        "You are the MARSYN mission assistant, an AI copilot for Mars exploration. "
        "Respond naturally and helpfully. Use your general knowledge; do not claim "
        "access to MARSYN project data unless the user asks about it. "
        "If you mention scientific facts, note they are general knowledge, not "
        "MARSYN project measurements. Keep responses concise.\n\n"
        f"USER: {query}"
    )


def _build_grounded_prompt(query: str, evidence: list[Evidence]) -> str:
    """Prompt for evidence-grounded responses — answer only from project evidence."""
    ev = "\n".join(f"[{e.doc_id}] {e.title}: {e.snippet}" for e in evidence)
    return (
        "Answer using ONLY the evidence below. Do not use outside knowledge. "
        "Do not invent numbers, distances, diameters, depths, or elevations. "
        "If the evidence is insufficient, say so. Label facts as OBSERVATION or INFERENCE. "
        "Cite [doc_id] for claims.\n"
        f"EVIDENCE:\n{ev}\n\nQUESTION: {query}"
    )


# ---------------------------------------------------------------------------
# Token-based retrieval (unchanged)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def answer_query(query: str, docs: list[Document], provider: AIProvider) -> AssistantResult:
    intent = _classify_intent(query)

    # Structured debug logging (no secrets/tokens)
    logger.info(
        "assistant.query",
        extra={
            "query": query,
            "intent": intent,
            "provider": type(provider).__name__,
        },
    )

    # ---- Path A: Conversational / general knowledge ----
    if intent == _INTENT_CONVERSATIONAL:
        logger.info("assistant.path", extra={"path": "conversational", "retrieval_invoked": False})
        try:
            text = provider.complete(_build_conversational_prompt(query))
        except ProviderUnavailable:
            logger.info("assistant.result", extra={"result": "provider_unavailable", "reason": "no_provider"})
            return AssistantResult(
                "provider_unavailable", None, [],
                ["Conversational response requested but no AI provider is configured."],
            )
        logger.info("assistant.result", extra={"result": "ok", "llm_generated": True})
        return AssistantResult(
            "ok", text, [],
            [
                "Conversational response — no project-data retrieval.",
                "LLM provider used — general knowledge.",
            ],
        )

    # ---- Path B: Scientific / project-specific ----
    logger.info("assistant.path", extra={"path": "scientific", "retrieval_invoked": True})
    evidence = retrieve(query, docs)
    if not evidence:
        # Project meta-question: user is asking about what data/sources are available.
        # Answer directly from the docs list (actual application data), no LLM needed.
        ql = query.lower()
        dataset_asked = any(w in ql for w in ("dataset", "data source", "data set", "loaded", "available"))
        if docs and dataset_asked:
            listing = "\n".join(f"- [{d.id}] {d.title} ({d.kind})" for d in docs)
            text = (
                "Project data currently loaded:\n"
                f"{listing}\n"
                f"Total: {len(docs)} dataset(s)."
            )
            logger.info("assistant.result", extra={"result": "ok", "llm_generated": False, "path": "project_meta_listing"})
            return AssistantResult(
                "ok", text, [],
                [
                    "Project meta-question answered from application data (no retrieval, no LLM).",
                    f"{len(docs)} dataset(s) listed from registry.",
                ],
            )
        # No project evidence — be honest rather than inventing or falling back to general knowledge.
        # General-knowledge questions (Earth, moon, etc.) are already caught by the conversational
        # classifier above, so anything reaching here is a project-specific query with no match.
        logger.info("assistant.result", extra={"result": "no_evidence", "reason": "no_project_match"})
        return AssistantResult("no_evidence", None, [],
                               ["No project data or documentation matched this question."])

    try:
        text = provider.complete(_build_grounded_prompt(query, evidence))
    except ProviderUnavailable:
        logger.info("assistant.result", extra={"result": "provider_unavailable", "reason": "no_provider_with_evidence"})
        return AssistantResult("provider_unavailable", None, evidence,
                               ["Retrieved evidence is shown; no generated answer is available."])
    logger.info("assistant.result", extra={"result": "ok", "llm_generated": True, "grounded": True})
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
