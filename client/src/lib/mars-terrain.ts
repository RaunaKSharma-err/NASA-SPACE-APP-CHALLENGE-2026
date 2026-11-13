import * as THREE from "three";

// mars-terrain.ts — ESRI ASCII Grid parser and terrain data for MOLA elevation

export interface TerrainHeader {
  ncols: number;
  nrows: number;
  xllcorner: number;
  yllcorner: number;
  cellsize: number;
  nodata: number;
  xllcenter?: number;
  yllcenter?: number;
}

export interface TerrainData {
  header: TerrainHeader;
  elevation: Float32Array;
  minElevation: number;
  maxElevation: number;
  validCount: number;
  nodataCount: number;
  bounds: {
    minLon: number;
    maxLon: number;
    minLat: number;
    maxLat: number;
  };
}

const NODATA_DEFAULT = -9999;

export function parseAsciiGrid(text: string): TerrainData {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 7) {
    throw new Error("ASCII grid file too short — expected at least 6 header lines + data");
  }

  const header: TerrainHeader = {
    ncols: 0,
    nrows: 0,
    xllcorner: 0,
    yllcorner: 0,
    cellsize: 0,
    nodata: NODATA_DEFAULT,
  };

  let dataStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].trim().split(/\s+/);
    if (parts.length < 2) continue;
    const key = parts[0].toLowerCase();
    const val = parseFloat(parts[1]);

    if (key === "ncols") header.ncols = val;
    else if (key === "nrows") header.nrows = val;
    else if (key === "xllcorner") header.xllcorner = val;
    else if (key === "yllcorner") header.yllcorner = val;
    else if (key === "xllcenter") {
      header.xllcenter = val;
      header.xllcorner = val - header.cellsize * 0.5; // will be corrected after cellsize
    }
    else if (key === "yllcenter") {
      header.yllcenter = val;
      header.yllcorner = val - header.cellsize * 0.5;
    }
    else if (key === "cellsize") header.cellsize = val;
    else if (key === "nodata_value" || key === "nodata") header.nodata = val;
    else {
      // First non-header line — data starts here
      dataStart = i;
      break;
    }
  }

  // Fix xllcorner/yllcorner if center was specified
  if (header.xllcenter !== undefined) {
    header.xllcorner = header.xllcenter - header.cellsize * 0.5;
  }
  if (header.yllcenter !== undefined) {
    header.yllcorner = header.yllcenter - header.cellsize * 0.5;
  }

  // Validate header
  if (!Number.isInteger(header.ncols) || header.ncols <= 0) {
    throw new Error(`Invalid ncols: ${header.ncols}`);
  }
  if (!Number.isInteger(header.nrows) || header.nrows <= 0) {
    throw new Error(`Invalid nrows: ${header.nrows}`);
  }
  if (header.cellsize <= 0) {
    throw new Error(`Invalid cellsize: ${header.cellsize}`);
  }

  // Parse elevation data
  const expectedCount = header.ncols * header.nrows;
  const elevations: number[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const parts = lines[i].trim().split(/\s+/);
    for (const p of parts) {
      if (p === "") continue;
      const v = parseFloat(p);
      if (isNaN(v)) {
        throw new Error(`Invalid elevation value at line ${i + 1}: "${p}"`);
      }
      elevations.push(v);
    }
  }

  if (elevations.length !== expectedCount) {
    throw new Error(
      `Elevation count mismatch: expected ${expectedCount}, got ${elevations.length}`,
    );
  }

  // Validate and compute stats
  const elevation = new Float32Array(elevations.length);
  let minElev = Infinity;
  let maxElev = -Infinity;
  let validCount = 0;
  let nodataCount = 0;

  for (let i = 0; i < elevations.length; i++) {
    const v = elevations[i];
    if (v === header.nodata || v === NODATA_DEFAULT) {
      elevation[i] = header.nodata;
      nodataCount++;
    } else {
      elevation[i] = v;
      validCount++;
      if (v < minElev) minElev = v;
      if (v > maxElev) maxElev = v;
    }
  }

  if (validCount === 0) {
    throw new Error("No valid elevation values found in grid");
  }

  // Check for NaN/Infinity
  for (let i = 0; i < elevation.length; i++) {
    if (!isFinite(elevation[i]) && elevation[i] !== header.nodata) {
      throw new Error(`Non-finite elevation at index ${i}: ${elevation[i]}`);
    }
  }

  const minLon = header.xllcorner;
  const maxLon = header.xllcorner + header.ncols * header.cellsize;
  const minLat = header.yllcorner;
  const maxLat = header.yllcorner + header.nrows * header.cellsize;

  return {
    header,
    elevation,
    minElevation: minElev,
    maxElevation: maxElev,
    validCount,
    nodataCount,
    bounds: { minLon, maxLon, minLat, maxLat },
  };
}

export async function loadTerrain(url: string): Promise<TerrainData> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch terrain: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  return parseAsciiGrid(text);
}

// Coordinate conversion matching MarsGlobe's latLonToVector3
const MARS_RADIUS = 2;
const MARS_MEAN_RADIUS_M = 3_396_000;

export function latLonToVector3(
  lat: number,
  lon: number,
  radius: number,
): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

export { latLonToVector3 as marsLatLonToVector3 };

export function vector3ToLatLon(v: THREE.Vector3): { lat: number; lon: number } {
  const r = v.length();
  const phi = Math.acos(Math.max(-1, Math.min(1, v.y / r)));
  const lat = 90 - phi * (180 / Math.PI);
  let lon = Math.atan2(v.z, -v.x) * (180 / Math.PI) - 180;
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return { lat, lon };
}

/**
 * Spherical linear interpolation between two lat/lon points along a great circle.
 * Returns the interpolated { lat, lon } at parameter t (0 = start, 1 = end).
 */
export function greatCircleInterpolate(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  t: number,
): { lat: number; lon: number } {
  const v1 = latLonToVector3(lat1, lon1, 1);
  const v2 = latLonToVector3(lat2, lon2, 1);
  const dot = Math.max(-1, Math.min(1, v1.dot(v2)));
  const theta = Math.acos(dot);
  const sinTheta = Math.sin(theta);
  let v: THREE.Vector3;
  if (Math.abs(sinTheta) < 1e-6) {
    v = new THREE.Vector3().copy(v1).lerp(v2, t);
  } else {
    const a = Math.sin((1 - t) * theta) / sinTheta;
    const b = Math.sin(t * theta) / sinTheta;
    v = new THREE.Vector3(
      v1.x * a + v2.x * b,
      v1.y * a + v2.y * b,
      v1.z * a + v2.z * b,
    );
  }
  return vector3ToLatLon(v);
}

export interface TerrainMeshOptions {
  verticalExaggeration?: number;
  baseRadius?: number;
  edgeFalloff?: number; // 0-1, how much to blend at edges
}

export function createTerrainMesh(
  terrain: TerrainData,
  texture: THREE.Texture | null,
  options: TerrainMeshOptions = {},
): THREE.Mesh {
  const {
    verticalExaggeration = 40,
    baseRadius = MARS_RADIUS,
    edgeFalloff = 0.15,
  } = options;

  const { ncols, nrows, cellsize, xllcorner, yllcorner, nodata } = terrain.header;
  const { elevation, minElevation, maxElevation } = terrain;

  // Build vertex grid
  const vertexCount = ncols * nrows;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const normals = new Float32Array(vertexCount * 3);

  // Mars mean radius in Three.js units: baseRadius corresponds to 3,396,000 m
  // Displacement per metre: baseRadius / 3,396,000
  const metersPerUnit = MARS_MEAN_RADIUS_M / baseRadius;

  for (let row = 0; row < nrows; row++) {
    for (let col = 0; col < ncols; col++) {
      const idx = row * ncols + col;
      const lon = xllcorner + (col + 0.5) * cellsize;
      // ESRI grid: row 0 = top (north), so lat decreases as row increases
      const lat = yllcorner + (nrows - 0.5 - row) * cellsize;

      const elev = elevation[idx];
      const isValid = elev !== nodata && isFinite(elev);

      // Displacement: relative elevation above minimum, scaled
      let disp = 0;
      if (isValid) {
        // Relative displacement: (elev - minElev) / elevRange * verticalExaggeration
        // But we want to show actual topographic variation, so use deviation from mean
        const meanElev = (minElevation + maxElevation) / 2;
        disp = ((elev - meanElev) / metersPerUnit) * verticalExaggeration;
      }

      // Edge falloff: blend to 0 at boundaries
      const edgeDist = Math.min(
        col / (ncols - 1),
        (ncols - 1 - col) / (ncols - 1),
        row / (nrows - 1),
        (nrows - 1 - row) / (nrows - 1),
      );
      const falloff = Math.min(1, edgeDist / edgeFalloff);
      disp *= falloff * falloff; // quadratic falloff for smooth transition

      const r = baseRadius + disp;
      const pos = latLonToVector3(lat, lon, r);

      positions[idx * 3] = pos.x;
      positions[idx * 3 + 1] = pos.y;
      positions[idx * 3 + 2] = pos.z;

      // UV: map lon/lat to texture coordinates (equirectangular)
      // u = (lon + 180) / 360, v = (lat + 90) / 180
      uvs[idx * 2] = (lon + 180) / 360;
      uvs[idx * 2 + 1] = (lat + 90) / 180;

      // Normals will be computed later
      normals[idx * 3] = 0;
      normals[idx * 3 + 1] = 1;
      normals[idx * 3 + 2] = 0;
    }
  }

  // Build indices (skip triangles with NODATA vertices)
  const indices: number[] = [];
  for (let row = 0; row < nrows - 1; row++) {
    for (let col = 0; col < ncols - 1; col++) {
      const i0 = row * ncols + col;
      const i1 = row * ncols + (col + 1);
      const i2 = (row + 1) * ncols + col;
      const i3 = (row + 1) * ncols + (col + 1);

      // Skip if any vertex is NODATA
      const v0 = elevation[i0];
      const v1 = elevation[i1];
      const v2 = elevation[i2];
      const v3 = elevation[i3];

      const allValid =
        v0 !== nodata && v1 !== nodata && v2 !== nodata && v3 !== nodata &&
        isFinite(v0) && isFinite(v1) && isFinite(v2) && isFinite(v3);

      if (!allValid) continue;

      // Check for NaN in positions
      if (
        !isFinite(positions[i0 * 3]) || !isFinite(positions[i0 * 3 + 1]) || !isFinite(positions[i0 * 3 + 2]) ||
        !isFinite(positions[i1 * 3]) || !isFinite(positions[i1 * 3 + 1]) || !isFinite(positions[i1 * 3 + 2]) ||
        !isFinite(positions[i2 * 3]) || !isFinite(positions[i2 * 3 + 1]) || !isFinite(positions[i2 * 3 + 2]) ||
        !isFinite(positions[i3 * 3]) || !isFinite(positions[i3 * 3 + 1]) || !isFinite(positions[i3 * 3 + 2])
      ) {
        continue;
      }

      indices.push(i0, i2, i1);
      indices.push(i1, i2, i3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(indices);

  // Compute vertex normals
  geometry.computeVertexNormals();

  const material = new THREE.MeshPhongMaterial({
    map: texture,
    shininess: 2,
    specular: 0x222222,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "mars-terrain-patch";

  return mesh;
}

export interface ElevationSample {
  lat: number;
  lon: number;
  elevation: number | null;
  valid: boolean;
  col: number;
  row: number;
}

export function getElevationAt(
  terrain: TerrainData,
  lat: number,
  lon: number,
): ElevationSample {
  const { ncols, nrows, cellsize, xllcorner, yllcorner, nodata } =
    terrain.header;
  const { elevation } = terrain;

  const colF = (lon - xllcorner) / cellsize - 0.5;
  const rowF = nrows - 0.5 - (lat - yllcorner) / cellsize;

  if (
    colF < -0.5 ||
    colF > ncols - 0.5 ||
    rowF < -0.5 ||
    rowF > nrows - 0.5
  ) {
    return { lat, lon, elevation: null, valid: false, col: colF, row: rowF };
  }

  const colClamped = Math.min(ncols - 1, Math.max(0, colF));
  const rowClamped = Math.min(nrows - 1, Math.max(0, rowF));

  const c0 = Math.floor(colClamped);
  const r0 = Math.floor(rowClamped);
  const c1 = Math.min(c0 + 1, ncols - 1);
  const r1 = Math.min(r0 + 1, nrows - 1);
  const fc = colClamped - c0;
  const fr = rowClamped - r0;

  const get = (c: number, r: number): number | null => {
    const v = elevation[r * ncols + c];
    return v !== nodata && isFinite(v) ? v : null;
  };

  const samples: { w: number; v: number }[] = [];
  const pushSample = (c: number, r: number, w: number) => {
    const val = get(c, r);
    if (val !== null && w > 0) {
      samples.push({ w, v: val });
    }
  };

  pushSample(c0, r0, (1 - fc) * (1 - fr));
  pushSample(c1, r0, fc * (1 - fr));
  pushSample(c0, r1, (1 - fc) * fr);
  pushSample(c1, r1, fc * fr);

  if (samples.length === 0) {
    return { lat, lon, elevation: null, valid: false, col: colF, row: rowF };
  }

  let sumW = 0;
  let sumWV = 0;
  for (const s of samples) {
    sumW += s.w;
    sumWV += s.w * s.v;
  }

  return {
    lat,
    lon,
    elevation: sumWV / sumW,
    valid: true,
    col: colF,
    row: rowF,
  };
}

export interface SurfaceRadiusOptions {
  baseRadius?: number;
  verticalExaggeration?: number;
  edgeFalloff?: number;
}

export interface SurfaceRadiusResult {
  radius: number;
  elevation: number | null;
  valid: boolean;
}

export function surfaceRadiusAt(
  terrain: TerrainData | null,
  lat: number,
  lon: number,
  options: SurfaceRadiusOptions = {},
): SurfaceRadiusResult {
  const {
    baseRadius = MARS_RADIUS,
    verticalExaggeration = 40,
    edgeFalloff = 0.15,
  } = options;

  if (!terrain) {
    return { radius: baseRadius, elevation: null, valid: false };
  }

  const { minElevation, maxElevation } = terrain;
  const meanElev = (minElevation + maxElevation) / 2;
  const metersPerUnit = MARS_MEAN_RADIUS_M / baseRadius;

  const sample = getElevationAt(terrain, lat, lon);
  if (!sample.valid || sample.elevation === null) {
    return { radius: baseRadius, elevation: null, valid: false };
  }

  let disp = ((sample.elevation - meanElev) / metersPerUnit) * verticalExaggeration;

  const { ncols, nrows } = terrain.header;
  const spanX = Math.max(1, ncols - 1);
  const spanY = Math.max(1, nrows - 1);
  const colClamped = Math.min(ncols - 1, Math.max(0, sample.col));
  const rowClamped = Math.min(nrows - 1, Math.max(0, sample.row));
  const edgeDist = Math.min(
    colClamped / spanX,
    (ncols - 1 - colClamped) / spanX,
    rowClamped / spanY,
    (nrows - 1 - rowClamped) / spanY,
  );
  const falloff = Math.min(1, edgeDist / edgeFalloff);
  disp *= falloff * falloff;

  return { radius: baseRadius + disp, elevation: sample.elevation, valid: true };
}