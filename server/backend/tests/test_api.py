"""HTTP-layer tests. Skipped automatically when FastAPI/httpx are not installed."""
import os
import unittest

try:
    from fastapi.testclient import TestClient
    HAVE = True
except ImportError:  # pragma: no cover
    HAVE = False


@unittest.skipUnless(HAVE, "fastapi/httpx not installed")
class Api(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["MARS_ALLOW_SYNTHETIC_FIXTURES"] = "true"
        from app.core.config import get_settings
        get_settings.cache_clear()
        from app.main import create_app
        cls.c = TestClient(create_app())

    def body(self, **kw):
        b = {"region_id": "synthetic-demo", "start": {"lon": 0.0, "lat": 0.0},
             "target": {"lon": 0.18, "lat": -0.15}}
        b.update(kw)
        return b

    def test_health(self):
        self.assertEqual(self.c.get("/api/v1/health").json()["status"], "ok")

    def test_layers_and_regions_are_lists(self):
        self.assertIsInstance(self.c.get("/api/v1/layers").json(), list)
        self.assertIsInstance(self.c.get("/api/v1/regions").json(), list)

    def test_route_synthetic_ok_and_labelled(self):
        r = self.c.post("/api/v1/routes/plan", json=self.body())
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["terrain_status"], "synthetic")
        self.assertEqual(r.json()["hazards_evaluated"], ["slope"])

    def test_unknown_region_404(self):
        r = self.c.post("/api/v1/routes/plan", json=self.body(region_id="nope"))
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.json()["error"]["code"], "terrain_unavailable")

    def test_invalid_latitude_422(self):
        r = self.c.post("/api/v1/routes/plan", json=self.body(start={"lon": 0, "lat": 95}))
        self.assertEqual(r.status_code, 422)
        self.assertEqual(r.json()["error"]["code"], "validation_error")

    def test_sync_cycle(self):
        post = lambda **b: self.c.post("/api/v1/sync/status", json=b).json()
        post(action="disconnect")
        post(action="enqueue", message={"x": 1})
        self.assertEqual(post(action="sync")["synced"], 0)
        post(action="reconnect")
        self.assertEqual(post(action="sync")["synced"], 1)

    def test_assistant_no_evidence(self):
        r = self.c.post("/api/v1/assistant/query", json={"query": "anything at all"})
        self.assertEqual(r.json()["status"], "no_evidence")

    def test_assistant_short_query_accepted(self):
        for q in ("hi", "ok", "hello"):
            r = self.c.post("/api/v1/assistant/query", json={"query": q})
            self.assertEqual(r.status_code, 200, f"query {q!r} should be accepted")

    def test_assistant_whitespace_query_rejected(self):
        for q in (" ", "   ", "\t\n"):
            r = self.c.post("/api/v1/assistant/query", json={"query": q})
            self.assertEqual(r.status_code, 422, f"query {q!r} should be rejected")

    def test_assistant_empty_query_rejected(self):
        r = self.c.post("/api/v1/assistant/query", json={"query": ""})
        self.assertEqual(r.status_code, 422)

    def test_assistant_overlong_query_rejected(self):
        r = self.c.post("/api/v1/assistant/query", json={"query": "x" * 501})
        self.assertEqual(r.status_code, 422)

    def test_offline_regions_list(self):
        self.assertIsInstance(self.c.get("/api/v1/offline/regions").json(), list)

    def test_observations_unknown_region(self):
        self.assertEqual(self.c.get("/api/v1/regions/none/observations").status_code, 404)


if __name__ == "__main__":
    unittest.main()
