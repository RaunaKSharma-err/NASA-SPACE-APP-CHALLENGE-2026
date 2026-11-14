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
        assert "EVIDENCE" in prompt
        return "stub answer"


class Assistant(unittest.TestCase):
    def test_retrieval_ranks_matches(self):
        ev = retrieve("what is the elevation limitations", DOCS)
        self.assertEqual(ev[0].doc_id, "d1")

    def test_no_evidence_does_not_call_provider_or_fabricate(self):
        r = answer_query("volcano eruption history", DOCS, Provider())
        self.assertEqual((r.status, r.answer, r.evidence), ("no_evidence", None, []))

    def test_provider_unavailable_returns_evidence_fallback(self):
        r = answer_query("elevation units", DOCS, NullProvider())
        self.assertEqual(r.status, "ok")
        self.assertIsNotNone(r.answer)
        self.assertTrue(r.evidence)
        self.assertTrue(any("fallback" in n.lower() for n in r.notes))

    def test_ok_path(self):
        r = answer_query("elevation units", DOCS, Provider())
        self.assertEqual((r.status, r.answer), ("ok", "stub answer"))


class IntentRouting(unittest.TestCase):
    """Conversational messages bypass retrieval; science/MARSYN questions use retrieval."""

    class ConversationalProvider:
        def complete(self, prompt):
            assert "EVIDENCE" not in prompt, "Conversational prompt must not contain EVIDENCE"
            return "conversational stub answer"

    class ScientificProvider:
        def complete(self, prompt):
            assert "EVIDENCE" in prompt
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
        """General knowledge questions now use retrieval path (not conversational bypass)."""
        r = answer_query("tell me about earth", DOCS, self.ScientificProvider())
        # no matching docs in synthetic set -> no_evidence
        self.assertEqual(r.status, "no_evidence")

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
        """Unmatched scientific queries return no_evidence."""
        r = answer_query("quantum computing theory", DOCS, self.ConversationalProvider())
        self.assertEqual(r.status, "no_evidence")
        self.assertIsNone(r.answer)
        self.assertEqual(r.evidence, [])

    def test_mola_what_deterministic(self):
        r = answer_query("What is MOLA?", DOCS, Provider())
        self.assertEqual(r.status, "ok")
        a = r.answer
        self.assertIn("Mars Orbiter Laser Altimeter", a)
        self.assertIn("Mars Global Surveyor", a)
        self.assertIn("laser altimetry", a.lower())
        self.assertNotIn("Mars Reconnaissance Orbiter", a)
        self.assertTrue(any("mola" in e.doc_id.lower() for e in r.evidence))

    def test_mola_stands_for(self):
        r = answer_query("What does MOLA stand for?", DOCS, Provider())
        self.assertEqual(r.status, "ok")
        self.assertIn("Mars Orbiter Laser Altimeter", r.answer)

    def test_mola_spacecraft(self):
        r = answer_query("Which spacecraft carried MOLA?", DOCS, Provider())
        self.assertEqual(r.status, "ok")
        self.assertIn("Mars Global Surveyor", r.answer)
        self.assertIn("MGS", r.answer)
        self.assertNotIn("Mars Reconnaissance Orbiter", r.answer)

    def test_mola_marsyn_use(self):
        r = answer_query("Why does MARSYN use MOLA?", DOCS, Provider())
        self.assertEqual(r.status, "ok")
        self.assertIn("MOLA MEGDR", r.answer)
        self.assertIn("Gale Crater", r.answer)

    def test_gale_crater_what(self):
        r = answer_query("What is Gale Crater?", DOCS, Provider())
        self.assertEqual(r.status, "ok")
        a = r.answer
        self.assertIn("impact crater", a.lower())
        self.assertIn("154 km", a)
        self.assertIn("Curiosity", a)
        self.assertIn("Mount Sharp", a)
        self.assertNotIn("Carl Sagan", a)
        self.assertNotIn("crater on Earth", a)
        self.assertTrue(any("gale" in e.doc_id.lower() for e in r.evidence))

    def test_gale_crater_where(self):
        r = answer_query("Where is Gale Crater?", DOCS, Provider())
        self.assertEqual(r.status, "ok")
        self.assertIn("5.4°S", r.answer)
        self.assertIn("137.8°E", r.answer)

    def test_gale_crater_rover(self):
        r = answer_query("Which rover explored Gale Crater?", DOCS, Provider())
        self.assertEqual(r.status, "ok")
        self.assertIn("Curiosity", r.answer)
        self.assertIn("2012", r.answer)

    def test_mount_sharp(self):
        r = answer_query("What is Mount Sharp?", DOCS, Provider())
        self.assertEqual(r.status, "ok")
        self.assertIn("Aeolis Mons", r.answer)
        self.assertIn("Gale Crater", r.answer)
        self.assertIn("Curiosity", r.answer)

    def test_tell_me_about_mars_overview_retrieval(self):
        """Broad Mars overview should prioritize overview/fundamentals and correct solar day."""
        # load real knowledge docs to verify retrieval selection
        import os
        kd = os.path.join(os.path.dirname(__file__), "..", "..", "data", "knowledge")
        kd = os.path.abspath(kd)
        from app.services.ai import load_knowledge_documents
        docs = list(load_knowledge_documents(kd))
        ev = retrieve("Tell me about Mars.", docs)
        ids = [e.doc_id for e in ev]
        self.assertTrue(any("mars_overview" in i for i in ids), ids)
        self.assertFalse(any("human_exploration" in i or "mars_environmental_hazards" in i for i in ids), ids)
        # knowledge doc corrected
        overview = [d for d in docs if "mars_overview" in d.id]
        self.assertTrue(any("24 hours 39 minutes 35 seconds" in d.text for d in overview))

    def test_scientific_elevation_query_uses_retrieval(self):
        """Gale elevation-related question returns deterministic evidence-backed answer."""
        r = answer_query("what is the elevation of Gale Crater", DOCS, self.ScientificProvider())
        self.assertEqual(r.status, "ok")
        self.assertIn("Gale Crater", r.answer)
        self.assertIn("impact crater", r.answer.lower())
        self.assertGreater(len(r.evidence), 0)
        self.assertTrue(any("gale" in e.doc_id.lower() for e in r.evidence))

    def test_scientific_datasets_query_uses_retrieval(self):
        """Dataset question returns deterministic, registry-backed project facts."""
        r = answer_query("which datasets are currently loaded", DOCS, self.ScientificProvider())
        self.assertEqual(r.status, "ok")
        self.assertIn("verified integrated scientific terrain dataset", r.answer.lower())
        self.assertIn("MOLA MEGDR", r.answer)
        self.assertNotIn("knowledge document", r.answer.lower().split("project facts")[0] if "project facts" in r.answer.lower() else r.answer.lower())
        self.assertTrue(any(e.kind == "dataset_metadata" for e in r.evidence))

    def test_diameter_question_deterministic(self):
        """Mars diameter must return correct value from physical characteristics knowledge."""
        r = answer_query("How big is Mars?", DOCS, Provider())
        self.assertEqual(r.status, "ok")
        self.assertIn("6,779 km", r.answer)
        self.assertNotIn("6.7 million miles", r.answer)
        self.assertIn("kb:mars/mars_physical_characteristics", r.answer)
        self.assertTrue(any("mars_physical_characteristics" in e.doc_id for e in r.evidence) or not r.evidence)

    def test_mars_day_question_deterministic(self):
        """Mars solar day must state correct duration and rotation cause."""
        r = answer_query("How long is a day on Mars?", DOCS, Provider())
        self.assertEqual(r.status, "ok")
        self.assertIn("24 hours, 39 minutes, and 35 seconds", r.answer)
        self.assertIn("rotation", r.answer.lower())
        self.assertIn("not because of its atmosphere or magnetic field", r.answer.lower())
        self.assertIn("kb:mars/mars_orbit_rotation_seasons", r.answer)
        self.assertTrue(any("mars_orbit_rotation_seasons" in e.doc_id for e in r.evidence) or not r.evidence)

    def test_marsyn_crism_not_integrated(self):
        r = answer_query("Does MARSYN use CRISM?", DOCS, Provider())
        self.assertEqual(r.status, "ok")
        self.assertIn("No", r.answer.splitlines()[0])
        self.assertIn("not", r.answer.lower())
        self.assertIn("CRISM", r.answer)

    def test_marsyn_hirise_not_integrated(self):
        r = answer_query("Does MARSYN use HiRISE?", DOCS, Provider())
        self.assertEqual(r.status, "ok")
        self.assertIn("No", r.answer.splitlines()[0])
        self.assertIn("HiRISE", r.answer)

    def test_marsyn_no_global_elevation(self):
        r = answer_query("Does MARSYN have global elevation coverage?", DOCS, Provider())
        self.assertEqual(r.status, "ok")
        self.assertIn("No", r.answer.splitlines()[0])
        self.assertIn("Gale Crater", r.answer)

    def test_marsyn_no_rocks_avoidance(self):
        r = answer_query("Does MARSYN avoid rocks?", DOCS, Provider())
        self.assertEqual(r.status, "ok")
        self.assertIn("No", r.answer.splitlines()[0])
        self.assertIn("slope", r.answer.lower())

    def test_marsyn_route_count_one_primary(self):
        r = answer_query("How many routes does MARSYN calculate?", DOCS, Provider())
        self.assertEqual(r.status, "ok")
        self.assertIn("one primary", r.answer.lower())

    def test_conversational_provider_unavailable_returns_error(self):
        """Conversational query with no provider returns clear error."""
        r = answer_query("hi", DOCS, NullProvider())
        self.assertEqual(r.status, "provider_unavailable")
        self.assertIsNone(r.answer)
        self.assertEqual(r.evidence, [])

    def test_tell_me_about_mars_uses_retrieval(self):
        """Broad Mars question must go to retrieval path."""
        r = answer_query("Tell me about Mars", DOCS, self.ScientificProvider())
        # synthetic docs don't contain Mars overview; may be no_evidence
        self.assertIn(r.status, ("ok", "no_evidence"))
        self.assertNotIn(r.status, ("provider_unavailable",))


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
