"""Provider package: resource-agnostic scientific data access.

Providers are separated into:
- LocalFileProvider: reads from local .asc terrain grids + JSON metadata (default, always enabled)
- RemoteHttpProvider: fetches from configurable HTTP endpoints (opt-in, disabled until configured)

No NASA endpoints, formats, or schemas are assumed. Remote providers require explicit
configuration before they are enabled.
"""
