// client/src/lib/scientific-data.ts
//
// Provider-agnostic scientific data access layer.
//
// Design principles:
// - Local data is the default; remote data is opt-in and disabled until
//   valid configuration is supplied.
// - Missing remote configuration never breaks the application.
// - Failed remote requests fall back to valid local data where available.
// - No API keys or secrets are stored in frontend code.
// - No hardcoded resource URLs; all source details come from configuration.

import type {
  DatasetMetadata,
  DataProviderConfig,
  ElevationRequest,
  ElevationResponse,
  ElevationResult,
  ImageryReference,
  ImageryResult,
  ProviderCapabilities,
  SourceSelectionMode,
  SourceSelectionResult,
  ValidationCheck,
  ValidationResult,
  GeographicBounds,
  CoordinateReferenceSystem,
  DataSourceAttribution,
  SpatialResolution,
  MeasurementUnits,
} from "@/types/scientific-data";
import type { LayerType, LayerSource } from "@/types";

const DEFAULT_LOCAL_CONFIG: DataProviderConfig = {
  type: "local",
  enabled: true,
  priority: 0,
  basePath: "/",
};

// ---------------------------------------------------------------------------
// Abstract provider interface
// ---------------------------------------------------------------------------

export interface ScientificDataProvider {
  id: string;
  type: DataProviderConfig["type"];
  enabled: boolean;
  priority: number;
  capabilities: ProviderCapabilities;

  listDatasets(request?: { regionId?: string; type?: LayerType }): Promise<DatasetMetadata[]>;
  sampleElevation(request: ElevationRequest): Promise<ElevationResponse>;
  getImagery(datasetId: string, bounds: GeographicBounds): Promise<ImageryReference[]>;
  validateResource(dataset: DatasetMetadata): Promise<ValidationResult>;
}

// ---------------------------------------------------------------------------
// Null provider: used when no provider is configured or enabled
// ---------------------------------------------------------------------------

class NullProvider implements ScientificDataProvider {
  id = "null";
  type = "local" as const;
  enabled = false;
  priority = 1000;
  capabilities: ProviderCapabilities = {
    capabilities: [],
    supportsStreaming: false,
    supportsCaching: false,
    requiresAuth: false,
  };

  listDatasets(): Promise<DatasetMetadata[]> {
    return Promise.resolve([]);
  }

  sampleElevation(): Promise<ElevationResponse> {
    return Promise.resolve({
      id: "null",
      datasetId: "null",
      lat: NaN,
      lon: NaN,
      value: null,
      valid: false,
      units: "metres",
      nodata: true,
      elevationM: null,
      crs: defaultCrs(),
    });
  }

  getImagery(): Promise<ImageryReference[]> {
    return Promise.resolve([]);
  }

  validateResource(): Promise<ValidationResult> {
    return Promise.resolve({
      valid: false,
      errors: ["No data provider is configured"],
      warnings: [],
      checks: {},
    });
  }
}

// ---------------------------------------------------------------------------
// Local file provider: reads from Vite public assets + known local metadata
// ---------------------------------------------------------------------------

class LocalFileProvider implements ScientificDataProvider {
  id = "local";
  type = "local" as const;
  enabled: boolean;
  priority: number;
  capabilities: ProviderCapabilities = {
    capabilities: ["elevation", "regions", "observations"],
    supportsStreaming: false,
    supportsCaching: true,
    requiresAuth: false,
  };

  constructor(config: DataProviderConfig) {
    this.enabled = config.enabled !== false;
    this.priority = config.priority ?? 0;
  }

  async listDatasets(request?: {
    regionId?: string;
    type?: LayerType;
  }): Promise<DatasetMetadata[]> {
    // Local provider returns datasets derived from the local terrain tile
    // and static fallback metadata. No network request is made.
    const datasets: DatasetMetadata[] = [
      {
        id: "mola-megdr",
        name: "MOLA Mission Experiment Gridded Data Record (MEGDR)",
        type: "elevation",
        source: "MGS/MOLA",
        format: "Esri ASCII Grid",
        crs: defaultCrs(),
        bounds: {
          minLon: 137.0,
          maxLon: 138.0,
          minLat: -5.5,
          maxLat: -4.5,
          crs: defaultCrs(),
        },
        resolution: { value: 1 / 128, unit: "pixels-per-degree", description: "~463 m/pixel at equator" },
        units: { valueUnit: "metres", reference: "areoid" },
        attribution: {
          organization: "NASA/GSFC/MOLA Team — USGS Astrogeology Science Center",
          datasetTitle: "MOLA MEGDR",
          sourceUrl: "https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/",
          accessUrl: "/terrain/gale-crater.asc",
          license: "CC0 / public domain (NASA PDS)",
          limitations: [
            "Polar gaps above 87N and below 87S are sparse",
            "Elevation uncertainty at least ±3 m",
            "463 m resolution is coarse for rover-scale pathfinding",
          ],
        },
        status: "verified",
        validatedAt: "2026-11-02",
        sizeBytes: 131072,
        terrainFile: "gale-crater.asc",
      },
    ];

    let result = datasets;
    if (request?.type) {
      result = result.filter((d) => d.type === request.type);
    }
    if (request?.regionId) {
      // Gale Crater is the only local region with terrain coverage
      result = result.filter((d) => d.id === "mola-megdr");
    }
    return result;
  }

  async sampleElevation(request: ElevationRequest): Promise<ElevationResponse> {
    // Local provider cannot sample elevation without loading the full grid.
    // Delegates to the terrain module via the caller when terrain data is loaded.
    return {
      id: "local",
      datasetId: request.datasetId,
      lat: request.lat,
      lon: request.lon,
      value: null,
      valid: false,
      units: "metres",
      nodata: true,
      elevationM: null,
      crs: defaultCrs(),
    };
  }

  async getImagery(): Promise<ImageryReference[]> {
    return Promise.resolve([]);
  }

  async validateResource(dataset: DatasetMetadata): Promise<ValidationResult> {
    const checks: Record<string, ValidationCheck> = {};
    const errors: string[] = [];
    const warnings: string[] = [];

    checks.format = {
      passed: dataset.format.length > 0,
      message: dataset.format ? `Format declared: ${dataset.format}` : "No format declared",
    };

    checks.crs = {
      passed: !!dataset.crs && dataset.crs.units === "degrees",
      message: dataset.crs.units === "degrees"
        ? "CRS uses geographic degrees"
        : "CRS units are not degrees — may require reprojection",
    };

    checks.bounds = {
      passed: isValidBounds(dataset.bounds),
      message: isValidBounds(dataset.bounds)
        ? "Bounds within valid lat/lon ranges"
        : "Bounds contain invalid latitude or longitude",
    };

    checks.units = {
      passed: dataset.units.valueUnit.length > 0,
      message: dataset.units.valueUnit ? `Units: ${dataset.units.valueUnit}` : "No units declared",
    };

    checks.attribution = {
      passed: !!dataset.attribution.organization && !!dataset.attribution.datasetTitle,
      message: dataset.attribution.organization && dataset.attribution.datasetTitle
        ? "Attribution present"
        : "Missing source attribution",
    };

    if (!checks.crs.passed) errors.push(checks.crs.message);
    if (!checks.bounds.passed) errors.push(checks.bounds.message);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      checks,
    };
  }
}

// ---------------------------------------------------------------------------
// Remote HTTP provider: configurable, disabled until valid source details exist
// ---------------------------------------------------------------------------

class RemoteHttpProvider implements ScientificDataProvider {
  id = "remote";
  type = "remote" as const;
  enabled: boolean;
  priority: number;
  private baseUrl: string | undefined;
  private timeoutMs: number;

  capabilities: ProviderCapabilities = {
    capabilities: ["elevation", "imagery", "regions", "observations"],
    supportsStreaming: true,
    supportsCaching: true,
    requiresAuth: false, // auth is handled backend-side; frontend never holds keys
  };

  constructor(config: DataProviderConfig) {
    this.enabled = config.enabled === true && !!config.baseUrl;
    this.priority = config.priority ?? 10;
    this.baseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs ?? 10000;
  }

  private async fetchJson<T>(path: string): Promise<T> {
    if (!this.baseUrl) {
      throw new Error("Remote provider is not configured: no baseUrl");
    }
    const url = this.baseUrl.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Remote request failed: ${response.status} ${response.statusText}`);
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async listDatasets(): Promise<DatasetMetadata[]> {
    if (!this.enabled) {
      return [];
    }
    try {
      const raw = await this.fetchJson<unknown>("datasets");
      const list = Array.isArray(raw) ? raw : [];
      return list.map((item) => normalizeDataset(item));
    } catch {
      return [];
    }
  }

  async sampleElevation(request: ElevationRequest): Promise<ElevationResponse> {
    if (!this.enabled) {
      return notValidElevation(request);
    }
    try {
      const raw = await this.fetchJson<unknown>(
        `elevation?lat=${request.lat}&lon=${request.lon}&dataset_id=${request.datasetId}`,
      );
      return normalizeElevation(raw, request);
    } catch {
      return notValidElevation(request);
    }
  }

  async getImagery(datasetId: string, bounds: GeographicBounds): Promise<ImageryReference[]> {
    if (!this.enabled) {
      return [];
    }
    try {
      const raw = await this.fetchJson<unknown>(
        `imagery?dataset_id=${datasetId}&lat_min=${bounds.minLat}&lat_max=${bounds.maxLat}&lon_min=${bounds.minLon}&lon_max=${bounds.maxLon}`,
      );
      const list = Array.isArray(raw) ? raw : [];
      return list.map(normalizeImagery);
    } catch {
      return [];
    }
  }

  async validateResource(dataset: DatasetMetadata): Promise<ValidationResult> {
    const checks: Record<string, ValidationCheck> = {};
    const errors: string[] = [];
    const warnings: string[] = [];

    checks.reachable = {
      passed: this.enabled,
      message: this.enabled ? "Remote provider is enabled" : "Remote provider is disabled",
    };
    if (!this.enabled) {
      errors.push("Remote provider is disabled");
      warnings.push("Remote provider is not enabled");
    }

    checks.format = {
      passed: dataset.format.length > 0,
      message: dataset.format ? `Format: ${dataset.format}` : "No format declared",
    };

    checks.crs = {
      passed: !!dataset.crs,
      message: dataset.crs
        ? `CRS: ${dataset.crs.name} (${dataset.crs.crsType}, ${dataset.crs.units})${dataset.crs.transformationRequired ? " — coordinate transformation required before use as lat/lon" : ""}`
        : "No CRS declared",
      detail: dataset.crs,
    };

    if (!checks.crs.passed) errors.push(checks.crs.message);
    // Projected CRS is not an error, but it is a warning that coordinates
    // cannot be used directly as lat/lon without transformation.
    if (dataset.crs?.crsType === "projected") {
      warnings.push("CRS is projected (metres): coordinates are not lat/lon — transformation required");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      checks,
    };
  }
}

// ---------------------------------------------------------------------------
// Provider manager: source-selection aware
// ---------------------------------------------------------------------------

export interface ProviderCallResult<T> {
  data: T;
  source: "local" | "remote" | "fallback";
  providerUsed?: string;
  fallbackReason?: string;
}

class ScientificDataProviderManager {
  private providers: ScientificDataProvider[] =[];
  private defaultProvider: ScientificDataProvider;
  private sourceSelectionMode: SourceSelectionMode = "local";

  constructor(configs: DataProviderConfig[] = [], mode: SourceSelectionMode = "local") {
    const all: ScientificDataProvider[] = [];

    // Local provider is always registered (default data source)
    const localCfg = configs.find((c) => c.type === "local") || DEFAULT_LOCAL_CONFIG;
    const localProvider = new LocalFileProvider(localCfg);
    all.push(localProvider);

    // Remote provider is registered only when explicitly configured
    const remoteCfg = configs.find((c) => c.type === "remote");
    if (remoteCfg) {
      all.push(new RemoteHttpProvider(remoteCfg));
    }

    // Null provider as last resort
    all.push(new NullProvider());

    // Sort by priority (lower = tried first); stable sort preserves registration order for ties
    all.sort((a, b) => a.priority - b.priority);

    this.providers = all;
    this.defaultProvider = localProvider;
    this.sourceSelectionMode = mode;
  }

  getProviders(): ScientificDataProvider[] {
    return [...this.providers];
  }

  getEnabledProviders(): ScientificDataProvider[] {
    return this.providers.filter((p) => p.enabled);
  }

  getProvider(id: string): ScientificDataProvider | undefined {
    return this.providers.find((p) => p.id === id);
  }

  // ------------------------------------------------------------------ source selection

  getSourceSelectionMode(): SourceSelectionMode {
    return this.sourceSelectionMode;
  }

  setSourceSelectionMode(mode: SourceSelectionMode): void {
    this.sourceSelectionMode = mode;
  }

  isRemoteEnabled(): boolean {
    return this.providers.some((p) => p.type === "remote" && p.enabled);
  }

  // ------------------------------------------------------------------ datasets

  async listDatasets(request?: {
    regionId?: string;
    type?: LayerType;
  }): Promise<SourceSelectionResult> {
    const enabled = this.getEnabledProviders();
    const local = enabled.find((p) => p.type === "local");
    const remote = enabled.find((p) => p.type === "remote");

    // --- Mode: local only ---
    if (this.sourceSelectionMode === "local") {
      const datasets = local ? await local.listDatasets(request) : [];
      return {
        datasets,
        source: datasets.length > 0 ? "local" : "fallback",
        mode: "local",
        providerUsed: local?.id,
      };
    }

    // --- Mode: remote only ---
    if (this.sourceSelectionMode === "remote") {
      if (!remote) {
        return {
          datasets: [],
          source: "fallback",
          mode: "remote",
          fallbackReason: "Remote provider is not enabled",
          providerUsed: undefined,
        };
      }
      try {
        const datasets = await remote.listDatasets(request);
        if (datasets.length > 0) {
          return {
            datasets,
            source: "remote",
            mode: "remote",
            providerUsed: remote.id,
          };
        }
        // Remote returned empty — that's a valid (but empty) remote response; no fallback
        return {
          datasets: [],
          source: "remote",
          mode: "remote",
          providerUsed: remote.id,
        };
      } catch (exc) {
        return {
          datasets: [],
          source: "fallback",
          mode: "remote",
          fallbackReason: `Remote provider error: ${exc instanceof Error ? exc.message : String(exc)}`,
          providerUsed: remote.id,
        };
      }
    }

    // --- Mode: remote_with_fallback ---
    // Try remote first, then local on failure or empty result
    if (remote) {
      try {
        const datasets = await remote.listDatasets(request);
        if (datasets.length > 0) {
          return {
            datasets,
            source: "remote",
            mode: "remote_with_fallback",
            providerUsed: remote.id,
          };
        }
        // Remote returned empty — fall through to local fallback
      } catch {
        // Record fallback reason and continue to local
      }
    }

    // Fall back to local
    const datasets = local ? await local.listDatasets(request) : [];
    return {
      datasets,
      source: datasets.length > 0 ? "local" : "fallback",
      mode: "remote_with_fallback",
      fallbackReason: remote ? "Remote provider unavailable or returned no datasets" : "Remote provider not enabled",
      providerUsed: local?.id,
    };
  }

  async sampleElevation(request: ElevationRequest): Promise<ElevationResult> {
    const enabled = this.getEnabledProviders();
    const local = enabled.find((p) => p.type === "local");
    const remote = enabled.find((p) => p.type === "remote");

    // --- Mode: local only ---
    if (this.sourceSelectionMode === "local") {
      const result = local ? await local.sampleElevation(request) : notValidElevation(request);
      return {
        sample: result,
        source: result.valid ? "local" : "fallback",
        mode: this.sourceSelectionMode,
        providerUsed: local?.id,
      };
    }

    // --- Mode: remote only ---
    if (this.sourceSelectionMode === "remote") {
      if (!remote) {
        return {
          sample: notValidElevation(request),
          source: "fallback",
          mode: "remote",
          fallbackReason: "Remote provider is not enabled",
          providerUsed: undefined,
        };
      }
      try {
        const result = await remote.sampleElevation(request);
        if (result.valid) {
          return {
            sample: result,
            source: "remote",
            mode: "remote",
            providerUsed: remote.id,
          };
        }
        // Remote returned invalid — no fallback in remote-only mode
        return {
          sample: result,
          source: "fallback",
          mode: "remote",
          fallbackReason: "Remote provider returned invalid elevation",
          providerUsed: remote.id,
        };
      } catch (exc) {
        return {
          sample: notValidElevation(request),
          source: "fallback",
          mode: "remote",
          fallbackReason: `Remote provider error: ${exc instanceof Error ? exc.message : String(exc)}`,
          providerUsed: remote.id,
        };
      }
    }

    // --- Mode: remote_with_fallback ---
    if (remote) {
      try {
        const result = await remote.sampleElevation(request);
        if (result.valid) {
          return {
            sample: result,
            source: "remote",
            mode: "remote_with_fallback",
            providerUsed: remote.id,
          };
        }
      } catch {
        // Fall through to local
      }
    }

    // Fall back to local
    const result = local ? await local.sampleElevation(request) : notValidElevation(request);
    return {
      sample: result,
      source: result.valid ? "local" : "fallback",
      mode: "remote_with_fallback",
      fallbackReason: remote ? "Remote provider unavailable or returned invalid elevation" : "Remote provider not enabled",
      providerUsed: local?.id,
    };
  }

  async getImagery(datasetId: string, bounds: GeographicBounds): Promise<ImageryResult> {
    const enabled = this.getEnabledProviders();
    const local = enabled.find((p) => p.type === "local");
    const remote = enabled.find((p) => p.type === "remote");

    // --- Mode: local only ---
    if (this.sourceSelectionMode === "local") {
      const imagery = local ? await local.getImagery(datasetId, bounds) : [];
      return {
        imagery,
        source: imagery.length > 0 ? "local" : "fallback",
        mode: this.sourceSelectionMode,
        providerUsed: local?.id,
      };
    }

    // --- Mode: remote only ---
    if (this.sourceSelectionMode === "remote") {
      if (!remote) {
        return {
          imagery: [],
          source: "fallback",
          mode: "remote",
          fallbackReason: "Remote provider is not enabled",
          providerUsed: undefined,
        };
      }
      try {
        const imagery = await remote.getImagery(datasetId, bounds);
        return {
          imagery,
          source: imagery.length > 0 ? "remote" : "fallback",
          mode: "remote",
          providerUsed: remote.id,
          fallbackReason: imagery.length === 0 ? "Remote provider returned no imagery" : undefined,
        };
      } catch (exc) {
        return {
          imagery: [],
          source: "fallback",
          mode: "remote",
          fallbackReason: `Remote provider error: ${exc instanceof Error ? exc.message : String(exc)}`,
          providerUsed: remote.id,
        };
      }
    }

    // --- Mode: remote_with_fallback ---
    if (remote) {
      try {
        const imagery = await remote.getImagery(datasetId, bounds);
        if (imagery.length > 0) {
          return {
            imagery,
            source: "remote",
            mode: "remote_with_fallback",
            providerUsed: remote.id,
          };
        }
      } catch {
        // Fall through to local
      }
    }

    // Fall back to local
    const imagery = local ? await local.getImagery(datasetId, bounds) : [];
    return {
      imagery,
      source: imagery.length > 0 ? "local" : "fallback",
      mode: "remote_with_fallback",
      fallbackReason: remote ? "Remote provider unavailable or returned no imagery" : "Remote provider not enabled",
      providerUsed: local?.id,
    };
  }

  async validateResource(dataset: DatasetMetadata): Promise<ValidationResult> {
    // Run validation on the provider that owns this dataset
    const provider = this.getProvider(dataset.id.split("-")[0]) || this.defaultProvider;
    try {
      return await provider.validateResource(dataset);
    } catch {
      return {
        valid: false,
        errors: ["Validation failed: provider unavailable"],
        warnings: [],
        checks: {},
      };
    }
  }

  setRemoteConfig(config: DataProviderConfig): void {
    const idx = this.providers.findIndex((p) => p.type === "remote");
    if (idx >= 0) {
      this.providers[idx] = new RemoteHttpProvider(config);
    } else if (config.enabled) {
      this.providers.push(new RemoteHttpProvider(config));
    }
    this.providers.sort((a, b) => a.priority - b.priority);
  }

  disableRemote(): void {
    const remote = this.providers.find((p) => p.type === "remote");
    if (remote) {
      remote.enabled = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton manager instance (local-only by default)
// ---------------------------------------------------------------------------

const scientificDataManager = new ScientificDataProviderManager();

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function defaultCrs(): CoordinateReferenceSystem {
  return {
    name: "Simple cylindrical (planetocentric)",
    authority: "IAU 2000",
    code: "MOLA",
    longitudeRange: [-180, 180],
    latitudeRange: [-90, 90],
    units: "degrees",
    crsType: "geographic",
    datum: "areoid",
    ellipsoid: "IAU 2000 Mars",
    transformationRequired: false,
  };
}

function isValidBounds(b: GeographicBounds): boolean {
  const { minLon, maxLon, minLat, maxLat } = b;
  return (
    minLon >= -180 &&
    maxLon <= 360 &&
    minLat >= -90 &&
    maxLat <= 90 &&
    minLon <= maxLon &&
    minLat <= maxLat
  );
}

function notValidElevation(request: ElevationRequest): ElevationResponse {
  return {
    id: "none",
    datasetId: request.datasetId,
    lat: request.lat,
    lon: request.lon,
    value: null,
    valid: false,
    units: "metres",
    nodata: true,
    elevationM: null,
    crs: defaultCrs(),
  };
}

// Normalize raw remote dataset objects into DatasetMetadata.
// Fields that are missing are filled with safe defaults; nothing is fabricated.
function normalizeDataset(raw: unknown): DatasetMetadata {
  const obj = raw as Record<string, unknown>;
  const attribution = normalizeAttribution(obj.attribution);
  return {
    id: String(obj.id ?? "unknown"),
    name: String(obj.name ?? obj.id ?? "Unknown Dataset"),
    type: (obj.type as LayerType) ?? "elevation",
    source: (obj.source as LayerSource) ?? "Unknown",
    format: String(obj.format ?? "Unknown"),
    crs: obj.crs ? normalizeCrs(obj.crs) : defaultCrs(),
    bounds: obj.bounds ? normalizeBounds(obj.bounds) : defaultBounds(),
    resolution: obj.resolution
      ? normalizeResolution(obj.resolution)
      : { value: 0, unit: "metres" },
    units: obj.units ? normalizeUnits(obj.units) : { valueUnit: "unknown" },
    attribution,
    status: (obj.status as DatasetMetadata["status"]) ?? "unverified",
    sizeBytes: typeof obj.sizeBytes === "number" ? obj.sizeBytes : undefined,
    checksum: typeof obj.checksum === "string" ? obj.checksum : undefined,
  };
}

function normalizeElevation(raw: unknown, request: ElevationRequest): ElevationResponse {
  const obj = raw as Record<string, unknown>;
  const value = typeof obj.value === "number" ? obj.value : null;
  return {
    id: String(obj.id ?? "remote"),
    datasetId: request.datasetId,
    lat: request.lat,
    lon: request.lon,
    value,
    valid: value !== null && Number.isFinite(value),
    units: String(obj.units ?? "metres"),
    nodata: obj.nodata === true || value === null,
    elevationM: typeof obj.elevationM === "number" ? obj.elevationM : value,
    crs: defaultCrs(),
  };
}

function normalizeImagery(raw: unknown): ImageryReference {
  const obj = raw as Record<string, unknown>;
  return {
    id: String(obj.id ?? "unknown"),
    datasetId: String(obj.datasetId ?? obj.id ?? "unknown"),
    bounds: obj.bounds ? normalizeBounds(obj.bounds) : defaultBounds(),
    url: typeof obj.url === "string" ? obj.url : undefined,
    format: String(obj.format ?? "png"),
    attribution: normalizeAttribution(obj.attribution),
  };
}

function normalizeAttribution(raw: unknown): DataSourceAttribution {
  const obj = raw as Record<string, unknown> | undefined;
  return {
    organization: obj ? String(obj.organization ?? "Unknown") : "Unknown",
    datasetTitle: obj ? String(obj.datasetTitle ?? obj.name ?? "Unknown") : "Unknown",
    sourceUrl: obj && typeof obj.sourceUrl === "string" ? obj.sourceUrl : undefined,
    accessUrl: obj && typeof obj.accessUrl === "string" ? obj.accessUrl : undefined,
    acquisitionDate: obj && typeof obj.acquisitionDate === "string" ? obj.acquisitionDate : undefined,
    processingDate: obj && typeof obj.processingDate === "string" ? obj.processingDate : undefined,
    processingSteps: obj && Array.isArray(obj.processingSteps)
      ? obj.processingSteps.map(String)
      : [],
    license: obj && typeof obj.license === "string" ? obj.license : undefined,
    limitations: obj && Array.isArray(obj.limitations)
      ? obj.limitations.map(String)
      : [],
  };
}

function normalizeCrs(raw: unknown): CoordinateReferenceSystem {
  const obj = raw as Record<string, unknown>;
  const units = obj && typeof obj.units === "string" && ["degrees", "radians", "metres"].includes(obj.units)
    ? (obj.units as "degrees" | "radians" | "metres")
    : "degrees";
  // Classify CRS: geographic (degrees/radians) vs projected (metres).
  // Projected CRS coordinates are map coordinates, NOT lat/lon — they
  // require transformation before use. We never silently reinterpret them.
  const crsType: CoordinateReferenceSystem["crsType"] = units === "metres" ? "projected" : "geographic";
  const transformationRequired = crsType === "projected";
  return {
    name: String(obj.name ?? "Unknown CRS"),
    authority: obj && typeof obj.authority === "string" ? obj.authority : undefined,
    code: obj && typeof obj.code === "string" ? obj.code : undefined,
    longitudeRange: obj && Array.isArray(obj.longitudeRange)
      ? [Number(obj.longitudeRange[0]), Number(obj.longitudeRange[1])]
      : [-180, 180],
    latitudeRange: obj && Array.isArray(obj.latitudeRange)
      ? [Number(obj.latitudeRange[0]), Number(obj.latitudeRange[1])]
      : [-90, 90],
    units,
    crsType,
    datum: obj && typeof obj.datum === "string" ? obj.datum : undefined,
    ellipsoid: obj && typeof obj.ellipsoid === "string" ? obj.ellipsoid : undefined,
    transformationRequired,
  };
}

function normalizeBounds(raw: unknown): GeographicBounds {
  const obj = raw as Record<string, unknown>;
  return {
    minLon: Number(obj.minLon ?? -180),
    maxLon: Number(obj.maxLon ?? 180),
    minLat: Number(obj.minLat ?? -90),
    maxLat: Number(obj.maxLat ?? 90),
    crs: defaultCrs(),
  };
}

function defaultBounds(): GeographicBounds {
  return { minLon: -180, maxLon: 180, minLat: -90, maxLat: 90, crs: defaultCrs() };
}

function normalizeResolution(raw: unknown): SpatialResolution {
  const obj = raw as Record<string, unknown>;
  return {
    value: typeof obj.value === "number" ? obj.value : 0,
    unit: obj && typeof obj.unit === "string" && ["metres", "degrees", "pixels-per-degree"].includes(obj.unit)
      ? (obj.unit as "metres" | "degrees" | "pixels-per-degree")
      : "metres",
    description: obj && typeof obj.description === "string" ? obj.description : undefined,
  };
}

function normalizeUnits(raw: unknown): MeasurementUnits {
  const obj = raw as Record<string, unknown>;
  return {
    valueUnit: obj && typeof obj.valueUnit === "string" ? obj.valueUnit : "unknown",
    reference: obj && typeof obj.reference === "string" ? obj.reference : undefined,
    validRange: obj && Array.isArray(obj.validRange)
      ? [Number(obj.validRange[0]), Number(obj.validRange[1])]
      : undefined,
  };
}

export type { DataProviderConfig };
export { LocalFileProvider, RemoteHttpProvider, ScientificDataProviderManager, scientificDataManager };
