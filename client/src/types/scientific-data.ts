// client/src/types/scientific-data.ts
//
// Unified, provider-agnostic interfaces for scientific data resources.
// These contracts are independent of any file format, provider, or NASA endpoint.
// They are intentionally minimal and optional where real documentation is not yet available.

import type { LayerType, LayerSource } from "./index";

// ---------------------------------------------------------------------------
// Coordinate Reference System
// ---------------------------------------------------------------------------

export interface CoordinateReferenceSystem {
  name: string;
  authority?: string;        // e.g. "IAU 2000", "EPSG", "USGS"
  code?: string;             // e.g. "4326", "MOLA-MEGDR"
  longitudeRange?: [number, number]; // valid lon domain, e.g. [-180, 180]
  latitudeRange?: [number, number];  // valid lat domain, e.g. [-90, 90]
  units: "degrees" | "radians" | "metres";
  crsType: "geographic" | "projected" | "unknown"; // geographic=lat/lon, projected=map coordinates
  datum?: string;            // e.g. "areoid", "geoid", "WGS84"
  ellipsoid?: string;        // e.g. "IAU 2000 Mars", "WGS84"
  transformationRequired: boolean; // true if coordinates must be transformed before use as lat/lon
}

// ---------------------------------------------------------------------------
// Geographic bounds
// ---------------------------------------------------------------------------

export interface GeographicBounds {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
  crs: CoordinateReferenceSystem;
}

// ---------------------------------------------------------------------------
// Spatial resolution
// ---------------------------------------------------------------------------

export interface SpatialResolution {
  value: number;
  unit: "metres" | "degrees" | "pixels-per-degree";
  description?: string;
}

// ---------------------------------------------------------------------------
// Measurement units
// ---------------------------------------------------------------------------

export interface MeasurementUnits {
  valueUnit: string;         // e.g. "metres", "kelvin", "percent", "DN"
  reference?: string;        // e.g. "areoid", "geoid", "sea level"
  validRange?: [number, number]; // expected min/max, when known
}

// ---------------------------------------------------------------------------
// Source attribution
// ---------------------------------------------------------------------------

export interface DataSourceAttribution {
  organization: string;          // e.g. "NASA/GSFC/MOLA Team"
  datasetTitle: string;          // human-readable title
  sourceUrl?: string;            // public landing page
  accessUrl?: string;            // direct file / endpoint URL (may require auth)
  acquisitionDate?: string;      // ISO-8601 date when data was captured
  processingDate?: string;       // ISO-8601 date when product was generated
  processingSteps?: string[];    // human-readable processing history
  license?: string;              // e.g. "CC0", "PDS public domain"
  limitations?: string[];        // known caveats
}

// ---------------------------------------------------------------------------
// Dataset metadata (provider-agnostic)
// ---------------------------------------------------------------------------

export interface DatasetMetadata {
  id: string;
  name: string;
  type: LayerType;
  source: LayerSource;
  format: string;                // e.g. "Esri ASCII Grid", "GeoTIFF", "NetCDF", "JSON"
  crs: CoordinateReferenceSystem;
  bounds: GeographicBounds;
  resolution: SpatialResolution;
  units: MeasurementUnits;
  attribution: DataSourceAttribution;
  status: "verified" | "unverified" | "synthetic" | "partial";
  validatedAt?: string;          // ISO-8601 when last validated
  validationNotes?: string[];
  sizeBytes?: number;
  checksum?: string;             // SHA-256 hex digest
  terrainFile?: string;          // local file name for elevation datasets (backend-side)
}

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export interface ValidationCheck {
  passed: boolean;
  message: string;
  detail?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checks: Record<string, ValidationCheck>;
}

// ---------------------------------------------------------------------------
// Generic scientific measurement (lat/lon point sample)
// ---------------------------------------------------------------------------

export interface ScientificMeasurement {
  id: string;
  datasetId: string;
  lat: number;
  lon: number;
  value: number | null;
  valid: boolean;
  units: string;
  crs: CoordinateReferenceSystem;
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Elevation sample (specialized measurement)
// ---------------------------------------------------------------------------

export interface ElevationSample extends ScientificMeasurement {
  nodata: boolean;               // true when value is NoData / missing
  elevationM: number | null;     // explicit metres alias for clarity
}

// ---------------------------------------------------------------------------
// Imagery reference
// ---------------------------------------------------------------------------

export interface ImageryReference {
  id: string;
  datasetId: string;
  bounds: GeographicBounds;
  url?: string;                  // tile URL, data URL, or signed endpoint
  format: string;                // "png", "jpeg", "webp", "geotiff"
  attribution: DataSourceAttribution;
}

// ---------------------------------------------------------------------------
// Provider configuration (frontend-facing, no secrets)
// ---------------------------------------------------------------------------

export type ProviderType = "local" | "remote";

export interface DataProviderConfig {
  type: ProviderType;
  enabled: boolean;
  priority: number;              // lower = tried first
  basePath?: string;             // local: relative path to data directory
  baseUrl?: string;              // remote: base API / file URL
  timeoutMs?: number;
  // NOTE: API keys and secrets are NEVER stored here. They live on the backend only.
}

// ---------------------------------------------------------------------------
// Source selection mode
// ---------------------------------------------------------------------------

export type SourceSelectionMode = "local" | "remote" | "remote_with_fallback";

export interface SourceSelectionResult {
  datasets: DatasetMetadata[];
  source: "local" | "remote" | "fallback";
  mode: SourceSelectionMode;
  fallbackReason?: string;
  providerUsed?: string;
}

export interface ElevationResult {
  sample: ElevationResponse;
  source: "local" | "remote" | "fallback";
  mode: SourceSelectionMode;
  providerUsed?: string;
  fallbackReason?: string;
}

export interface ImageryResult {
  imagery: ImageryReference[];
  source: "local" | "remote" | "fallback";
  mode: SourceSelectionMode;
  providerUsed?: string;
  fallbackReason?: string;
}

// ---------------------------------------------------------------------------
// Provider capability
// ---------------------------------------------------------------------------

export type ProviderCapability =
  | "elevation"
  | "imagery"
  | "regions"
  | "observations"
  | "routes";

export interface ProviderCapabilities {
  capabilities: ProviderCapability[];
  supportsStreaming: boolean;
  supportsCaching: boolean;
  requiresAuth: boolean;
}

// ---------------------------------------------------------------------------
// Data request / result contracts
// ---------------------------------------------------------------------------

export interface ElevationRequest {
  lat: number;
  lon: number;
  datasetId: string;
}

export type ElevationResponse = ElevationSample;

export interface DatasetListRequest {
  regionId?: string;
  type?: LayerType;
}

export interface DatasetListResult {
  datasets: DatasetMetadata[];
  source: "local" | "remote" | "fallback";
}
