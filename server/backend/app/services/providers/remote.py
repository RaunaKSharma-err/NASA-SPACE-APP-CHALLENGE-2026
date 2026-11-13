"""Remote HTTP provider: fetches scientific data from configurable endpoints.

This provider is opt-in and DISABLED until a valid base_url is supplied.
No NASA endpoints, formats, or schemas are assumed. All remote configuration
is provided through Settings (environment variables), never hardcoded.
Authentication, when required, is handled entirely on the backend.

Security measures:
- SSRF protection: blocks private/internal IP ranges (RFC 1918, loopback, link-local)
  including hostname resolution and IPv4-mapped IPv6 bypasses (::ffff:127.0.0.1)
- Redirect revalidation: each redirect hop is re-checked against SSRF rules
- Content-type validation: requires application/json, text/*, or image/tiff responses
- File-size limits: max 50 MB download per request (streaming enforcement)
- Timeout on all requests
"""

from __future__ import annotations

import ipaddress
import json
import socket
import urllib.error
import urllib.request
from http.client import HTTPResponse
from typing import Optional
from urllib.parse import urljoin

from app.core.config import Settings
from app.core.errors import AppError

from .base import (
    BaseProvider,
    DatasetMetadata,
    ElevationSample,
    ProviderCapabilities,
    ProviderUnavailable,
    ValidationCheck,
    ValidationResult,
)

# ---------------------------------------------------------------------------
# Security: blocked IP ranges for SSRF protection
# ---------------------------------------------------------------------------

_PRIVATE_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),      # RFC 1918 private
    ipaddress.ip_network("172.16.0.0/12"),   # RFC 1918 private
    ipaddress.ip_network("192.168.0.0/16"),  # RFC 1918 private
    ipaddress.ip_network("127.0.0.0/8"),     # loopback
    ipaddress.ip_network("169.254.0.0/16"),  # link-local
    ipaddress.ip_network("::1/128"),         # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),        # IPv6 unique local
    ipaddress.ip_network("fe80::/10"),       # IPv6 link-local
]

MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024  # 50 MB
MAX_REDIRECTS = 5
ALLOWED_CONTENT_TYPES = ("application/json", "text/plain", "text/csv", "image/tiff")
CHUNK_SIZE = 65536


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Handler that does NOT follow redirects — returns the 3xx response instead."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Returning None prevents redirect following


def _extract_ipv4_from_mapped_v6(addr: ipaddress.IPv6Address) -> Optional[ipaddress.IPv4Address]:
    """Extract embedded IPv4 from IPv4-mapped IPv6 address (::ffff:a.b.c.d)."""
    return addr.ipv4_mapped if addr.ipv4_mapped else None


def _is_address_blocked(addr: ipaddress.IPv4Address | ipaddress.IPv6Address, allow_localhost: bool = False) -> bool:
    """Check if a single IP address is blocked, handling IPv4-mapped IPv6."""
    if isinstance(addr, ipaddress.IPv6Address):
        mapped = _extract_ipv4_from_mapped_v6(addr)
        if mapped is not None:
            addr = mapped

    if allow_localhost and addr in (ipaddress.ip_address("127.0.0.1"), ipaddress.ip_address("::1")):
        return False

    return any(addr in net for net in _PRIVATE_NETWORKS)


def _is_blocked_host(host: str, allow_localhost: bool = False) -> bool:
    """Return True if the host resolves to a private/internal address.

    Resolves hostnames via DNS and checks ALL resolved addresses.
    Handles IPv4-mapped IPv6 bypasses (::ffff:127.0.0.1).
    Blocks by default on any resolution error.
    """
    try:
        if host.startswith("[") and host.endswith("]"):
            host = host[1:-1]

        try:
            addr = ipaddress.ip_address(host)
            return _is_address_blocked(addr, allow_localhost)
        except ValueError:
            pass

        try:
            infos = socket.getaddrinfo(host, None, 0, socket.SOCK_STREAM)
        except (socket.gaierror, OSError):
            return True

        for _family, _type, _proto, _canonname, sockaddr in infos:
            ip_str = sockaddr[0]
            try:
                addr = ipaddress.ip_address(ip_str)
                if _is_address_blocked(addr, allow_localhost):
                    return True
            except ValueError:
                continue

        return False
    except Exception:
        return True


class RemoteHttpProvider(BaseProvider):
    id = "remote"
    type = "remote"

    def __init__(self, settings: Settings, enabled: bool = False, priority: int = 10):
        self.settings = settings
        self.enabled = enabled and bool(getattr(settings, "remote_data_base_url", None))
        self.priority = priority
        self.base_url = getattr(settings, "remote_data_base_url", None)
        self.timeout_ms = int(getattr(settings, "remote_data_timeout_ms", 10000) or 10000)
        self.capabilities = ProviderCapabilities(
            capabilities=("elevation", "imagery", "regions", "observations"),
            supports_streaming=True,
            supports_caching=True,
            requires_auth=False,
        )
        self._last_error: Optional[str] = None
        self._last_status: Optional[int] = None
        self._max_download_bytes = int(getattr(settings, "remote_data_max_bytes", MAX_DOWNLOAD_BYTES) or MAX_DOWNLOAD_BYTES)
        self._allow_localhost = bool(getattr(settings, "remote_data_allow_localhost", False))

    def list_datasets(self, region_id: str | None = None, dtype: str | None = None) -> list[DatasetMetadata]:
        self._last_error = None
        self._last_status = None
        if not self.enabled:
            return []
        try:
            raw, status = self._fetch("datasets")
            self._last_status = status
            items = raw if isinstance(raw, list) else []
            datasets = [self._normalize_dataset(item) for item in items]
            if region_id:
                pass
            if dtype:
                datasets = [d for d in datasets if d.type == dtype]
            return datasets
        except Exception as exc:
            self._last_error = str(exc)
            return []

    def sample_elevation(self, dataset_id: str, lat: float, lon: float) -> ElevationSample:
        self._last_error = None
        self._last_status = None
        if not self.enabled:
            return self._invalid_sample(dataset_id, lat, lon, "Remote provider is disabled")
        if not self.base_url:
            return self._invalid_sample(dataset_id, lat, lon, "Remote provider has no base URL configured")

        try:
            path = (
                f"elevation?dataset_id={dataset_id}"
                f"&lat={lat}&lon={lon}"
            )
            raw, status = self._fetch(path)
            self._last_status = status
            return self._normalize_elevation(raw, dataset_id, lat, lon)
        except Exception as exc:
            self._last_error = str(exc)
            return self._invalid_sample(dataset_id, lat, lon, f"Remote elevation request failed: {exc}")

    def get_imagery(self, dataset_id: str, lat_min: float, lat_max: float, lon_min: float, lon_max: float) -> list[dict]:
        self._last_error = None
        self._last_status = None
        if not self.enabled:
            return []
        try:
            path = (
                f"imagery?dataset_id={dataset_id}"
                f"&lat_min={lat_min}&lat_max={lat_max}"
                f"&lon_min={lon_min}&lon_max={lon_max}"
            )
            raw, status = self._fetch(path)
            self._last_status = status
            return raw if isinstance(raw, list) else []
        except Exception as exc:
            self._last_error = str(exc)
            return []

    def validate_resource(self, dataset: DatasetMetadata) -> ValidationResult:
        checks: dict[str, ValidationCheck] = {}
        errors: list[str] = []
        warnings: list[str] = []

        checks["configured"] = ValidationCheck(
            passed=self.enabled,
            message="Remote provider is enabled" if self.enabled else "Remote provider is disabled",
        )
        if not self.enabled:
            warnings.append("Remote provider is not enabled or not configured")

        checks["reachable"] = ValidationCheck(
            passed=bool(self.base_url),
            message=f"Base URL configured: {self.base_url}" if self.base_url else "No base URL configured",
        )
        if not self.base_url:
            errors.append("Remote provider has no base URL configured")

        checks["format"] = ValidationCheck(
            passed=bool(dataset.format),
            message=f"Format: {dataset.format}" if dataset.format else "No format declared",
        )

        checks["crs_units"] = ValidationCheck(
            passed=dataset.crs_units in ("degrees", "radians"),
            message=(
                "CRS uses geographic units"
                if dataset.crs_units in ("degrees", "radians")
                else f"CRS units are '{dataset.crs_units}' — coordinate transformation required before use"
            ),
        )
        if dataset.crs_units not in ("degrees", "radians"):
            warnings.append(f"CRS units '{dataset.crs_units}' are projected — transformation required")

        checks["bounds"] = ValidationCheck(
            passed=self._valid_bounds(dataset),
            message="Bounds within valid lat/lon ranges" if self._valid_bounds(dataset) else "Invalid lat/lon bounds",
        )
        if not self._valid_bounds(dataset):
            errors.append("Bounds contain invalid latitude or longitude")

        if self.base_url:
            host = self._host_from_url(self.base_url)
            blocked = _is_blocked_host(host, self._allow_localhost)
            checks["ssrf_safe"] = ValidationCheck(
                passed=not blocked,
                message=(
                    "Base URL does not point to a private/internal network"
                    if not blocked
                    else "Base URL points to a private/internal network — blocked for SSRF protection"
                ),
            )
            if blocked:
                errors.append("Base URL blocked by SSRF protection")

        return ValidationResult(
            valid=len(errors) == 0,
            errors=tuple(errors),
            warnings=tuple(warnings),
            checks=checks,
        )

    @staticmethod
    def _host_from_url(url: str) -> str:
        from urllib.parse import urlparse
        return urlparse(url).hostname or ""

    def _fetch(self, path: str) -> tuple[object, int]:
        if not self.base_url:
            raise ProviderUnavailable("Remote provider has no base URL configured")

        url = self.base_url.rstrip("/") + "/" + path.lstrip("/")
        redirect_count = 0

        while redirect_count <= MAX_REDIRECTS:
            host = self._host_from_url(url)
            if _is_blocked_host(host, self._allow_localhost):
                raise ProviderUnavailable(f"URL blocked by SSRF protection: {host}")

            req = urllib.request.Request(url, headers={"Accept": "application/json, text/plain, image/tiff, */*"})
            opener = urllib.request.build_opener(_NoRedirectHandler())

            resp: Optional[HTTPResponse] = None
            try:
                resp = opener.open(req, timeout=self.timeout_ms / 1000.0)
                status = resp.status

                if 300 <= status < 400:
                    redirect_count += 1
                    if redirect_count > MAX_REDIRECTS:
                        raise ProviderUnavailable("Too many redirects")
                    location = resp.headers.get("Location")
                    if not location:
                        raise ProviderUnavailable("Redirect without Location header")
                    url = urljoin(url, location)
                    resp.close()
                    continue

                content_type = resp.headers.get("Content-Type", "")
                if content_type and not any(
                    content_type.startswith(ct) for ct in ALLOWED_CONTENT_TYPES
                ):
                    raise ProviderUnavailable(
                        f"Unsupported content type: {content_type}. Expected one of {ALLOWED_CONTENT_TYPES}"
                    )

                body = b""
                while True:
                    chunk = resp.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    body += chunk
                    if len(body) > self._max_download_bytes:
                        raise ProviderUnavailable(
                            f"Response exceeds size limit of {self._max_download_bytes} bytes"
                        )

                body_text = body.decode("utf-8")

            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                raise ProviderUnavailable(f"Remote request failed: {exc}") from exc
            finally:
                if resp is not None:
                    resp.close()

            try:
                return json.loads(body_text), status
            except json.JSONDecodeError as exc:
                raise ProviderUnavailable(f"Remote returned invalid JSON: {exc}") from exc

        raise ProviderUnavailable("Too many redirects")

    def _normalize_dataset(self, raw: object) -> DatasetMetadata:
        obj = raw if isinstance(raw, dict) else {}
        attribution = obj.get("attribution") if isinstance(obj, dict) else None
        return DatasetMetadata(
            id=str(obj.get("id", "unknown")),
            name=str(obj.get("name", obj.get("id", "Unknown Dataset"))),
            type=str(obj.get("type", "elevation")),
            source=str(obj.get("source", "Unknown")),
            format=str(obj.get("format", "Unknown")),
            crs_name=str((obj.get("crs") or {}).get("name", "Unknown")) if isinstance(obj.get("crs"), dict) else "Unknown",
            crs_authority=(obj.get("crs") or {}).get("authority") if isinstance(obj.get("crs"), dict) else None,
            crs_code=(obj.get("crs") or {}).get("code") if isinstance(obj.get("crs"), dict) else None,
            lon_min=float((obj.get("bounds") or {}).get("minLon", -180)) if isinstance(obj.get("bounds"), dict) else -180.0,
            lon_max=float((obj.get("bounds") or {}).get("maxLon", 180)) if isinstance(obj.get("bounds"), dict) else 180.0,
            lat_min=float((obj.get("bounds") or {}).get("minLat", -90)) if isinstance(obj.get("bounds"), dict) else -90.0,
            lat_max=float((obj.get("bounds") or {}).get("maxLat", 90)) if isinstance(obj.get("bounds"), dict) else 90.0,
            crs_units=str((obj.get("crs") or {}).get("units", "degrees")) if isinstance(obj.get("crs"), dict) else "degrees",
            crs_type=str((obj.get("crs") or {}).get("crs_type", "geographic")) if isinstance(obj.get("crs"), dict) else "geographic",
            transformation_required=bool((obj.get("crs") or {}).get("transformation_required", False)) if isinstance(obj.get("crs"), dict) else False,
            resolution_value=float(obj.get("resolution", {}).get("value", 0)) if isinstance(obj.get("resolution"), dict) else 0.0,
            resolution_unit=str(obj.get("resolution", {}).get("unit", "metres")) if isinstance(obj.get("resolution"), dict) else "metres",
            value_unit=str(obj.get("units", {}).get("valueUnit", "unknown")) if isinstance(obj.get("units"), dict) else "unknown",
            value_reference=(obj.get("units") or {}).get("reference") if isinstance(obj.get("units"), dict) else None,
            organization=str(attribution.get("organization", "Unknown")) if isinstance(attribution, dict) else "Unknown",
            dataset_title=str(attribution.get("datasetTitle", attribution.get("name", "Unknown"))) if isinstance(attribution, dict) else "Unknown",
            source_url=str(attribution.get("sourceUrl", "")) if isinstance(attribution, dict) and attribution.get("sourceUrl") else None,
            access_url=str(attribution.get("accessUrl", "")) if isinstance(attribution, dict) and attribution.get("accessUrl") else None,
            acquisition_date=str(attribution.get("acquisitionDate", "")) if isinstance(attribution, dict) and attribution.get("acquisitionDate") else None,
            processing_date=str(attribution.get("processingDate", "")) if isinstance(attribution, dict) and attribution.get("processingDate") else None,
            processing_steps=tuple(str(s) for s in (attribution.get("processingSteps") or [])) if isinstance(attribution, dict) else tuple(),
            license=str(attribution.get("license", "")) if isinstance(attribution, dict) and attribution.get("license") else None,
            limitations=tuple(str(s) for s in (attribution.get("limitations") or [])) if isinstance(attribution, dict) else tuple(),
            status=str(obj.get("status", "unverified")),
            validated_at=str(obj.get("validatedAt", "")) if obj.get("validatedAt") else None,
            validation_notes=tuple(),
            size_bytes=int(obj.get("sizeBytes", 0)) if isinstance(obj.get("sizeBytes"), (int, float)) else None,
            checksum=str(obj.get("checksum", "")) if obj.get("checksum") else None,
            terrain_file=str(obj.get("terrainFile", "")) if obj.get("terrainFile") else None,
        )

    def _normalize_elevation(self, raw: object, dataset_id: str, lat: float, lon: float) -> ElevationSample:
        obj = raw if isinstance(raw, dict) else {}
        value = obj.get("value")
        value = float(value) if isinstance(value, (int, float)) else None
        return ElevationSample(
            id=str(obj.get("id", "remote")),
            dataset_id=dataset_id,
            lat=lat,
            lon=lon,
            value=value,
            valid=value is not None,
            units=str(obj.get("units", "metres")),
            nodata=bool(obj.get("nodata", value is None)),
            crs_name=str(obj.get("crs_name", "Simple cylindrical (planetocentric)")),
            crs_units=str(obj.get("crs_units", "degrees")),
        )

    def _invalid_sample(self, dataset_id: str, lat: float, lon: float, reason: str) -> ElevationSample:
        return ElevationSample(
            id="remote",
            dataset_id=dataset_id,
            lat=lat,
            lon=lon,
            value=None,
            valid=False,
            units="metres",
            nodata=True,
        )

    def _valid_bounds(self, dataset: DatasetMetadata) -> bool:
        return (
            -180 <= dataset.lon_min <= 360
            and -180 <= dataset.lon_max <= 360
            and -90 <= dataset.lat_min <= 90
            and -90 <= dataset.lat_max <= 90
            and dataset.lon_min <= dataset.lon_max
            and dataset.lat_min <= dataset.lat_max
        )

    @property
    def last_error(self) -> Optional[str]:
        return self._last_error

    @property
    def last_status(self) -> Optional[int]:
        return self._last_status
