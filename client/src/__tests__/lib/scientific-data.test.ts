import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  LocalFileProvider,
  RemoteHttpProvider,
  scientificDataManager,
} from "@/lib/scientific-data";
import type { DatasetMetadata, ElevationRequest } from "@/types/scientific-data";

function makeValidDataset(overrides: Partial<DatasetMetadata> = {}): DatasetMetadata {
  return {
    id: "mola-megdr",
    name: "MOLA MEGDR",
    type: "elevation",
    source: "MGS/MOLA",
    format: "Esri ASCII Grid",
    crs: {
      name: "Simple cylindrical (planetocentric)",
      authority: "IAU 2000",
      longitudeRange: [-180, 180],
      latitudeRange: [-90, 90],
      units: "degrees",
      crsType: "geographic",
      transformationRequired: false,
      datum: "areoid",
      ellipsoid: "IAU 2000 Mars",
    },
    bounds: {
      minLon: 137.0,
      maxLon: 138.0,
      minLat: -5.5,
      maxLat: -4.5,
      crs: { name: "x", units: "degrees", crsType: "geographic", transformationRequired: false },
    },
    resolution: { value: 1 / 128, unit: "pixels-per-degree" },
    units: { valueUnit: "metres", reference: "areoid" },
    attribution: {
      organization: "NASA/GSFC/MOLA Team — USGS Astrogeology Science Center",
      datasetTitle: "MOLA MEGDR",
      license: "CC0 / public domain (NASA PDS)",
    },
    status: "verified",
    ...overrides,
  };
}

describe("LocalFileProvider", () => {
  it("lists the local MOLA dataset", async () => {
    const provider = new LocalFileProvider({
      type: "local",
      enabled: true,
      priority: 0,
    });
    const datasets = await provider.listDatasets();
    expect(datasets.length).toBeGreaterThan(0);
    expect(datasets.some((d) => d.id === "mola-megdr")).toBe(true);
  });

  it("sampleElevation returns invalid when no terrain loaded", async () => {
    const provider = new LocalFileProvider({
      type: "local",
      enabled: true,
      priority: 0,
    });
    const result = await provider.sampleElevation({
      lat: -4.25,
      lon: 137.25,
      datasetId: "mola-megdr",
    } as ElevationRequest);
    expect(result.valid).toBe(false);
    expect(result.nodata).toBe(true);
    expect(result.units).toBe("metres");
  });

  it("validateResource passes for valid dataset", async () => {
    const provider = new LocalFileProvider({
      type: "local",
      enabled: true,
      priority: 0,
    });
    const result = await provider.validateResource(makeValidDataset());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("validateResource fails for non-degree CRS", async () => {
    const provider = new LocalFileProvider({
      type: "local",
      enabled: true,
      priority: 0,
    });
    const ds = makeValidDataset({
      crs: { ...makeValidDataset().crs, units: "metres" },
    });
    const result = await provider.validateResource(ds);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("validateResource fails for invalid bounds", async () => {
    const provider = new LocalFileProvider({
      type: "local",
      enabled: true,
      priority: 0,
    });
    const ds = makeValidDataset({
      bounds: {
        minLon: 200,
        maxLon: 100,
        minLat: -100,
        maxLat: 100,
        crs: { name: "x", units: "degrees", crsType: "geographic", transformationRequired: false },
      },
    });
    const result = await provider.validateResource(ds);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("RemoteHttpProvider", () => {
  it("is disabled by default (no baseUrl)", () => {
    const provider = new RemoteHttpProvider({
      type: "remote",
      enabled: true,
      priority: 10,
    });
    expect(provider.enabled).toBe(false);
  });

  it("returns empty datasets when disabled", async () => {
    const provider = new RemoteHttpProvider({
      type: "remote",
      enabled: false,
      priority: 10,
    });
    const datasets = await provider.listDatasets();
    expect(datasets).toEqual([]);
  });

  it("returns invalid elevation when disabled", async () => {
    const provider = new RemoteHttpProvider({
      type: "remote",
      enabled: false,
      priority: 10,
    });
    const result = await provider.sampleElevation({
      lat: -4.25,
      lon: 137.25,
      datasetId: "mola-megdr",
    } as ElevationRequest);
    expect(result.valid).toBe(false);
  });

  it("validateResource reports disabled", async () => {
    const provider = new RemoteHttpProvider({
      type: "remote",
      enabled: false,
      priority: 10,
    });
    const result = await provider.validateResource(makeValidDataset());
    expect(result.valid).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("fetches datasets when enabled with baseUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "nasa-demo", name: "NASA Demo", type: "imagery", source: "NASA", format: "GeoTIFF" },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new RemoteHttpProvider({
      type: "remote",
      enabled: true,
      priority: 10,
      baseUrl: "https://example.nasa.gov/api",
    });
    expect(provider.enabled).toBe(true);

    const datasets = await provider.listDatasets();
    expect(datasets.length).toBe(1);
    expect(datasets[0].id).toBe("nasa-demo");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("returns empty on remote fetch failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new RemoteHttpProvider({
      type: "remote",
      enabled: true,
      priority: 10,
      baseUrl: "https://example.nasa.gov/api",
    });
    const datasets = await provider.listDatasets();
    expect(datasets).toEqual([]);

    vi.unstubAllGlobals();
  });
});

describe("ScientificDataProviderManager", () => {
  beforeEach(() => {
    (scientificDataManager as { disableRemote: () => void }).disableRemote();
  });

  afterEach(() => {
    (scientificDataManager as { disableRemote: () => void }).disableRemote();
  });

  it("starts with local provider enabled", () => {
    const providers = scientificDataManager.getProviders();
    const local = providers.find((p) => p.id === "local");
    expect(local).toBeDefined();
    expect(local?.enabled).toBe(true);
  });

  it("remote is disabled by default", () => {
    expect(scientificDataManager.isRemoteEnabled()).toBe(false);
  });

  it("listDatasets falls back to local", async () => {
    const result = await scientificDataManager.listDatasets();
    expect(result.source).toBe("local");
    expect(result.datasets.length).toBeGreaterThan(0);
  });

  it("sampleElevation returns invalid when no terrain data", async () => {
    const result = await scientificDataManager.sampleElevation({
      lat: -4.25,
      lon: 137.25,
      datasetId: "mola-megdr",
    } as ElevationRequest);
    expect(result.sample.valid).toBe(false);
    expect(result.sample.nodata).toBe(true);
  });

  it("setRemoteConfig enables remote when baseUrl provided", () => {
    scientificDataManager.setRemoteConfig({
      type: "remote",
      enabled: true,
      priority: 5,
      baseUrl: "https://example.nasa.gov/api",
    });
    expect(scientificDataManager.isRemoteEnabled()).toBe(true);
  });

  it("disableRemote turns off remote provider", () => {
    scientificDataManager.setRemoteConfig({
      type: "remote",
      enabled: true,
      priority: 5,
      baseUrl: "https://example.nasa.gov/api",
    });
    expect(scientificDataManager.isRemoteEnabled()).toBe(true);
    scientificDataManager.disableRemote();
    expect(scientificDataManager.isRemoteEnabled()).toBe(false);
  });

  it("getProvider returns undefined for unknown id", () => {
    expect(scientificDataManager.getProvider("nonexistent")).toBeUndefined();
  });
});
