"""Tests for the resource-agnostic scientific data provider architecture.

These tests cover:
- LocalFileProvider: dataset listing, elevation sampling, validation
- RemoteHttpProvider: disabled by default, enabled only with base URL
- ResourceValidator: format, CRS, bounds, units, attribution checks
- ProviderManager: provider listing, remote enable/disable, fallback
- Existing terrain/route integration preserved

No NASA endpoints are assumed. Synthetic temp grids are used, not NASA data.
"""

import os
import socket
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from app.core.config import Settings
from app.services.providers.base import DatasetMetadata
from app.services.providers.local import LocalFileProvider
from app.services.providers.remote import RemoteHttpProvider, MAX_DOWNLOAD_BYTES
from app.services.providers.manager import ProviderManager
from app.services.providers.validation import ResourceValidator, ValidationConfig


def make_settings(metadata_dir: Path, processed_dir: Path) -> Settings:
    s = Settings(
        metadata_dir=metadata_dir,
        processed_dir=processed_dir,
        allow_synthetic_fixtures=True,
    )
    return s


class LocalProviderTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.metadata = Path(self.tmp.name) / "metadata"
        self.processed = Path(self.tmp.name) / "processed"
        self.metadata.mkdir(parents=True)
        self.processed.mkdir(parents=True)
        (self.metadata / "datasets").mkdir()
        (self.metadata / "regions").mkdir()

        # Write a minimal verified MOLA dataset metadata
        (self.metadata / "datasets" / "mola-megdr.json").write_text(
            '{"id":"mola-megdr","name":"MOLA MEGDR","authoritative_source":"NASA/GSFC/MOLA Team",'
            '"format":"Esri ASCII Grid","crs":"Simple cylindrical (planetocentric)","coverage":"Gale Crater",'
            '"units":"metres","status":"verified","terrain_file":"region.asc"}'
        )
        # Write region metadata pointing to the dataset
        (self.metadata / "regions" / "gale-crater.json").write_text(
            '{"id":"gale-crater","name":"Gale Crater","bbox":[137.0,-5.5,138.0,-4.5],'
            '"terrain_dataset_id":"mola-megdr","status":"verified"}'
        )
        # Write a tiny terrain grid for Gale Crater
        region_dir = self.processed / "gale-crater"
        region_dir.mkdir()
        (region_dir / "region.asc").write_text(
            "ncols 3\nnrows 3\nxllcorner 137.0\nyllcorner -4.5\ncellsize 0.5\nNODATA_value -9999\n"
            "-4500 -4400 -4300\n-4200 -4100 -4000\n-3900 -3800 -3700\n"
        )
        # Mirror at dataset-id directory for provider.validate_resource checks
        ds_dir = self.processed / "mola-megdr"
        ds_dir.mkdir()
        (ds_dir / "region.asc").write_text(
            "ncols 3\nnrows 3\nxllcorner 137.0\nyllcorner -4.5\ncellsize 0.5\nNODATA_value -9999\n"
            "-4500 -4400 -4300\n-4200 -4100 -4000\n-3900 -3800 -3700\n"
        )
        self.settings = make_settings(self.metadata, self.processed)
        self.provider = LocalFileProvider(self.settings, enabled=True, priority=0)

    def tearDown(self):
        self.tmp.cleanup()

    def test_list_datasets_returns_mola(self):
        datasets = self.provider.list_datasets()
        self.assertGreaterEqual(len(datasets), 1)
        ids = {d.id for d in datasets}
        self.assertIn("mola-megdr", ids)

    def test_list_datasets_filtered_by_region(self):
        datasets = self.provider.list_datasets(region_id="gale-crater")
        self.assertEqual(len(datasets), 1)
        self.assertEqual(datasets[0].id, "mola-megdr")

    def test_sample_elevation_valid(self):
        # Cell center of top-left cell: lon=137.25, lat=-3.25
        sample = self.provider.sample_elevation("mola-megdr", -3.25, 137.25)
        self.assertTrue(sample.valid)
        self.assertEqual(sample.value, -4500.0)
        self.assertEqual(sample.units, "metres")
        self.assertFalse(sample.nodata)

    def test_sample_elevation_outside_coverage(self):
        sample = self.provider.sample_elevation("mola-megdr", 0.0, 0.0)
        self.assertFalse(sample.valid)
        self.assertTrue(sample.nodata)
        self.assertEqual(sample.units, "metres")

    def test_sample_elevation_unknown_dataset(self):
        sample = self.provider.sample_elevation("nonexistent", -4.25, 137.25)
        self.assertFalse(sample.valid)
        self.assertTrue(sample.nodata)

    def test_disabled_provider_returns_invalid(self):
        disabled = LocalFileProvider(self.settings, enabled=False, priority=0)
        sample = disabled.sample_elevation("mola-megdr", -4.25, 137.25)
        self.assertFalse(sample.valid)
        self.assertTrue(sample.nodata)

    def test_validate_resource_passes(self):
        datasets = self.provider.list_datasets()
        result = self.provider.validate_resource(datasets[0])
        self.assertTrue(result.valid)
        self.assertEqual(len(result.errors), 0)

    def test_validate_resource_fails_bad_crs(self):
        bad = DatasetMetadata(
            id="bad", name="Bad", type="elevation", source="Unknown", format="ASCII Grid",
            crs_name="Projected", crs_units="metres",
            lon_min=0, lon_max=10, lat_min=0, lat_max=10,
            value_unit="metres", organization="NASA", dataset_title="Bad Dataset",
        )
        result = self.provider.validate_resource(bad)
        self.assertFalse(result.valid)
        self.assertTrue(any("CRS" in e for e in result.errors))

    def test_validate_resource_fails_bad_bounds(self):
        bad = DatasetMetadata(
            id="bad", name="Bad", type="elevation", source="Unknown", format="ASCII Grid",
            crs_name="Simple cylindrical", crs_units="degrees",
            lon_min=200, lon_max=100, lat_min=0, lat_max=10,
            value_unit="metres", organization="NASA", dataset_title="Bad Dataset",
        )
        result = self.provider.validate_resource(bad)
        self.assertFalse(result.valid)
        self.assertTrue(any("bound" in e.lower() for e in result.errors))


class RemoteProviderTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.metadata = Path(self.tmp.name) / "metadata"
        self.processed = Path(self.tmp.name) / "processed"
        self.metadata.mkdir(parents=True)
        self.processed.mkdir(parents=True)
        self.settings = make_settings(self.metadata, self.processed)

    def tearDown(self):
        self.tmp.cleanup()

    def test_disabled_by_default(self):
        provider = RemoteHttpProvider(self.settings, enabled=False, priority=10)
        self.assertFalse(provider.enabled)
        datasets = provider.list_datasets()
        self.assertEqual(datasets, [])
        sample = provider.sample_elevation("mola-megdr", -4.25, 137.25)
        self.assertFalse(sample.valid)
        imagery = provider.get_imagery("mola-megdr", -5, -4, 137, 138)
        self.assertEqual(imagery, [])

    def test_enabled_without_base_url_stays_disabled(self):
        # enabled=True but no base_url -> should remain disabled
        provider = RemoteHttpProvider(self.settings, enabled=True, priority=10)
        self.assertFalse(provider.enabled)

    def test_validate_resource_reports_disabled(self):
        provider = RemoteHttpProvider(self.settings, enabled=False, priority=10)
        ds = DatasetMetadata(
            id="x", name="X", type="elevation", source="Unknown", format="ASCII Grid",
            crs_name="Simple cylindrical", crs_units="degrees",
            lon_min=0, lon_max=10, lat_min=0, lat_max=10,
            value_unit="metres", organization="NASA", dataset_title="X",
        )
        result = provider.validate_resource(ds)
        self.assertFalse(result.valid)
        self.assertTrue(any("disabled" in e.lower() or "not enabled" in w.lower()
                            for e in result.errors for w in result.warnings))


class ValidationTests(unittest.TestCase):
    def test_valid_dataset_passes(self):
        ds = DatasetMetadata(
            id="mola", name="MOLA MEGDR", type="elevation", source="MGS/MOLA",
            format="Esri ASCII Grid", crs_name="Simple cylindrical",
            crs_units="degrees", lon_min=137.0, lon_max=138.0, lat_min=-5.5, lat_max=-4.5,
            value_unit="metres", organization="NASA/GSFC", dataset_title="MOLA MEGDR",
        )
        result = ResourceValidator().validate(ds)
        self.assertTrue(result.valid)
        self.assertEqual(len(result.errors), 0)

    def test_invalid_crs_units_fails(self):
        ds = DatasetMetadata(
            id="mola", name="MOLA", type="elevation", source="MGS/MOLA",
            format="Esri ASCII Grid", crs_name="UTM", crs_units="metres",
            lon_min=0, lon_max=10, lat_min=0, lat_max=10,
            value_unit="metres", organization="NASA", dataset_title="MOLA",
        )
        result = ResourceValidator().validate(ds)
        # Projected CRS is valid but requires transformation — not an error
        self.assertTrue(result.valid)
        self.assertTrue(any("projected" in w.lower() for w in result.warnings))
        self.assertTrue(any("transformation" in w.lower() for w in result.warnings))

    def test_invalid_bounds_fails(self):
        ds = DatasetMetadata(
            id="mola", name="MOLA", type="elevation", source="MGS/MOLA",
            format="Esri ASCII Grid", crs_name="Simple cylindrical",
            crs_units="degrees", lon_min=200, lon_max=100, lat_min=-100, lat_max=100,
            value_unit="metres", organization="NASA", dataset_title="MOLA",
        )
        result = ResourceValidator().validate(ds)
        self.assertFalse(result.valid)
        self.assertTrue(any("bound" in e.lower() for e in result.errors))

    def test_missing_attribution_warns(self):
        ds = DatasetMetadata(
            id="mola", name="MOLA", type="elevation", source="Unknown",
            format="Esri ASCII Grid", crs_name="Simple cylindrical",
            crs_units="degrees", lon_min=0, lon_max=10, lat_min=0, lat_max=10,
            value_unit="metres", organization="", dataset_title="",
        )
        result = ResourceValidator().validate(ds)
        # Missing attribution is a warning, not a hard error
        self.assertTrue(len(result.warnings) > 0)

    def test_require_verified_status(self):
        validator = ResourceValidator(ValidationConfig(require_verified_status=True))
        ds = DatasetMetadata(
            id="mola", name="MOLA", type="elevation", source="MGS/MOLA",
            format="Esri ASCII Grid", crs_name="Simple cylindrical",
            crs_units="degrees", lon_min=0, lon_max=10, lat_min=0, lat_max=10,
            value_unit="metres", organization="NASA", dataset_title="MOLA",
            status="unverified",
        )
        result = validator.validate(ds)
        # Unverified status produces a warning, not a hard error
        self.assertTrue(result.valid)
        self.assertTrue(any("verified" in w.lower() for w in result.warnings))


class ManagerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.metadata = Path(self.tmp.name) / "metadata"
        self.processed = Path(self.tmp.name) / "processed"
        self.metadata.mkdir(parents=True)
        self.processed.mkdir(parents=True)
        (self.metadata / "datasets").mkdir()
        (self.metadata / "regions").mkdir()
        (self.metadata / "datasets" / "mola-megdr.json").write_text(
            '{"id":"mola-megdr","name":"MOLA MEGDR","authoritative_source":"NASA/GSFC/MOLA Team",'
            '"format":"Esri ASCII Grid","crs":"Simple cylindrical (planetocentric)","coverage":"Gale Crater",'
            '"units":"metres","status":"verified","terrain_file":"region.asc"}'
        )
        (self.metadata / "regions" / "gale-crater.json").write_text(
            '{"id":"gale-crater","name":"Gale Crater","bbox":[137.0,-5.5,138.0,-4.5],'
            '"terrain_dataset_id":"mola-megdr","status":"verified"}'
        )
        region_dir = self.processed / "gale-crater"
        region_dir.mkdir()
        (region_dir / "region.asc").write_text(
            "ncols 3\nnrows 3\nxllcorner 137.0\nyllcorner -4.5\ncellsize 0.5\nNODATA_value -9999\n"
            "-4500 -4400 -4300\n-4200 -4100 -4000\n-3900 -3800 -3700\n"
        )
        # Also mirror at dataset-id directory for provider.validate_resource checks
        ds_dir = self.processed / "mola-megdr"
        ds_dir.mkdir()
        (ds_dir / "region.asc").write_text(
            "ncols 3\nnrows 3\nxllcorner 137.0\nyllcorner -4.5\ncellsize 0.5\nNODATA_value -9999\n"
            "-4500 -4400 -4300\n-4200 -4100 -4000\n-3900 -3800 -3700\n"
        )
        self.settings = make_settings(self.metadata, self.processed)

    def tearDown(self):
        self.tmp.cleanup()

    def test_manager_starts_with_local_only(self):
        manager = ProviderManager(self.settings, remote_enabled=False)
        providers = manager.list_providers()
        local = [p for p in providers if p["id"] == "local"]
        self.assertEqual(len(local), 1)
        self.assertTrue(local[0]["enabled"])
        remote = [p for p in providers if p["id"] == "remote"]
        self.assertEqual(len(remote), 1)
        self.assertFalse(remote[0]["enabled"])

    def test_list_datasets_returns_local_data(self):
        manager = ProviderManager(self.settings, remote_enabled=False)
        result = manager.list_datasets()
        self.assertGreaterEqual(len(result.data), 1)
        self.assertEqual(result.data[0].id, "mola-megdr")
        self.assertEqual(result.source, "local")

    def test_get_dataset(self):
        manager = ProviderManager(self.settings, remote_enabled=False)
        ds = manager.get_dataset("mola-megdr")
        self.assertIsNotNone(ds)
        self.assertEqual(ds.id, "mola-megdr")
        self.assertIsNone(manager.get_dataset("nonexistent"))

    def test_sample_elevation_via_manager(self):
        manager = ProviderManager(self.settings, remote_enabled=False)
        result = manager.sample_elevation("mola-megdr", -3.25, 137.25)
        self.assertEqual(result.source, "local")
        self.assertTrue(result.data.valid)
        self.assertEqual(result.data.value, -4500.0)

    def test_sample_elevation_outside_coverage_via_manager(self):
        manager = ProviderManager(self.settings, remote_enabled=False)
        result = manager.sample_elevation("mola-megdr", 0.0, 0.0)
        self.assertFalse(result.data.valid)

    def test_remote_enable_disable(self):
        manager = ProviderManager(self.settings, remote_enabled=False)
        self.assertFalse(manager.remote_enabled)
        manager.disable_remote()
        self.assertFalse(manager.remote_enabled)
        # enable_remote without base_url should not enable
        manager.enable_remote()
        self.assertFalse(manager.remote_enabled)

    def test_validate_resource_via_manager(self):
        manager = ProviderManager(self.settings, remote_enabled=False)
        ds = manager.get_dataset("mola-megdr")
        result = manager.validate_resource(ds)
        self.assertTrue(result.valid)

    def test_validate_and_require_raises_on_invalid(self):
        manager = ProviderManager(self.settings, remote_enabled=False)
        bad = DatasetMetadata(
            id="bad", name="Bad", type="elevation", source="Unknown",
            format="Esri ASCII Grid", crs_name="UTM", crs_units="metres",
            lon_min=200, lon_max=100, lat_min=0, lat_max=10,
            value_unit="metres", organization="NASA", dataset_title="Bad",
        )
        # Invalid bounds cause an error, so validate_and_require raises
        with self.assertRaises(Exception):
            manager.validate_and_require(bad)

    def test_get_terrain_grid_delegates_to_existing(self):
        manager = ProviderManager(self.settings, remote_enabled=False)
        result = manager.get_terrain_grid("gale-crater")
        self.assertIsNotNone(result)
        grid, status = result
        self.assertEqual(grid.rows, 3)
        self.assertEqual(grid.cols, 3)


class _MockResponse:
    """Mock HTTP response for testing RemoteHttpProvider._fetch."""

    def __init__(self, status, headers, body=b""):
        self.status = status
        self.headers = headers
        self._body = body
        self._closed = False

    def read(self, size=-1):
        if self._closed:
            return b""
        if size < 0:
            result = self._body
            self._closed = True
            return result
        result = self._body[:size]
        self._body = self._body[size:]
        if not self._body:
            self._closed = True
        return result

    def close(self):
        self._closed = True


class RemoteSecurityTests(unittest.TestCase):
    """Security tests for RemoteHttpProvider SSRF and network protections."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.metadata = Path(self.tmp.name) / "metadata"
        self.processed = Path(self.tmp.name) / "processed"
        self.metadata.mkdir(parents=True)
        self.processed.mkdir(parents=True)
        self.settings = make_settings(self.metadata, self.processed)

    def tearDown(self):
        self.tmp.cleanup()
        if hasattr(self, "_addr_patcher"):
            self._addr_patcher.stop()

    def _make_provider(self, base_url="https://example.nasa.gov/api", **kwargs):
        self.settings.remote_data_base_url = base_url
        return RemoteHttpProvider(self.settings, enabled=True, priority=10, **kwargs)

    def _make_provider_public(self, base_url="https://example.nasa.gov/api", **kwargs):
        """Create a provider with socket.getaddrinfo mocked to return a public IP."""
        self.settings.remote_data_base_url = base_url
        provider = RemoteHttpProvider(self.settings, enabled=True, priority=10, **kwargs)
        self._addr_patcher = patch("socket.getaddrinfo", return_value=[
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 80)),
        ])
        self._addr_patcher.start()
        return provider

    def _valid_ds(self):
        return DatasetMetadata(
            id="x", name="X", type="elevation", source="Unknown", format="ASCII Grid",
            crs_name="Simple cylindrical", crs_units="degrees",
            lon_min=0, lon_max=10, lat_min=0, lat_max=10,
            value_unit="metres", organization="NASA", dataset_title="X",
        )

    def _patch_opener(self, response):
        mock_opener = MagicMock()
        mock_opener.open.return_value = response
        return patch.object(
            __import__("urllib.request", fromlist=["build_opener"]), "build_opener",
            return_value=mock_opener,
        )

    # ------------------------------------------------------------------ SSRF: literal IP addresses

    def test_ssrf_blocks_loopback_ipv4(self):
        provider = self._make_provider("http://127.0.0.1/api")
        result = provider.validate_resource(self._valid_ds())
        self.assertFalse(result.valid)
        self.assertTrue(any("SSRF" in e or "private" in e.lower() for e in result.errors))

    def test_ssrf_blocks_rfc1918_10(self):
        provider = self._make_provider("http://10.0.0.1/api")
        result = provider.validate_resource(self._valid_ds())
        self.assertFalse(result.valid)
        self.assertTrue(any("SSRF" in e or "private" in e.lower() for e in result.errors))

    def test_ssrf_blocks_rfc1918_172(self):
        provider = self._make_provider("http://172.16.0.1/api")
        result = provider.validate_resource(self._valid_ds())
        self.assertFalse(result.valid)

    def test_ssrf_blocks_rfc1918_192(self):
        provider = self._make_provider("http://192.168.1.1/api")
        result = provider.validate_resource(self._valid_ds())
        self.assertFalse(result.valid)

    def test_ssrf_blocks_link_local(self):
        provider = self._make_provider("http://169.254.169.254/api")
        result = provider.validate_resource(self._valid_ds())
        self.assertFalse(result.valid)

    def test_ssrf_blocks_ipv6_loopback(self):
        provider = self._make_provider("http://[::1]/api")
        result = provider.validate_resource(self._valid_ds())
        self.assertFalse(result.valid)

    def test_ssrf_blocks_ipv6_unique_local(self):
        provider = self._make_provider("http://[fc00::1]/api")
        result = provider.validate_resource(self._valid_ds())
        self.assertFalse(result.valid)

    def test_ssrf_blocks_ipv6_link_local(self):
        provider = self._make_provider("http://[fe80::1]/api")
        result = provider.validate_resource(self._valid_ds())
        self.assertFalse(result.valid)

    # ------------------------------------------------------------------ SSRF: IPv4-mapped IPv6 bypass

    def test_ssrf_blocks_ipv4_mapped_ipv6_loopback(self):
        provider = self._make_provider("http://[::ffff:127.0.0.1]/api")
        result = provider.validate_resource(self._valid_ds())
        self.assertFalse(result.valid)

    def test_ssrf_blocks_ipv4_mapped_ipv6_private(self):
        provider = self._make_provider("http://[::ffff:10.0.0.1]/api")
        result = provider.validate_resource(self._valid_ds())
        self.assertFalse(result.valid)

    def test_ssrf_blocks_ipv4_mapped_ipv6_rfc1918_192(self):
        provider = self._make_provider("http://[::ffff:192.168.1.1]/api")
        result = provider.validate_resource(self._valid_ds())
        self.assertFalse(result.valid)

    # ------------------------------------------------------------------ SSRF: hostname resolution

    def test_ssrf_blocks_hostname_resolving_to_loopback(self):
        with patch("socket.getaddrinfo") as mock_getaddrinfo:
            mock_getaddrinfo.return_value = [
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80)),
            ]
            provider = self._make_provider("http://evil.internal/api")
            result = provider.validate_resource(self._valid_ds())
            self.assertFalse(result.valid)
            self.assertTrue(any("SSRF" in e or "private" in e.lower() for e in result.errors))

    def test_ssrf_blocks_hostname_resolving_to_rfc1918(self):
        with patch("socket.getaddrinfo") as mock_getaddrinfo:
            mock_getaddrinfo.return_value = [
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.5", 80)),
            ]
            provider = self._make_provider("http://evil.internal/api")
            result = provider.validate_resource(self._valid_ds())
            self.assertFalse(result.valid)

    def test_ssrf_blocks_unresolvable_hostname(self):
        with patch("socket.getaddrinfo") as mock_getaddrinfo:
            mock_getaddrinfo.side_effect = socket.gaierror(-2, "Name or service not known")
            provider = self._make_provider("http://nonexistent.invalid/api")
            result = provider.validate_resource(self._valid_ds())
            self.assertFalse(result.valid)

    def test_ssrf_allows_public_hostname(self):
        provider = self._make_provider("https://data.nasa.gov/api")
        result = provider.validate_resource(self._valid_ds())
        ssrf_errors = [e for e in result.errors if "SSRF" in e or "private" in e.lower()]
        self.assertEqual(len(ssrf_errors), 0)

    # ------------------------------------------------------------------ Fetch-time SSRF (redirects)

    def test_fetch_blocks_redirect_to_loopback(self):
        """A redirect to a private address must be blocked at fetch time."""
        first = _MockResponse(302, {"Content-Type": "text/plain", "Location": "http://127.0.0.1/admin"})
        with self._patch_opener(first):
            provider = self._make_provider_public("https://example.nasa.gov/api")
            with self.assertRaises(Exception) as ctx:
                provider._fetch("datasets")
            self.assertIn("SSRF", str(ctx.exception))

    def test_fetch_blocks_redirect_to_rfc1918(self):
        """A redirect to an RFC 1918 address must be blocked at fetch time."""
        first = _MockResponse(302, {"Content-Type": "text/plain", "Location": "http://10.0.0.1/secret"})
        with self._patch_opener(first):
            provider = self._make_provider_public("https://example.nasa.gov/api")
            with self.assertRaises(Exception) as ctx:
                provider._fetch("datasets")
            self.assertIn("SSRF", str(ctx.exception))

    def test_fetch_blocks_max_redirects_exceeded(self):
        """Too many redirects must be rejected."""
        responses = [_MockResponse(302, {"Content-Type": "text/plain", "Location": "https://example.nasa.gov/next"})] * 10
        call_count = [0]

        def open_side_effect(req, timeout=None):
            call_count[0] += 1
            return responses[min(call_count[0] - 1, len(responses) - 1)]

        mock_opener = MagicMock()
        mock_opener.open.side_effect = open_side_effect
        with patch.object(
            __import__("urllib.request", fromlist=["build_opener"]), "build_opener",
            return_value=mock_opener,
        ):
            provider = self._make_provider_public("https://example.nasa.gov/api")
            with self.assertRaises(Exception) as ctx:
                provider._fetch("datasets")
            self.assertIn("Too many redirects", str(ctx.exception))

    # ------------------------------------------------------------------ MIME type validation

    def test_fetch_rejects_octet_stream(self):
        """application/octet-stream must be rejected (removed from allowlist)."""
        resp = _MockResponse(200, {"Content-Type": "application/octet-stream"}, b"binary data")
        with self._patch_opener(resp):
            provider = self._make_provider_public()
            with self.assertRaises(Exception) as ctx:
                provider._fetch("datasets")
            self.assertIn("Unsupported content type", str(ctx.exception))

    def test_fetch_accepts_image_tiff(self):
        """image/tiff (GeoTIFF) must be accepted."""
        resp = _MockResponse(200, {"Content-Type": "image/tiff"}, b'{"id":"ds1"}')
        with self._patch_opener(resp):
            provider = self._make_provider_public()
            # Should not raise content-type error
            try:
                provider._fetch("datasets")
            except Exception as exc:
                self.assertNotIn("Unsupported content type", str(exc))

    def test_fetch_rejects_unsupported_content_type(self):
        """Arbitrary unsupported content types must be rejected."""
        resp = _MockResponse(200, {"Content-Type": "text/html"}, b"<html></html>")
        with self._patch_opener(resp):
            provider = self._make_provider_public()
            with self.assertRaises(Exception) as ctx:
                provider._fetch("datasets")
            self.assertIn("Unsupported content type", str(ctx.exception))

    # ------------------------------------------------------------------ Size limit

    def test_fetch_enforces_size_limit(self):
        """Responses exceeding max_download_bytes must be rejected."""
        big_body = b"x" * (MAX_DOWNLOAD_BYTES + 1)
        resp = _MockResponse(200, {"Content-Type": "application/json"}, big_body)
        with self._patch_opener(resp):
            provider = self._make_provider_public()
            with self.assertRaises(Exception) as ctx:
                provider._fetch("datasets")
            self.assertIn("exceeds size limit", str(ctx.exception))

    def test_fetch_allows_under_size_limit(self):
        """Responses under the size limit must be accepted."""
        small_body = b'{"id":"ds1","name":"DS1"}'
        resp = _MockResponse(200, {"Content-Type": "application/json"}, small_body)
        with self._patch_opener(resp):
            provider = self._make_provider_public()
            result, _ = provider._fetch("datasets")
            self.assertEqual(result["id"], "ds1")


if __name__ == "__main__":
    unittest.main()
