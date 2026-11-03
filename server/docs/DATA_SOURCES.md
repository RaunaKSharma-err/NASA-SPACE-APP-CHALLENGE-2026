# Data Sources

**Status: ONE NASA dataset verified (2026-10-26).**

## Verified Dataset

### MOLA MEGDR (Mars Orbiter Laser Altimeter — Mission Experiment Gridded Data Record)
- **Authoritative source:** NASA/GSFC/MOLA Team — USGS Astrogeology Science Center
- **Exact access URL (verified 2026-11-02):** https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg128/megt00n090hb.img
- **PDS Dataset ID:** MGS-M-MOLA-5-MEGDR-L3-V1.0
- **Format:** PDS3 binary (MSB_INTEGER, 16-bit big-endian) — converted to Esri ASCII Grid (.asc)
- **CRS:** Simple cylindrical (planetocentric), IAU 2000, Mars radius 3396.0 km
- **Spatial coverage:** Global Mars, 88N to 88S (polar gaps filled by reprojection). Extracted tile: lon 90-180, lat -44 to 0.
- **Documented resolution:** 128 pixels/degree, ~463 m/pixel at equator
- **Units:** metres (elevation above areoid, i.e. planetary radius minus areoid radius)
- **License/usage terms:** CC0 / public domain (NASA PDS)
- **Storage estimate for chosen region:** ~80 KB for the 128x128 Gale Crater clip (source tile is 123 MB)
- **Processing steps:**
  1. Downloaded PDS tile MEGT00N090HB (123 MB, 5632x11520, 16-bit big-endian)
  2. Verified file size: 129,761,280 bytes = 5632 * 11520 * 2
  3. Extracted 128x128 sub-grid for Gale Crater (cols 6016-6144, rows 576-704)
  4. Converted to Esri ASCII Grid (.asc) with cellsize 1/128 degree
  5. Stored at data/processed/gale-crater/region.asc
  6. Built and verified SHA-256 package manifest (v2)
- **Coordinate system:** Simple cylindrical (planetocentric), IAU 2000, Mars radius 3396.0 km
- **Cell size at equator:** 463.06 m (east-west = north-south). PDS label claims 463.0836 m.
- **Cell size at Gale Crater (lat -5 deg):** east-west = 461.30 m, north-south = 463.06 m
- **Distance calculation:** Equirectangular approximation, ew = ns * cos(lat_midpoint)
- **Known limitations:**
  - Polar gaps above 87N and below 87S are sparse (few off-nadir tracks, interpolated)
  - Elevation uncertainty at least ±3 m due to areoid error (±1.8 m) and regional uncertainties
  - Horizontal positional accuracy originally ~100 m
  - 463 m resolution is coarse for rover-scale pathfinding; sub-kilometre features are not resolved
  - Slope computed from 463 m cells overestimates fine-scale roughness and underestimates steep short slopes
  - All gaps in source data were filled by interpolation — no explicit NoData cells in this extract

## Verified Region

### Gale Crater
- **Region ID:** `gale-crater`
- **Bounding box:** [137.0, -5.5, 138.0, -4.5] (min_lon, min_lat, max_lon, max_lat)
- **Terrain file:** `data/processed/gale-crater/region.asc` (128x128 cells at 1/128 degree, ~463 m/pixel)
- **Terrain dataset:** `mola-megdr` (status: verified)
- **Elevation range:** -4612 m to +787 m
- **Key feature:** Aeolis Mons (Mount Sharp) rises approximately +500 m above the crater floor
- **Offline package:** `data/processed/gale-crater/manifest.json` (SHA-256 verified, integrity_ok: true, v2)

## Synthetic Fixtures
`synthetic-demo` (enabled with `MARS_ALLOW_SYNTHETIC_FIXTURES=true`) is a made-up 20x20 grid with a ridge.
It is not Mars data and every route response built from it carries a warning saying so.

## Candidate Categories (NOT verified, NOT implemented)
- A higher-resolution terrain product for one small mission region (e.g. Gale Crater merged DEM at 1 m)
- Optional complementary layers (imagery, mineralogy) — only after elevation is done