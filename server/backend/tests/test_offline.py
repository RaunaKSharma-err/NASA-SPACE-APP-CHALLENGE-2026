"""Offline package integrity + simulated relay. Synthetic temp files only."""
import tempfile
import unittest
from pathlib import Path

from app.services.offline import SimulatedRelay, build_manifest, verify_manifest


class Manifest(unittest.TestCase):
    def test_roundtrip_and_tamper_detection(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            (base / "a.bin").write_bytes(b"synthetic-a")
            (base / "b.bin").write_bytes(b"synthetic-b")
            m = build_manifest("demo", "0.0.1", base, ["a.bin", "b.bin"])
            self.assertEqual(verify_manifest(m, base), [])
            (base / "a.bin").write_bytes(b"tampered")
            (base / "b.bin").unlink()
            problems = verify_manifest(m, base)
            self.assertIn("checksum mismatch: a.bin", problems)
            self.assertIn("missing: b.bin", problems)


class Relay(unittest.TestCase):
    def test_queue_while_disconnected_then_sync(self):
        r = SimulatedRelay()
        r.disconnect()
        r.enqueue({"id": 1})
        r.enqueue({"id": 2})
        s = r.sync()
        self.assertEqual((s["connected"], s["synced"], s["pending"]), (False, 0, 2))
        self.assertIsNone(r.last_synchronized)
        r.reconnect()
        s = r.sync()
        self.assertEqual((s["synced"], s["pending"]), (2, 0))
        self.assertTrue(s["simulated"])
        self.assertIsNotNone(r.last_synchronized)


if __name__ == "__main__":
    unittest.main()
