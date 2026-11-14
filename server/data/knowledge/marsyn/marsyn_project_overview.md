# MARSYN Project Overview

## What MARSYN Is
MARSYN is a prototype Mars mission-planning and visualization application focused on terrain-aware route exploration in Gale Crater. It combines a 3D globe interface, local elevation terrain, route planning, and an offline AI assistant.

## Core Components
- **Frontend:** React + TypeScript + Three.js globe/terrain visualization and mission UI
- **Backend:** FastAPI services for routing, datasets/regions, assistant queries, and offline/sync simulation
- **AI:** Local Ollama model (`qwen2.5:0.5b`) with retrieval-grounded answers from project data and knowledge documents

## Current Focus
- **Region:** Gale Crater (verified integrated terrain coverage)
- **Use cases:** Visualize terrain context, compute slope-aware routes, inspect route metrics, and ask questions grounded in available evidence

## Important Scope
- MARSYN is a planning prototype, **not** a certified astronaut safety or operational mission system.
- Scientific claims should be limited to verified integrated data and documented limitations.

## Sources
- MARSYN project repository and metadata (local project documentation)
- NASA/USGS MOLA data provenance in project metadata (see datasets)