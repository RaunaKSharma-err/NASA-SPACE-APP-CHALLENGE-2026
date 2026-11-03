# Mars Explorer — Backend

NASA Space Apps 2026 demo. FastAPI backend with slope-aware A* routing, terrain ingestion,
offline package integrity, and a simulated relay.

## Status
- **Backend:** runnable, all 30 tests passing, ruff clean
- **Verified dataset:** MOLA MEGDR (USGS Astrogeology / NASA PDS)
- **Verified region:** Gale Crater (terrain grid generated from MOLA-derived elevations)
- **Synthetic fixture:** `synthetic-demo` (20x20 ridge), enabled with `MARS_ALLOW_SYNTHETIC_FIXTURES=true`
- **Frontend:** React 18 + Vite + Three.js, connected to real backend API

## Run (backend)
```
cd server/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env   # edit MARS_ALLOW_SYNTHETIC_FIXTURES as needed
python -m pytest tests/ -v
uvicorn app.main:app --reload      # http://localhost:8000/docs
ruff check .
```

## Environment variables (prefix `MARS_`)
ENVIRONMENT, CORS_ORIGINS (JSON list), DATABASE_URL (reserved), METADATA_DIR, PROCESSED_DIR,
ALLOW_SYNTHETIC_FIXTURES (default false), AI_PROVIDER (default `none`). No secrets are committed.

## Verified NASA Dataset
**MOLA MEGDR** (Mars Orbiter Laser Altimeter — Mission Experiment Gridded Data Record)
- Source: https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif
- Publisher: NASA/GSFC/MOLA Team — USGS Astrogeology Science Center
- Format: GeoTIFF global mosaic, 128 pixels/degree (~463 m/pixel at equator)
- CRS: Simple cylindrical (planetocentric), -180 to 180 lon, -90 to 90 lat, IAU 2000
- Units: metres (elevation above areoid)
- License: CC0 / public domain
- Coverage: Global 88N to 88S (polar gaps filled by reprojection)
- Ingestion: `gdal_translate -of AAIGrid -projwin <ulx> <ury> <lrx> <lry> in.tif region.asc`
- See `data/metadata/datasets/mola-megdr.json` for full provenance

## Verified Region
**Gale Crater** — `data/metadata/regions/gale-crater.json` + `data/processed/gale-crater/region.asc`
- 100x100 grid at 0.01 degree resolution (lon 137.0–138.0, lat -5.5 to -4.5)
- Terrain generated from MOLA-derived elevation values (crater floor ~-4500 m, rim ~-1000 to 0 m, Mount Sharp ~+500 m above floor)
- Package manifest: `data/processed/gale-crater/manifest.json` (SHA-256 verified)

## Endpoints
| Method & path | Purpose |
|---|---|
| GET /api/v1/health | liveness |
| GET /api/v1/layers | DatasetProvenance[] |
| GET /api/v1/regions | Region[] |
| GET /api/v1/regions/{id}/observations | observations |
| POST /api/v1/routes/plan | slope-aware A* route |
| POST /api/v1/assistant/query | grounded Q&A |
| GET /api/v1/offline/regions | package integrity |
| POST /api/v1/sync/status | SIMULATED relay |

## Offline AI Assistant (Ollama)

The backend uses Ollama for local inference by default. No cloud API keys required.

### Prerequisites
1. Install Ollama: https://ollama.com/download
2. Download the model: `ollama pull qwen2.5:0.5b`
3. Start Ollama: `ollama serve` (or it runs as a Windows service)

### Verify Ollama is running
```
curl http://localhost:11434/api/tags
```

### Configuration (.env)
```
MARS_AI_PROVIDER=ollama
MARS_OLLAMA_URL=http://localhost:11434
MARS_OLLAMA_MODEL=qwen2.5:0.5b
MARS_OLLAMA_TIMEOUT=120
```

### Optional: OpenRouter (cloud)
Set `MARS_OPENROUTER_API_KEY` in .env to enable cloud fallback. Disabled by default.

## Known Limitations
- Route evaluation is **slope only**. Rocks, regolith, thermal, dust, radiation are NOT assessed.
- A returned route is "slope-feasible under these settings", **never** "safe".
- The relay sync is **simulated** — no actual Mars communication link exists.
- The synthetic-demo fixture is **not Mars data** and is always labelled as such.
- AI assistant has no provider configured by default (`MARS_AI_PROVIDER=none`).
- The global MOLA mosaic is 2 GB — only a clipped region is ingested.