# Ingesting a real terrain region (after the dataset is verified)
1. Verify the dataset (see `DATA_SOURCES.md`). Convert a GeoTIFF to a degree-based grid in metres of elevation:
   `gdal_translate -of AAIGrid -projwin <ulx uly lrx lry> source.tif region.asc` (geographic CRS required;
   projected grids are rejected). The loader cannot check units/CRS from `.asc`: you are responsible for them.
2. Put the file at `data/processed/<region_id>/region.asc`.
3. Create `data/metadata/datasets/<id>.json` (`DatasetProvenance`; set `terrain_file: "region.asc"`, fill every
   provenance field, use `status: "verified"` only after verification) and
   `data/metadata/regions/<region_id>.json` (`Region`; set `terrain_dataset_id`). Template: `docs/examples/`.
4. `cd backend && python -m app.cli build-package <region_id> --version 1` then `verify-package`.
5. `POST /api/v1/routes/plan` now serves the region; `GET /api/v1/offline/regions` reports package integrity.
Optional observations: `data/metadata/observations/<region_id>.json` (a JSON list of records with provenance).
