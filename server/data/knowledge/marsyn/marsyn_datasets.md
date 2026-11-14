# MARSYN Datasets and Coverage

## Currently Integrated Verified Scientific Dataset
- **Dataset:** MOLA MEGDR (Mars Orbiter Laser Altimeter, Mars Global Surveyor)
- **Status:** Verified (project metadata)
- **Coverage (integrated extract):** Gale Crater region, lon 137.0–138.0, lat -5.5 to -4.5
- **Resolution:** 128 pixels/degree (~463 m/pixel at equator)
- **Units:** Metres elevation relative to the areoid (per dataset metadata)
- **Format in project:** Esri ASCII Grid (.asc) derived from PDS source
- **Source (recorded):** NASA/GSFC/MOLA Team — USGS Astrogeology Science Center / NASA PDS

## Visual Assets
- **8K Mars globe texture:** Used for visual appearance only; provenance not verified as a scientific dataset in MARSYN. Not used for elevation, slope, or routing.

## Not Currently Integrated as Verified Scientific Layers
- CRISM mineral maps, HiRISE imagery, THEMIS thermal data, MARSIS/SHARAD radar, and hazard maps are not integrated as verified scientific datasets in the current MARSYN build (some may appear as UI/fixture concepts).

## Coverage Limitations
- No global MOLA terrain coverage in the integrated app dataset; terrain analysis/routing is limited to the Gale Crater extract.
- 463 m resolution does not capture rover-scale obstacles or fine roughness.

## Sources
- MARSYN `server/data/metadata/datasets/mola-megdr.json`
- MARSYN `server/data/metadata/regions/gale-crater.json`
- NASA PDS MOLA (cited in project metadata) — https://pds-geosciences.wustl.edu/missions/mgs/mola.html (NASA PDS)