# MOLA (Mars Orbiter Laser Altimeter)

## Overview
MOLA was an instrument on NASA’s Mars Global Surveyor (MGS) that measured the topography (elevation) of Mars using laser altimetry.

## How It Works
- A laser pulse is sent from the orbiter to the Martian surface.
- The instrument measures the time for the pulse to return.
- Distance and spacecraft position are used to compute surface elevation.

## What It Measures
- **Primary measurement:** Surface elevation/topography.
- **Products:** Global and regional digital elevation models (DEMs), gridded data records.

## Scientific Value
- Provides foundational global topography for Mars.
- Supports studies of geology, impact basins, volcanoes, valleys, and slope/terrain analysis.
- Used for mission planning, landing site characterization, and regional terrain modeling.

## MOLA in MARSYN (project context)
- MARSYN integrates **MOLA MEGDR** elevation data for the **Gale Crater** region (verified extract).
- Coverage in MARSYN: lon 137.0–138.0, lat -5.5 to -4.5; 128 px/degree (~463 m/pixel at equator).
- Elevation values are in metres relative to the areoid (per dataset metadata).
- This is the only verified scientific dataset currently integrated for terrain/routing in MARSYN.

## Limitations
- MOLA resolution (~463 m/pixel in this product) is coarse for rover-scale hazards.
- Elevation uncertainty and interpolation exist; fine-scale roughness is not captured.
- MOLA provides elevation, not direct information about rocks, dust, or composition.

## Sources
- NASA PDS: MOLA MEGDR — https://pds-geosciences.wustl.edu/missions/mgs/mola.html (NASA PDS Geosciences)
- NASA Science: Mars Global Surveyor — https://science.nasa.gov/mission/mars-global-surveyor/ (NASA)
- MARSYN dataset metadata: mola-megdr (local project metadata)