"""ESRI ASCII Grid (.asc) format adapter.

Wraps the existing grid_io.load_ascii_grid() parser. No new parsing logic
is introduced — this adapter merely exposes the existing parser through
the format adapter interface.

ASCII Grid format details:
- Header: ncols, nrows, xllcorner/yllcorner (or center), cellsize, nodata_value
- Data: space-separated floating-point values, one row per line
- Coordinates must be geographic (degrees); projected coordinates are rejected
"""

from __future__ import annotations

from pathlib import Path

from app.services.grid_io import GridFormatError, load_ascii_grid

from .base import FormatAdapter, FormatCapability, ParseResult, ParsedGrid


class AsciiGridAdapter(FormatAdapter):
    """Adapter for Esri ASCII Grid (.asc) elevation files."""

    capabilities = FormatCapability(
        format_name="Esri ASCII Grid",
        mime_types=("text/plain", "application/octet-stream"),
        extensions=(".asc", ".txt"),
    )

    def can_handle(self, format_name: str, mime_type: str | None, extension: str | None) -> bool:
        if format_name and "ascii" in format_name.lower() and "grid" in format_name.lower():
            return True
        if extension and extension.lower() in self.capabilities.extensions:
            return True
        if mime_type and mime_type in self.capabilities.mime_types:
            return True
        return False

    def parse(self, data: bytes, metadata: dict) -> ParseResult:
        """Parse ASCII Grid bytes. Expects data to be written to a temp file
        and the path provided in metadata['path'], or data directly."""
        errors: list[str] = []
        warnings: list[str] = []

        path = metadata.get("path")
        if path is None:
            # Try to parse from raw bytes by writing to a temp file
            import tempfile
            try:
                with tempfile.NamedTemporaryFile(mode="wb", suffix=".asc", delete=False) as f:
                    f.write(data)
                    path = f.name
            except OSError as exc:
                return ParseResult(
                    success=False,
                    errors=[f"Cannot write temp file for parsing: {exc}"],
                )

        try:
            grid = load_ascii_grid(Path(path))
        except GridFormatError as exc:
            return ParseResult(success=False, errors=[str(exc)])
        except Exception as exc:  # noqa: BLE001 - parse errors are reported, not raised
            return ParseResult(success=False, errors=[f"Parse error: {exc}"])

        # Determine CRS classification from metadata, not from the file itself.
        # .asc files do not carry CRS info — it must come from dataset metadata.
        crs_units = metadata.get("crs_units", "degrees")
        crs_type = metadata.get("crs_type", "geographic" if crs_units == "degrees" else "projected")

        # Reject projected ASCII Grid — the existing parser already enforces degree origins
        if crs_type == "projected":
            warnings.append(
                "ASCII Grid with projected CRS: coordinates are not lat/lon — "
                "transformation required before geographic use"
            )

        parsed = ParsedGrid(
            rows=grid.elevation,
            origin_lon=grid.origin_lon,
            origin_lat=grid.origin_lat,
            cell_deg=grid.cell_deg,
            nodata_value=metadata.get("nodata_value"),
            crs_units=str(crs_units),
            crs_type=str(crs_type),
            source_format=self.capabilities.format_name,
        )
        return ParseResult(success=True, grid=parsed, warnings=tuple(warnings))

    def validate(self, metadata: dict) -> tuple[bool, list[str]]:
        """Validate metadata for an ASCII Grid dataset."""
        errors: list[str] = []
        crs_units = metadata.get("crs_units", "degrees")
        if crs_units not in ("degrees", "radians", "metres"):
            errors.append(f"Invalid CRS units: {crs_units}")
        return (len(errors) == 0, errors)


# Register the adapter on import
from .base import format_registry  # noqa: E402

format_registry.register(AsciiGridAdapter())
