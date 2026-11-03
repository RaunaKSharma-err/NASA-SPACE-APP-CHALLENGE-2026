# Handover report for Kilo Code
Environment of this sprint: Python 3.12, **no network**, FastAPI/pydantic/pytest/ruff not installed, Node present
but no packages installable. Therefore only stdlib-testable logic was executed.

1. **Working (verified by running):** slope-aware A* router (`services/routing.py`), Esri ASCII grid ingestion
   (`services/grid_io.py`), package builder/verifier CLI (`app/cli.py`), offline manifest + SHA-256 verification and
   simulated relay (`services/offline.py`), keyword retrieval/assistant logic (`services/ai.py`).
2. **Written but NOT run:** everything importing FastAPI/pydantic (`main.py`, `api/v1/*`, `core/*`, `schemas/*`,
   `services/registry.py`, `services/terrain.py`, the observations loader) and `tests/test_api.py`. Only `py_compile` was checked.
3. **NASA data:** none verified. See `docs/DATA_SOURCES.md`. Synthetic fixture `synthetic-demo` is not Mars data.
4. **Endpoints:** `docs/API_CONTRACT.md`. 5. **Setup:** `README.md`.
6. **Tests run:** `python3 -m unittest discover -s tests -t .` -> 30 run, 21 passed, 9 skipped (HTTP tests, no FastAPI).
   Ruff and type checks: not run.
7. **Known gaps:** no frontend; no DB models; no real terrain loader; no observations data; no real AI provider;
   no packaging command that builds `data/processed/<region>/manifest.json`; auth/rate limits absent.
8. **Env vars:** see README.
9. **Next, in priority order:** (a) install deps, run pytest + ruff, fix; (b) verify one region and one elevation
   dataset, write metadata JSON; (c) convert the verified GeoTIFF with `gdal_translate -of AAIGrid`, follow `docs/INGESTION.md`; (d) frontend (React, Vite,
   Cesium) against the contract; (e) package builder + frontend IndexedDB caching; (f) real AI provider behind
   `get_provider`.
10. **Do not silently change:** slope-only honesty (never call a route "safe"); synthetic data always labelled;
    relay is simulated; AI never affects route validation; lon range -180..360 accepted; placeholder slope limit
    is not a rover spec.

PROJECT_CONTEXT checklist: tick only "Backend scaffold created (HTTP layer unrun)". Everything else stays unticked.
