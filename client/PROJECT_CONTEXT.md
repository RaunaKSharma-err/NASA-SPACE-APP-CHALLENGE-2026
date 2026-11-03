# Mars Explorer — Interplanetary Survival Guide: Martian Map

## NASA Space Apps Challenge 2026

### Overview

Mars Explorer is a mission-planning workstation that helps a human explorer on Mars inspect scientific data, evaluate terrain, discover scientifically interesting locations, and plan safer exploration routes. The interface is designed as a dark, futuristic, aerospace mission-control application.

---

## Architecture

### Tech Stack

- **React 18** with TypeScript (strict mode)
- **Vite 7** as the build tool
- **Tailwind CSS 3** for styling
- **CesiumJS** for 3D Mars globe visualization
- **Zustand** for local UI state management
- **TanStack Query** for server-state management
- **IndexedDB** for persistent client-side cache (region selection, sync metadata)
- **Vitest + React Testing Library** for testing
- **lucide-react** for icons

### File Structure

```
src/
├── App.tsx                     # Main workspace layout, providers, settings modal
├── main.tsx                    # React entry point
├── index.css                   # Global styles, Tailwind, custom components
├── types/
│   └── index.ts                # All TypeScript interfaces and types
├── data/
│   ├── mars-data.ts            # Fallback data: regions, layers, targets, observations
│   └── mocks.ts                # Simulated route planning and assistant query logic
├── lib/
│   ├── api-client.ts           # Centralized typed API client with fallback
│   └── cache.ts                # IndexedDB wrapper for persistent cache
├── store/
│   └── mission-store.ts        # Zustand store: region, layers, targets, routes, etc.
├── components/
│   ├── MarsGlobe.tsx            # CesiumJS 3D Mars globe with markers and routes
│   ├── MissionHeader.tsx       # Top bar: branding, region, status, online/offline
│   ├── LayerControlPanel.tsx   # Left panel: search, data layers, targets, legend
│   ├── RegionSelector.tsx      # Dropdown for mission region selection
│   ├── TargetDetailsPanel.tsx  # Right panel: selected target info, evidence, hazards
│   ├── RoutePlannerPanel.tsx   # Right panel: route form, alternatives, metrics
│   ├── MissionAssistant.tsx    # Right panel: AI assistant chat with evidence/sources
│   ├── DataProvenancePanel.tsx # Data source attribution and cache status
│   ├── OfflineStatusIndicator.tsx # Connection state indicator
│   ├── RelaySyncPanel.tsx      # Simulated relay sync controls
│   ├── MissionInfoStrip.tsx    # Bottom bar: coordinates, distance, layers, cache
│   └── ui/
│       ├── LoadingState.tsx    # Reusable loading indicator
│       └── ErrorState.tsx      # Reusable error display with retry
└── __tests__/
    ├── setup.ts                # Vitest + jest-dom setup
    ├── vitest.d.ts             # Type references for test globals
    ├── components/ui.test.tsx  # Tests for LoadingState and ErrorState
    ├── store/mission-store.test.ts # Tests for Zustand store actions
    └── data/mocks.test.ts      # Tests for route planning and assistant fixtures
```

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `VITE_API_BASE_URL` | Backend API base URL | `http://localhost:8000/api/v1` |
| `VITE_CESIUM_ACCESS_TOKEN` | Cesium Ion access token (optional — fallback imagery used if absent) | — |

No secrets are exposed in frontend environment variables.

---

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint |
| `npx vitest run` | Run test suite |
| `npx vitest` | Run tests in watch mode |

---

## API Integration Contract

The API client (`src/lib/api-client.ts`) attempts to fetch from the backend first, then falls back to local fixture data. All endpoints are proposed contracts — none are confirmed to exist yet.

| Endpoint | Method | Description | Fallback |
|---|---|---|---|
| `/health` | GET | Service health check | Returns `down` status |
| `/regions` | GET | List mission regions | Returns `REGIONS` from mars-data.ts |
| `/layers` | GET | List available data layers | Returns `DATA_LAYERS` from mars-data.ts |
| `/regions/{region_id}/observations` | GET | Scientific observations for a region | Returns filtered `OBSERVATIONS` |
| `/routes/plan` | POST | Plan a route between two points | Uses local `planRoute()` simulation |
| `/assistant/query` | POST | Query the AI mission assistant | Uses local `queryAssistant()` fixture |

All API calls include a 5-second timeout (10s for route planning, 15s for assistant). Failures are caught and fallback data is used seamlessly.

---

## Features That Work

1. **3D Mars Globe** — Three.js renders Mars with a procedurally generated texture, orbital camera controls (drag, zoom, click), and region-targeted markers with pulsing animations
2. **6 Mission Regions** — Gale Crater, Jezero Crater, Olympus Mons, Valles Marineris, Hellas Basin, Olympia Planitia
3. **7 Data Layers** — MOLA elevation, CRISM mineralogy, THEMIS thermal, hazard map (available); HiRISE, MARSIS, SHARAD (marked unavailable)
4. **11 Scientific Targets** — Clickable markers on the globe with verified/estimated status, evidence lists, and source attribution
5. **Route Planning** — Enter coordinates, set max slope and vehicle speed, toggle hazard avoidance; generates 3 route alternatives with distance, time, slope, hazard count, and confidence
6. **Route Visualization** — Selected route drawn on the 3D globe with color-coded hazard level
7. **AI Mission Assistant** — Chat interface with quick-query buttons; responses include evidence, sources, and uncertainty levels; clearly labeled as development fixture
8. **Offline Support** — Online/offline/degraded states, IndexedDB cache for region selection and sync metadata, simulated relay sync panel
9. **Search** — Search by coordinates (lat, lon) or known target name
10. **Collapsible Panels** — Left and right panels can be toggled for full-screen globe view
11. **Tabbed Right Panel** — Switch between Target details, Route planner, and Assistant
12. **Data Provenance** — Active data sources listed with layer counts; cached vs. available layer tracking
13. **Bottom Info Strip** — Live display of target coordinates, route distance, elevation, slope, visible layers, and cache status
14. **Settings Modal** — Shows API endpoint, 3D globe info, and data mode info
15. **"Use as Route Destination"** — Target details panel includes a button that fills route planner end coordinates and switches context
16. **Coordinate Validation** — Route planner validates lat/lon ranges before submission and shows specific error messages
17. **Accessibility** — Focus-visible outlines, ARIA labels on icon buttons, semantic tablist/tabpanel roles, reduced-motion support

---

## Features Requiring Backend Implementation

1. **Live data fetching** — All API endpoints currently fall back to fixture data. Implement the backend to serve real data.
2. **Real AI assistant** — The assistant uses keyword-matched fixture responses. Connect to an LLM or NLP service for real queries.
3. **Authentic Mars imagery** — The globe uses a procedurally generated canvas texture (not NASA imagery). Replace with NASA Mars terrain/imagery tiles (e.g., MOLA DEM, HiRISE tiles) when available.
4. **Real route planning** — Route computation uses simulated waypoints. Implement terrain-aware pathfinding on the backend using MOLA DEM data.
5. **Full offline cache** — Only region selection and sync metadata are cached. Full offline operation requires caching map tiles and scientific data.
6. **User authentication** — No auth is implemented. Add Supabase auth if user accounts are needed.

---

## Test Results

- **Test suite:** 3 test files, 26 tests — all passing
- **TypeScript:** No errors (`tsc --noEmit`)
- **Production build:** Succeeds (`vite build`)
- **Test coverage:**
  - UI components (LoadingState, ErrorState) — 8 tests
  - Zustand store actions — 11 tests
  - Mock data (route planning, assistant) — 7 tests

---

## Known Limitations

1. The 3D globe uses a procedurally generated canvas texture, not authentic NASA data — clearly labeled on the globe overlay as "Demonstration Globe"
2. Route planning uses simulated terrain data, not real MOLA DEM pathfinding
3. AI assistant responses are keyword-matched fixtures, not generated by an LLM — clearly labeled with a "Fixture" badge
4. Some data layers (HiRISE, MARSIS, SHARAD) are marked as unavailable and cannot be toggled on
5. Cache size is estimated, not measured from actual IndexedDB usage
6. The "relay sync" is simulated — no actual Mars communication link exists (clearly labeled in the UI)

---

## Next Implementation Tasks

1. Connect to the real backend API when available
2. Replace demonstration imagery with NASA Mars texture tiles
3. Implement real terrain-aware route planning using MOLA DEM
4. Connect AI assistant to a real LLM or NLP backend
5. Add full offline map tile caching via service worker
6. Add user authentication via Supabase if needed
7. Add real-time observation data streaming
8. Implement collaborative mission planning (multi-user)
