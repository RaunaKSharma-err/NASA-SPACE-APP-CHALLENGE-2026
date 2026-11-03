# API Contract (v1)

Errors: `{"error": {"code", "message", "details"?}}`. Codes: validation_error (422), terrain_unavailable (404),
no_route (422), invalid_route_request (422), region_not_found (404), message_required (422), internal_error (500).
Schemas: `backend/app/schemas/*.py` (also served at `/docs`).

| Method & path | Purpose | Current behaviour |
|---|---|---|
| GET /api/v1/health | liveness | `{"status":"ok","version":"v1"}` |
| GET /api/v1/layers | `DatasetProvenance[]` | reads `data/metadata/datasets/*.json`; contains `mola-megdr` (verified) |
| GET /api/v1/regions | `Region[]` | reads `data/metadata/regions/*.json`; contains `gale-crater` (verified) |
| GET /api/v1/regions/{id}/observations | observations | 404 unknown region; reads `data/metadata/observations/<id>.json` if present (`available`), otherwise `no_observations_available` |
| POST /api/v1/routes/plan | slope-aware A* route | body: region_id, start{lon,lat}, target{lon,lat}, max_slope_deg (25), slope_weight (4). 404 unless terrain exists; `gale-crater` returns `terrain_status: "verified"`; `synthetic-demo` (when enabled) returns `terrain_status: "synthetic"` with warning; 500 `terrain_corrupt` on a bad file |
| POST /api/v1/assistant/query | grounded Q&A | `{query}` -> status ok / no_evidence / provider_unavailable, plus evidence list. No provider is configured, so `ok` never occurs by default |
| GET /api/v1/offline/regions | package integrity | scans `data/processed/*/manifest.json`, verifies SHA-256; contains `gale-crater` (integrity_ok: true) |
| POST /api/v1/sync/status | SIMULATED relay | `{action: status|disconnect|reconnect|enqueue|sync, message?}`; process-local state |

Route responses include `hazards_evaluated` (currently only `["slope"]`), `assumptions` and `warnings`.

## Verified Data
- **MOLA MEGDR** (`mola-megdr`): verified 2026-10-25. USGS Astrogeology/NASA PDS. 463 m/pixel. CC0.
  Access: https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif
- **Gale Crater** (`gale-crater`): verified terrain grid at `data/processed/gale-crater/region.asc`.
  Bbox [-6.5, -5.5, 137.0, 138.0]. 100x100 cells at 0.01 degree. MOLA-derived elevations.