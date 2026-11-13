"""Base class and data structures for scientific data format adapters.

Adapters separate resource retrieval from file parsing. Each adapter:
- declares which formats/MIME types/extensions it can handle
- parses raw bytes into a normalized scientific data structure
- validates the parsed data before it enters the application

No speculative parsers are implemented — only ESRI ASCII Grid (existing)
is included. Additional formats (GeoTIFF, PDS IMG, CSV, JSON, binary)
can be added by registering new adapters without modifying existing code.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class FormatCapability:
    """Describes what a format adapter can handle."""
    format_name: str           # e.g. "Esri ASCII Grid", "GeoTIFF"
    mime_types: tuple[str, ...] = field(default_factory=tuple)   # e.g. ("text/plain",)
    extensions: tuple[str, ...] = field(default_factory=tuple)   # e.g. (".asc", ".txt")


@dataclass(frozen=True)
class ParsedGrid:
    """Normalized output from a raster/elevation format adapter."""
    rows: list[list[float | None]]   # elevation values; None = NoData
    origin_lon: float                # degrees
    origin_lat: float                # degrees
    cell_deg: float                  # degrees per cell
    nodata_value: float | None
    crs_units: str                   # "degrees" | "metres" | ...
    crs_type: str                    # "geographic" | "projected" | "unknown"
    source_format: str               # original format name


@dataclass(frozen=True)
class ParseResult:
    """Result of parsing a resource."""
    success: bool
    grid: ParsedGrid | None = None
    errors: tuple[str, ...] = field(default_factory=tuple)
    warnings: tuple[str, ...] = field(default_factory=tuple)


class FormatAdapter(Protocol):
    """Protocol for format adapters. Implementations must provide all methods."""

    capabilities: FormatCapability

    def can_handle(self, format_name: str, mime_type: str | None, extension: str | None) -> bool:
        """Return True if this adapter can parse the given resource."""
        ...

    def parse(self, data: bytes, metadata: dict) -> ParseResult:
        """Parse raw bytes into a ParsedGrid. Never raises — returns ParseResult with errors."""
        ...

    def validate(self, metadata: dict) -> tuple[bool, list[str]]:
        """Validate dataset metadata for this format. Returns (ok, errors)."""
        ...


class FormatRegistry:
    """Registry of format adapters. Adapters are registered by format name."""

    def __init__(self):
        self._adapters: dict[str, FormatAdapter] = {}
        self._by_extension: dict[str, FormatAdapter] = {}
        self._by_mime: dict[str, FormatAdapter] = {}

    def register(self, adapter: FormatAdapter) -> None:
        """Register a format adapter."""
        cap = adapter.capabilities
        self._adapters[cap.format_name.lower()] = adapter
        for ext in cap.extensions:
            self._by_extension[ext.lower()] = adapter
        for mime in cap.mime_types:
            self._by_mime[mime.lower()] = adapter

    def get(self, format_name: str) -> FormatAdapter | None:
        """Look up adapter by format name."""
        return self._adapters.get(format_name.lower())

    def get_by_extension(self, extension: str) -> FormatAdapter | None:
        """Look up adapter by file extension."""
        return self._by_extension.get(extension.lower())

    def get_by_mime(self, mime_type: str) -> FormatAdapter | None:
        """Look up adapter by MIME type."""
        return self._by_mime.get(mime_type.lower())

    def find(self, format_name: str | None, mime_type: str | None, extension: str | None) -> FormatAdapter | None:
        """Find the best matching adapter using format name, MIME type, or extension."""
        if format_name:
            adapter = self.get(format_name)
            if adapter:
                return adapter
        if mime_type:
            adapter = self.get_by_mime(mime_type)
            if adapter:
                return adapter
        if extension:
            adapter = self.get_by_extension(extension)
            if adapter:
                return adapter
        return None

    def list_formats(self) -> list[FormatCapability]:
        """List all registered format capabilities."""
        return [a.capabilities for a in self._adapters.values()]


# Global registry instance
format_registry = FormatRegistry()
