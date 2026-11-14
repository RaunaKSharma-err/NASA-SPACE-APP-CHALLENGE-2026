# MARSYN Route Planning

## How Routing Works (current implementation)
- **Algorithm:** A* pathfinding over the terrain grid
- **Terrain basis:** MOLA-derived elevation grid (Gale Crater extract)
- **Neighbors:** 8-connectivity (including diagonals, subject to slope/corner rules in implementation)
- **Costs:** Route cost considers horizontal distance, slope/gradient constraints, and configured weights (e.g., slope/elevation/hazard-weight parameters as exposed by the planner)

## Inputs and Constraints
- Start and destination coordinates within supported terrain coverage
- Maximum slope and weighting parameters (UI/config)
- NoData/out-of-coverage cells are treated as impassable/unavailable as applicable

## Outputs
- Route coordinates/waypoints (backend-calculated)
- Distance and slope-related metrics (e.g., max/mean slope, elevation gain/loss where available)
- Terrain coverage/warnings and assumptions

## Important Limitations
- **Slope-only terrain model:** Does not account for rocks, regolith properties, dust, thermal conditions, radiation, or dynamic hazards.
- **Resolution:** ~463 m/pixel DEM is coarse for rover-scale or EVA-scale traverse safety.
- **Not a safety system:** Results are planning aids, not certified navigation or astronaut safety guidance.
- **Hazard controls:** “Hazard avoidance” weights in UI do not imply integrated hazard datasets unless explicitly provided.

## Sources
- MARSYN backend routing implementation (`server/backend/app/services/routing.py`)
- MARSYN project documentation and route schemas (local project)