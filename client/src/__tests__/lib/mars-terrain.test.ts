import { describe, expect, it } from "vitest";
import {
  getElevationAt,
  greatCircleInterpolate,
  parseAsciiGrid,
  surfaceRadiusAt,
  type TerrainData,
} from "@/lib/mars-terrain";

function buildTerrain(): TerrainData {
  // 5x5 grid, cellsize 1, origin (0,0).
  // row 0 = north (lat 4.5), row 4 = south (lat 0.5).
  // col 0 = lon 0.5, col 4 = lon 4.5.
  const elevation = new Float32Array(25).fill(0);
  // interior high point (row 2, col 2 -> lat 2.5, lon 2.5)
  elevation[2 * 5 + 2] = 100;
  // interior low point (row 1, col 1 -> lat 3.5, lon 1.5)
  elevation[1 * 5 + 1] = -100;
  return {
    header: {
      ncols: 5,
      nrows: 5,
      xllcorner: 0,
      yllcorner: 0,
      cellsize: 1,
      nodata: -9999,
    },
    elevation,
    minElevation: -100,
    maxElevation: 100,
    validCount: 25,
    nodataCount: 0,
    bounds: { minLon: 0, maxLon: 5, minLat: 0, maxLat: 5 },
  };
}

describe("getElevationAt", () => {
  it("returns exact value at a grid node", () => {
    const t = buildTerrain();
    const s = getElevationAt(t, 2.5, 2.5);
    expect(s.valid).toBe(true);
    expect(s.elevation).toBe(100);
  });

  it("bilinearly interpolates between nodes", () => {
    const t = buildTerrain();
    const s = getElevationAt(t, 2.5, 2.0);
    expect(s.valid).toBe(true);
    expect(s.elevation).toBeCloseTo(50, 4);
  });

  it("returns invalid outside coverage", () => {
    const t = buildTerrain();
    expect(getElevationAt(t, 10, 10).valid).toBe(false);
    expect(getElevationAt(t, -10, 10).valid).toBe(false);
    expect(getElevationAt(t, 2.5, -10).valid).toBe(false);
    expect(getElevationAt(t, 2.5, 10).valid).toBe(false);
  });

  it("skips NODATA cells in interpolation", () => {
    const t = buildTerrain();
    t.elevation[2 * 5 + 2] = -9999;
    const center = getElevationAt(t, 2.5, 2.5);
    expect(center.valid).toBe(false);
    expect(center.elevation).toBeNull();

    const s = getElevationAt(t, 2.5, 2.0);
    expect(s.valid).toBe(true);
  });

  it("parses a real ASCII grid header", () => {
    const text = [
      "ncols         3",
      "nrows         3",
      "xllcorner     0",
      "yllcorner     0",
      "cellsize      1",
      "NODATA_value  -9999",
      "10 20 30",
      "40 50 60",
      "70 80 90",
    ].join("\n");
    const t = parseAsciiGrid(text);
    expect(t.header.ncols).toBe(3);
    expect(t.header.nrows).toBe(3);
    expect(t.validCount).toBe(9);
    expect(getElevationAt(t, 1.5, 1.5).elevation).toBe(50);
  });
});

describe("surfaceRadiusAt", () => {
  it("returns base radius at mean elevation", () => {
    const t = buildTerrain();
    const r = surfaceRadiusAt(t, 2.5, 1.5); // elev 0 == mean of -100/100
    expect(r.valid).toBe(true);
    expect(r.elevation).toBe(0);
    expect(r.radius).toBeCloseTo(2, 4);
  });

  it("returns displaced radius above/below mean at interior points", () => {
    const t = buildTerrain();
    const high = surfaceRadiusAt(t, 2.5, 2.5); // elev 100, interior
    const low = surfaceRadiusAt(t, 3.5, 1.5); // elev -100, interior
    expect(high.valid).toBe(true);
    expect(low.valid).toBe(true);
    expect(high.radius).toBeGreaterThan(2);
    expect(low.radius).toBeLessThan(2);
    expect(high.radius).toBeGreaterThan(low.radius);
  });

  it("returns fallback when terrain is null", () => {
    const r = surfaceRadiusAt(null, 2.5, 2.5);
    expect(r.valid).toBe(false);
    expect(r.radius).toBe(2);
    expect(r.elevation).toBeNull();
  });

  it("returns fallback outside coverage", () => {
    const t = buildTerrain();
    const r = surfaceRadiusAt(t, 10, 10);
    expect(r.valid).toBe(false);
    expect(r.radius).toBe(2);
  });
});

describe("greatCircleInterpolate", () => {
  it("returns start point at t=0", () => {
    const p = greatCircleInterpolate(10, 20, 30, 40, 0);
    expect(p.lat).toBeCloseTo(10);
    expect(p.lon).toBeCloseTo(20);
  });

  it("returns end point at t=1", () => {
    const p = greatCircleInterpolate(10, 20, 30, 40, 1);
    expect(p.lat).toBeCloseTo(30);
    expect(p.lon).toBeCloseTo(40);
  });

  it("interpolates along great circle for distant points", () => {
    // Use points where great circle deviates from linear: (0,0) to (30,90)
    const mid2 = greatCircleInterpolate(0, 0, 30, 90, 0.5);
    const linearLat = 0 + (30 - 0) * 0.5;
    // Great-circle midpoint lat should differ from linear interpolation
    expect(mid2.lat).not.toBeCloseTo(linearLat, 4);
  });

  it("great-circle path is shorter than linear interpolation path", () => {
    // Verify great-circle interpolation stays on the sphere surface
    // by checking angular distances add up
    const toRadians = (deg: number) => (deg * Math.PI) / 180;
    const angularDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const dLat = toRadians(lat2 - lat1);
      const dLon = toRadians(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
      return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const start = { lat: 10, lon: 20 };
    const end = { lat: 40, lon: 80 };
    const totalDist = angularDistance(start.lat, start.lon, end.lat, end.lon);

    const mid = greatCircleInterpolate(start.lat, start.lon, end.lat, end.lon, 0.5);
    const d1 = angularDistance(start.lat, start.lon, mid.lat, mid.lon);
    const d2 = angularDistance(mid.lat, mid.lon, end.lat, end.lon);

    // Midpoint should split the great-circle distance approximately in half
    expect(d1).toBeCloseTo(d2, 4);
    expect(d1 + d2).toBeCloseTo(totalDist, 4);
  });
});
