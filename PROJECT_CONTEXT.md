# Mars Explorer — Project Context

## NASA Space Apps Challenge 2026

### Overview
Mars Explorer is a mission-planning workstation that helps a human explorer inspect scientific data,
evaluate terrain, discover scientifically interesting locations, and plan safer exploration routes.
The interface is designed as a dark, futuristic, aerospace mission-control application.

### Status (verified 2026-11-02)
- **Backend:** FastAPI — runnable, 30/30 tests passing, ruff clean
- **Verified NASA dataset:** MOLA MEGDR (NASA PDS, CC0, 463 m/pixel) — REAL DATA INTEGRATED
- **Verified region:** Gale Crater (real MOLA elevation grid, 128x128, SHA-256 verified package)
- **Frontend:** React 18 + Vite + Three.js — connected to real backend API with fallback
- **Mars texture:** `client/src/public/textures/8k_mars.jpg` loaded via Three.js TextureLoader onto the existing SphereGeometry globe
- **Synthetic fixture:** `synthetic-demo` (20x20 ridge), clearly labelled, opt-in only

### Real Mars Terrain Data
- **Dataset:** MOLA MEGDR (Mars Orbiter Laser Altimeter — Mission Experiment Gridded Data Record)
- **PDS Dataset ID:** MGS-M-MOLA-5-MEGDR-L3-V1.0
- **Source tile:** MEGT00N090HB (lon 90-180, lat -44 to 0)
- **Download URL:** https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg128/megt00n090hb.img
- **File size:** 123 MB (129,761,280 bytes, verified)
- **Format:** PDS3 binary (MSB_INTEGER, 16-bit big-endian) converted to Esri ASCII Grid (.asc)
- **CRS:** Simple cylindrical (planetocentric), IAU 2000, Mars radius 3396.0 km
- **Resolution:** 128 pixels/degree (~463 m/pixel at equator)
- **Units:** metres (elevation above areoid)
- **License:** CC0 / public domain (NASA PDS)
- **Extracted region:** Gale Crater (lon 137.0-138.0, lat -5.5 to -4.5), 128x128 cells
- **Elevation range:** -4612 m to +787 m (crater floor to rim)
- **NoData handling:** MOLA interpolated all gaps; no explicit NoData cells in extract
- **SHA-256 verified:** Package manifest v2, integrity_ok: true

### Terrain Pipeline
1. Download PDS3 binary tile from WUSTL PDS
2. Verify file size (129,761,280 bytes)
3. Extract 128x128 sub-grid for Gale Crater (cols 6016-6144, rows 576-704)
4. Convert to Esri ASCII Grid (.asc) with cellsize 1/128 degree
5. Store at data/processed/gale-crater/region.asc
6. Update metadata JSON (dataset + region)
7. Build and verify SHA-256 package manifest

### Independent Scientific Validation (2026-11-02)
- **Source data:** PDS3 binary file verified (size, dimensions, byte order, sample type all match label)
- **Big-endian (MSB_INTEGER):** Confirmed — values in reasonable range (-4612 to +787 m)
- **Geographic extraction:** Column/row conversions verified against PDS label metadata
- **Cell centers:** Correctly computed (top-left: 137.004 deg E, -4.504 deg N)
- **Elevation range:** -4612 to +787 m (within MOLA label range of -8208 to +21249 m)
- **NoData:** 0 cells (MOLA interpolated all gaps)
- **Endianness:** Big-endian confirmed by direct binary comparison
- **Route recalculation:** Independent horizontal/surface/slope all match reported values (0.000000 discrepancy)
- **All 79 waypoints:** Valid grid cells, no invalid/NoData cells
- **Start/target mapping:** Correctly snapped to nearest cell centers

### Geospatial Resolution Consistency
- **Mars radius:** 3,396,000 m (from PDS label A/B/C_AXIS_RADIUS). Previously used 3,389,500 m (IAU mean) — corrected.
- **MOLA resolution:** 128 px/degree = 1/128 degree per cell
- **Cell size at equator:** 463.06 m (east-west = north-south). PDS label claims 463.0836 m. Match within 0.02 m.
- **Cell size at Gale Crater (lat -5 deg):** east-west = 461.30 m, north-south = 463.06 m
- **Projection:** Equirectangular (simple cylindrical) — east-west spacing varies as cos(latitude)
- **Distance formula:** hypot(col_diff * ew, row_diff * ns) where ew = ns * cos(lat_midpoint)
- **Route metrics (corrected radius):** 79 waypoints, 42,029 m horizontal, 42,087 m surface, max slope 6.77 deg, mean slope 2.59 deg
- **Previous metrics (wrong radius):** 41,949 m horizontal, 42,006 m surface, max slope 6.79 deg, mean slope 2.59 deg
- **Difference:** +80 m horizontal (+0.19%), consistent with radius correction

### Scientific Limitations
1. Route evaluation is slope only — rocks, regolith, thermal, dust, radiation NOT assessed
2. 463 m resolution is coarse for rover-scale pathfinding
3. Elevation uncertainty at least +/-3 m (areoid error +/-1.8 m)
4. Horizontal positional accuracy originally ~100 m
5. Max slope limit 25 deg is a configurable placeholder, NOT a validated rover specification
6. Slope weight 4.0 is a heuristic cost multiplier
7. 8-connectivity allows diagonal moves (may underestimate true path cost)
8. Python round() uses banker's rounding — edge case at exact 0.5 cell boundaries
9. Synthetic synthetic-demo fixture retained for tests (clearly labelled, opt-in only)
10. AI assistant has no provider configured (MARS_AI_PROVIDER=none)
11. 3D globe uses provided JPG texture (visual only, not verified NASA data)
12. Relay sync is simulated — no actual Mars communication link

### Backend-Frontend Integration
The frontend is connected to the following backend endpoints:

| Endpoint | Frontend Integration |
|---|---|
| `GET /api/v1/health` | Health check on app init, sets connection state |
| `GET /api/v1/regions` | Fetched on init, converted via `backendRegionToRegion`, populates store |
| `GET /api/v1/layers` | Fetched on init, converted via `backendDatasetToLayer`, populates store |
| `GET /api/v1/regions/{id}/observations` | Fetched when region changes, stored per-region in store |
| `POST /api/v1/routes/plan` | Route planning with backend terrain, slope-aware A* |
| `POST /api/v1/assistant/query` | Grounded Q&A via backend AI, fallback to mocks |
| `GET /api/v1/offline/regions` | Package integrity check via backend |
| `POST /api/v1/sync/status` | SIMULATED relay sync via backend endpoint |

### Backend-to-Frontend Type Conversions
- `BackendRegion` → `Region`: bbox center → lat/lon, status → missionStatus/hazardLevel, defaults for missing science fields
- `BackendDataset` → `DataLayer`: format/source → type, status → available, defaults for visual fields
- `BackendRouteResponse` → `RouteResult`: coordinates → waypoints, distance/slope fields mapped
- `BackendAssistantResponse` → `AssistantMessage`: answer/evidence/notes → content/evidence/sources

### Architecture
- **Backend:** Python 3.12+, FastAPI, Pydantic, stdlib-only routing/offline logic
- **Frontend:** React 18 + TypeScript, Vite 7, Tailwind CSS 3, Three.js (r186), Zustand, TanStack Query, IndexedDB

### Mars Texture Integration
- **Texture file:** `client/src/public/textures/8k_mars.jpg` (~8.4 MB, imported as Vite asset module)
- **Renderer:** Three.js `SphereGeometry` (radius 2) with `MeshPhongMaterial`, unchanged from original
- **Loading method:** `THREE.TextureLoader.load()` asynchronous, with `colorSpace = SRGBColorSpace`
- **Loading state:** Spinner overlay while texture loads; fallback to solid color (`0x8b4513`) on error
- **Memory management:** Texture disposed in component cleanup via `globeMat.dispose()`
- **Scientific integrity:** Texture is visual only — not used for elevation, slope, hazard, or routing. Not claimed as verified NASA dataset.
- **Orientation:** Equirectangular mapping with `wrapS = RepeatWrapping`, `wrapT = ClampToEdgeWrapping`

### Verified Data Provenance
| Dataset | Source | Resolution | Status | Scientific Use |
|---|---|---|---|---|
| MOLA MEGDR | NASA/GSFC/MOLA Team — USGS Astrogeology | 463 m/pixel | verified | Elevation/terrain routing |
| Mars texture JPG | `client/src/public/textures/8k_mars.jpg` | Unknown (visual only) | unverified | Visual texture only — not for science |

### Commands
| Command | Description |
|---|---|
| `cd server/backend && python -m pytest tests/ -v` | Run backend tests |
| `cd server/backend && ruff check .` | Lint backend |
| `cd server/backend && uvicorn app.main:app --reload` | Start backend (http://localhost:8000/docs) |
| `cd client && npm run dev` | Start frontend dev server |
| `cd client && npm run build` | Production build |
| `cd client && npm run typecheck` | TypeScript type check |
| `cd client && npx vitest run` | Run frontend tests |

### Verification Results
- TypeScript typecheck: 0 errors
- ESLint: 0 errors
- Production build: success (~800 kB JS bundle, texture copied to dist as hashed asset)
- Frontend tests: 43/43 passing (4 test files)
- Backend tests: 21 passed, 9 skipped (HTTP tests require fastapi test client), 10 subtests passed

### Offline AI Assistant (Ollama)
- **Runtime:** Ollama (local inference)
- **Model:** qwen2.5:0.5b (397 MB, Q4_K_M quantization)
- **Endpoint:** http://localhost:11434
- **Default provider:** ollama (configured in config.py and .env)
- **OpenRouter:** Optional, disabled unless MARS_OPENROUTER_API_KEY is set
- **API keys:** Never exposed to frontend; stored server-side only
- **Prompts:** Compact, context limited to region metadata + dataset provenance + route metrics
- **Concurrency:** Single generation lock (threading.Lock) — no concurrent inference on low-memory machines
- **Timeout:** 120 seconds (configurable via MARS_OLLAMA_TIMEOUT)
- **Context window:** num_predict=256 tokens (compact for 0.5B model)
- **No RAG, no vector DB, no agents, no tool calling**
- **Fallback:** ProviderUnavailable → returns evidence-only response (no fabrication)
- **Real inference tested:** Yes — Ollama running on localhost:11434, qwen2.5:0.5b responding
- **Observed latency:** 8-11 seconds per query on CPU (6 GB RAM machine)
- **Observed RAM:** ~400 MB for model (Q4_K_M quantization), ~2 GB total system during inference
- **Limitations on 6 GB RAM:** Model fits comfortably; inference is CPU-bound (~8-11s per response); no GPU acceleration used; concurrent requests serialized via lock

### Known Limitations
1. Route evaluation is **slope only** — rocks, regolith, thermal, dust, radiation NOT assessed
2. The relay sync is **simulated** — no actual Mars communication link
3. The 3D globe uses a provided JPG texture (visual only) — not authentic NASA imagery
4. AI assistant uses local Ollama (qwen2.5:0.5b) — responses are generated, not validated scientific results
5. The global MOLA mosaic is 2 GB — only clipped regions are ingested
6. Slope is computed between 463 m cell centres — fine-scale roughness is not resolved
7. Mars texture JPG provenance is unknown — treated as visual texture only
8. Backend region metadata lacks visual/science fields — defaults applied
9. Ollama must be installed and model downloaded before offline operation
10. Inference is CPU-bound (~8-11s per response) on 6 GB RAM machines
11. No GPU acceleration used
12. Python round() uses banker's rounding — edge case at exact 0.5 cell boundaries
