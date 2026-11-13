"""Retrieval and assistant behaviour on SYNTHETIC documents."""
import json
import unittest
from unittest.mock import MagicMock, patch

from app.services.ai import (
    Document,
    NullProvider,
    OllamaProvider,
    OpenRouterProvider,
    ProviderUnavailable,
    answer_query,
    get_provider,
    retrieve,
)

DOCS = [
    Document("d1", "Synthetic elevation grid", "Elevation in metres. Limitations: synthetic fixture.", "dataset_metadata"),
    Document("d2", "Synthetic imagery", "Imagery coverage for the demo region.", "dataset_metadata"),
    Document("d3", "Gale Crater region", "Gale Crater is located at lon 137.0-138.0, lat -5.5 to -4.5 on Mars. Elevation data extracted from MOLA MEGDR.", "dataset_metadata"),
    Document("d4", "Available datasets", "Loaded datasets: MOLA MEGDR elevation grid, synthetic imagery. Terrain files available offline in processed directory.", "dataset_metadata"),
]


class Provider:
    def complete(self, prompt):
        assert "EVIDENCE" in prompt and "INFERENCE" in prompt
        return "stub answer"


class Assistant(unittest.TestCase):
    def test_retrieval_ranks_matches(self):
        ev = retrieve("what is the elevation limitations", DOCS)
        self.assertEqual(ev[0].doc_id, "d1")

    def test_no_evidence_does_not_call_provider_or_fabricate(self):
        r = answer_query("volcano eruption history", DOCS, Provider())
        self.assertEqual((r.status, r.answer, r.evidence), ("no_evidence", None, []))

    def test_provider_unavailable_returns_evidence_only(self):
        r = answer_query("elevation units", DOCS, NullProvider())
        self.assertEqual(r.status, "provider_unavailable")
        self.assertIsNone(r.answer)
        self.assertTrue(r.evidence)

    def test_ok_path(self):
        r = answer_query("elevation units", DOCS, Provider())
        self.assertEqual((r.status, r.answer), ("ok", "stub answer"))


class IntentRouting(unittest.TestCase):
    """Conversational messages bypass project-data retrieval but use the LLM provider."""

    class ConversationalProvider:
        """Provider stub for conversational queries — no EVIDENCE section in prompt."""

        def complete(self, prompt):
            assert "EVIDENCE" not in prompt, "Conversational prompt must not contain EVIDENCE"
            return "conversational stub answer"

    class ScientificProvider:
        """Provider stub for scientific queries — requires EVIDENCE in prompt."""

        def complete(self, prompt):
            assert "EVIDENCE" in prompt and "INFERENCE" in prompt
            return "grounded stub answer"

    def test_hi(self):
        r = answer_query("hi", DOCS, self.ConversationalProvider())
        self.assertEqual(r.status, "ok")
        self.assertIsNotNone(r.answer)
        self.assertEqual(r.evidence, [])
        self.assertTrue(any("Conversational" in n for n in r.notes))

    def test_hello(self):
        r = answer_query("hello", DOCS, self.ConversationalProvider())
        self.assertEqual(r.status, "ok")
        self.assertIsNotNone(r.answer)
        self.assertEqual(r.evidence, [])

    def test_hey_there(self):
        r = answer_query("hey there", DOCS, self.ConversationalProvider())
        self.assertEqual(r.status, "ok")
        self.assertIsNotNone(r.answer)
        self.assertEqual(r.evidence, [])

    def test_tell_me_a_joke(self):
        r = answer_query("tell me a joke", DOCS, self.ConversationalProvider())
        self.assertEqual(r.status, "ok")
        self.assertIsNotNone(r.answer)
        self.assertEqual(r.evidence, [])

    def test_how_are_you(self):
        r = answer_query("how are you", DOCS, self.ConversationalProvider())
        self.assertEqual(r.status, "ok")
        self.assertIsNotNone(r.answer)
        self.assertEqual(r.evidence, [])

    def test_tell_me_about_earth(self):
        r = answer_query("tell me about earth", DOCS, self.ConversationalProvider())
        self.assertEqual(r.status, "ok")
        self.assertIsNotNone(r.answer)
        self.assertEqual(r.evidence, [])

    def test_thanks(self):
        r = answer_query("thanks", DOCS, self.ConversationalProvider())
        self.assertEqual(r.status, "ok")
        self.assertIsNotNone(r.answer)
        self.assertEqual(r.evidence, [])

    def test_who_are_you(self):
        r = answer_query("who are you?", DOCS, self.ConversationalProvider())
        self.assertEqual(r.status, "ok")
        self.assertIsNotNone(r.answer)
        self.assertEqual(r.evidence, [])

    def test_what_can_you_help(self):
        r = answer_query("what can you help me with?", DOCS, self.ConversationalProvider())
        self.assertEqual(r.status, "ok")
        self.assertIsNotNone(r.answer)
        self.assertEqual(r.evidence, [])

    def test_scientific_still_uses_retrieval(self):
        """Non-conversational queries still go through retrieval + provider."""
        r = answer_query("elevation units", DOCS, self.ScientificProvider())
        self.assertEqual(r.status, "ok")
        self.assertEqual(r.answer, "grounded stub answer")
        self.assertGreater(len(r.evidence), 0)

    def test_no_evidence_still_returned_for_unmatched_scientific(self):
        """Unmatched scientific queries return no_evidence, not a conversational answer."""
        r = answer_query("quantum computing theory", DOCS, self.ConversationalProvider())
        self.assertEqual(r.status, "no_evidence")
        self.assertIsNone(r.answer)
        self.assertEqual(r.evidence, [])

    def test_scientific_gale_crater_uses_retrieval(self):
        """Mars-specific query uses project retrieval and grounding."""
        r = answer_query("what is Gale Crater", DOCS, self.ScientificProvider())
        self.assertEqual(r.status, "ok")
        self.assertEqual(r.answer, "grounded stub answer")
        self.assertGreater(len(r.evidence), 0)

    def test_scientific_elevation_query_uses_retrieval(self):
        """Elevation query uses project retrieval and grounding."""
        r = answer_query("what is the elevation of Gale Crater", DOCS, self.ScientificProvider())
        self.assertEqual(r.status, "ok")
        self.assertEqual(r.answer, "grounded stub answer")
        self.assertGreater(len(r.evidence), 0)

    def test_scientific_datasets_query_uses_retrieval(self):
        """Dataset question uses project retrieval and grounding."""
        r = answer_query("which datasets are currently loaded", DOCS, self.ScientificProvider())
        self.assertEqual(r.status, "ok")
        self.assertEqual(r.answer, "grounded stub answer")
        self.assertGreater(len(r.evidence), 0)

    def test_conversational_provider_unavailable_returns_error(self):
        """Conversational query with no provider returns clear error, not fake response."""
        r = answer_query("hi", DOCS, NullProvider())
        self.assertEqual(r.status, "provider_unavailable")
        self.assertIsNone(r.answer)
        self.assertEqual(r.evidence, [])


class OllamaProviderTests(unittest.TestCase):
    def test_complete_success(self):
        provider = OllamaProvider("http://localhost:11434", "qwen2.5:0.5b", timeout=10)
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps({"response": "Mars is red.", "done": True}).encode()
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = lambda s, *a: None
        with patch("urllib.request.urlopen", return_value=mock_resp):
            result = provider.complete("test prompt")
        self.assertEqual(result, "Mars is red.")

    def test_complete_connection_error(self):
        provider = OllamaProvider("http://localhost:11434", "qwen2.5:0.5b", timeout=10)
        with patch("urllib.request.urlopen", side_effect=ConnectionError("refused")), self.assertRaises(ProviderUnavailable):
            provider.complete("test prompt")

    def test_complete_timeout(self):
        provider = OllamaProvider("http://localhost:11434", "qwen2.5:0.5b", timeout=10)
        with patch("urllib.request.urlopen", side_effect=TimeoutError("timed out")), self.assertRaises(ProviderUnavailable):
            provider.complete("test prompt")

    def test_complete_empty_response(self):
        provider = OllamaProvider("http://localhost:11434", "qwen2.5:0.5b", timeout=10)
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps({"response": "", "done": True}).encode()
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = lambda s, *a: None
        with patch("urllib.request.urlopen", return_value=mock_resp), self.assertRaises(ProviderUnavailable):
            provider.complete("test prompt")

    def test_complete_invalid_json(self):
        provider = OllamaProvider("http://localhost:11434", "qwen2.5:0.5b", timeout=10)
        mock_resp = MagicMock()
        mock_resp.read.return_value = b"not json"
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = lambda s, *a: None
        with patch("urllib.request.urlopen", return_value=mock_resp), self.assertRaises(ProviderUnavailable):
            provider.complete("test prompt")

    def test_complete_url_error(self):
        provider = OllamaProvider("http://localhost:11434", "qwen2.5:0.5b", timeout=10)
        with patch("urllib.request.urlopen", side_effect=__import__("urllib.error").error.URLError("not found")), self.assertRaises(ProviderUnavailable):
            provider.complete("test prompt")


class OpenRouterProviderTests(unittest.TestCase):
    def test_no_api_key(self):
        provider = OpenRouterProvider("", "openai/gpt-4o-mini", timeout=10)
        with self.assertRaises(ProviderUnavailable):
            provider.complete("test prompt")

    def test_complete_success(self):
        provider = OpenRouterProvider("test-key", "openai/gpt-4o-mini", timeout=10)
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps({
            "choices": [{"message": {"content": "Cloud answer."}}]
        }).encode()
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = lambda s, *a: None
        with patch("urllib.request.urlopen", return_value=mock_resp):
            result = provider.complete("test prompt")
        self.assertEqual(result, "Cloud answer.")

    def test_complete_connection_error(self):
        provider = OpenRouterProvider("test-key", "openai/gpt-4o-mini", timeout=10)
        with patch("urllib.request.urlopen", side_effect=ConnectionError("refused")), self.assertRaises(ProviderUnavailable):
            provider.complete("test prompt")


class GetProviderTests(unittest.TestCase):
    def test_none_returns_null(self):
        from app.core.config import get_settings
        get_settings.cache_clear()
        import os
        os.environ["MARS_AI_PROVIDER"] = "none"
        get_settings.cache_clear()
        p = get_provider("none")
        self.assertIsInstance(p, NullProvider)

    def test_ollama_returns_ollama_provider(self):
        from app.core.config import get_settings
        get_settings.cache_clear()
        import os
        os.environ["MARS_AI_PROVIDER"] = "ollama"
        get_settings.cache_clear()
        p = get_provider("ollama")
        self.assertIsInstance(p, OllamaProvider)
        self.assertEqual(p.model, "qwen2.5:0.5b")

    def test_openrouter_without_key_returns_null(self):
        from app.core.config import get_settings
        get_settings.cache_clear()
        import os
        os.environ["MARS_AI_PROVIDER"] = "openrouter"
        os.environ["MARS_OPENROUTER_API_KEY"] = ""
        get_settings.cache_clear()
        p = get_provider("openrouter")
        self.assertIsInstance(p, NullProvider)

    def test_unknown_returns_null(self):
        p = get_provider("unknown")
        self.assertIsInstance(p, NullProvider)


if __name__ == "__main__":
    unittest.main()
