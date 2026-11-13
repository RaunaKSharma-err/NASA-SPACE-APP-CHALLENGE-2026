"""Format adapter package.

Registers format adapters on import. Additional adapters can be added
here when new scientific data formats need to be supported.
"""

from app.services.formats.ascii_grid import AsciiGridAdapter  # noqa: F401
from app.services.formats.base import FormatAdapter, FormatCapability, ParseResult, ParsedGrid, FormatRegistry, format_registry  # noqa: F401

__all__ = [
    "AsciiGridAdapter",
    "FormatAdapter",
    "FormatCapability",
    "ParseResult",
    "ParsedGrid",
    "FormatRegistry",
    "format_registry",
]
