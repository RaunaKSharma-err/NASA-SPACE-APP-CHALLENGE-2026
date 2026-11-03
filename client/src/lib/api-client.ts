import type {
  Region,
  DataLayer,
  Observation,
  HealthStatus,
  RouteRequest,
  RouteResult,
  AssistantRequest,
  AssistantMessage,
  RegionId,
  LayerType,
  LayerSource,
  BackendRouteResponse,
  BackendAssistantResponse,
  BackendObservationsResponse,
  BackendOfflinePackage,
  BackendSyncResponse,
  BackendRegion,
  BackendDataset,
} from '@/types';
import { REGIONS, DATA_LAYERS, OBSERVATIONS } from '@/data/mars-data';
import { planRoute, queryAssistant } from '@/data/mocks';

const DEFAULT_BASE_URL = 'http://localhost:8000/api/v1';

function getBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL;
}

async function fetchWithTimeout(url: string, options?: RequestInit, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function backendToRouteResult(resp: BackendRouteResponse, id: string): RouteResult {
  const waypoints = resp.coordinates.map((c) => ({ lat: c.lat, lon: c.lon, elevation: 0 }));
  return {
    id,
    startLat: waypoints[0]?.lat ?? 0,
    startLon: waypoints[0]?.lon ?? 0,
    endLat: waypoints[waypoints.length - 1]?.lat ?? 0,
    endLon: waypoints[waypoints.length - 1]?.lon ?? 0,
    distance: resp.horizontal_distance_m,
    estimatedTime: Math.round(resp.horizontal_distance_m / 150 / 60),
    maxSlope: resp.max_slope_deg,
    avgSlope: resp.mean_slope_deg,
    hazardCount: 0,
    hazardLevel: resp.max_slope_deg > 30 ? 'high' : resp.max_slope_deg > 15 ? 'moderate' : 'low',
    waypoints,
    confidence: 0.85,
    reasoning: resp.warnings.join(' '),
  };
}

function backendToAssistantMessage(resp: BackendAssistantResponse): AssistantMessage {
  const content = resp.answer
    || resp.notes.join(' ')
    || 'No answer available.';
  const evidence = resp.evidence.map((e) => `${e.title}: ${e.snippet}`);
  return {
    id: `msg-${Date.now()}`,
    role: 'assistant',
    content,
    timestamp: Date.now(),
    evidence,
    sources: resp.evidence.map((e) => e.title),
    uncertainty: resp.status === 'ok' ? 'low' : resp.status === 'provider_unavailable' ? 'high' : 'medium',
  };
}

/**
 * Convert a BackendRegion to a frontend Region.
 * Backend Region lacks visual/science fields (fullName, elevation, radius, etc.),
 * so defaults are applied and fields are clearly marked as backend-derived where possible.
 */
export function backendRegionToRegion(br: BackendRegion): Region {
  const [minLon, minLat, maxLon, maxLat] = br.bbox;
  const statusToMissionStatus: Record<BackendRegion['status'], Region['missionStatus']> = {
    verified: 'active',
    unverified: 'proposed',
    synthetic: 'candidate',
    partial: 'none',
  };
  const statusToHazard: Record<BackendRegion['status'], Region['hazardLevel']> = {
    verified: 'moderate',
    unverified: 'moderate',
    synthetic: 'extreme',
    partial: 'high',
  };
  return {
    id: br.id as RegionId,
    name: br.name,
    fullName: br.name,
    lat: (minLat + maxLat) / 2,
    lon: (minLon + maxLon) / 2,
    elevation: 0,
    radius: 50,
    description: br.description || `No description available for ${br.name}.`,
    scientificInterest: 'Scientific interest not recorded in backend metadata.',
    hazardLevel: statusToHazard[br.status],
    missionStatus: statusToMissionStatus[br.status],
  };
}

/**
 * Convert a BackendDataset (DatasetProvenance) to a frontend DataLayer.
 * Backend dataset lacks visual fields (color, opacity, visible, etc.),
 * so sensible defaults are applied.
 */
export function backendDatasetToLayer(bd: BackendDataset): DataLayer {
  const formatToType: Record<string, LayerType> = {
    'Esri ASCII Grid': 'elevation',
    'GeoTIFF': 'elevation',
    'Hyperspectral': 'composition',
    'Imagery': 'imagery',
    'Radar': 'radar',
    'Thermal': 'thermal',
  };
  const statusToAvailable: Record<BackendDataset['status'], boolean> = {
    verified: true,
    unverified: false,
    synthetic: false,
    partial: false,
  };
  const layerColors: Record<LayerType, string> = {
    imagery: '#a5f3fc',
    elevation: '#f59e0b',
    composition: '#22d3ee',
    thermal: '#ef4444',
    radar: '#8b5cf6',
    hazard: '#f97316',
  };
  const sourceToType: Record<string, LayerType> = {
    'MGS/MOLA': 'elevation',
    'MRO/CRISM': 'composition',
    'MRO/HIRISE': 'imagery',
    'MO/THEMIS': 'thermal',
    'MARSIS': 'radar',
    'SHARAD': 'radar',
  };
  return {
    id: bd.id,
    name: bd.name,
    type: sourceToType[bd.authoritative_source] || formatToType[bd.format] || 'elevation',
    source: (bd.authoritative_source || 'Unknown') as LayerSource,
    description: bd.coverage || 'No description available.',
    available: statusToAvailable[bd.status],
    cached: false,
    loading: false,
    color: layerColors['elevation'],
    opacity: 0.5,
    visible: false,
  };
}

export const apiClient = {
  baseUrl: getBaseUrl(),

  async checkHealth(): Promise<HealthStatus> {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}/health`);
      if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
      const data = await response.json();
      return { status: data.status === 'ok' ? 'healthy' : 'degraded', apiVersion: data.version || 'v1', timestamp: Date.now() };
    } catch {
      return { status: 'down', apiVersion: 'unknown', timestamp: Date.now() };
    }
  },

  async getRegions(): Promise<Region[]> {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}/regions`);
      if (!response.ok) throw new Error('Failed to fetch regions');
      const data = await response.json();
      const backendRegions = data as BackendRegion[];
      return backendRegions.map(backendRegionToRegion);
    } catch {
      return REGIONS;
    }
  },

  async getLayers(): Promise<DataLayer[]> {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}/layers`);
      if (!response.ok) throw new Error('Failed to fetch layers');
      const data = await response.json();
      const backendLayers = data as BackendDataset[];
      return backendLayers.map(backendDatasetToLayer);
    } catch {
      return DATA_LAYERS;
    }
  },

  async getObservations(regionId: RegionId): Promise<Observation[]> {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}/regions/${regionId}/observations`);
      if (!response.ok) throw new Error('Failed to fetch observations');
      const data: BackendObservationsResponse = await response.json();
      if (data.status !== 'available') return [];
      return (data.observations as unknown) as Observation[];
    } catch {
      return OBSERVATIONS.filter((o) => o.regionId === regionId);
    }
  },

  async planRoute(request: RouteRequest): Promise<RouteResult> {
    try {
      const response = await fetchWithTimeout(
        `${this.baseUrl}/routes/plan`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          region_id: request.regionId,
          start: { lon: request.startLon, lat: request.startLat },
          target: { lon: request.endLon, lat: request.endLat },
          max_slope_deg: request.maxSlope,
          slope_weight: 4,
        }) },
        10000
      );
      if (!response.ok) throw new Error('Route planning failed');
      const data: BackendRouteResponse = await response.json();
      return backendToRouteResult(data, `route-${Date.now()}`);
    } catch {
      return planRoute(request);
    }
  },

  async getRouteAlternatives(request: RouteRequest): Promise<RouteResult[]> {
    const primary = await this.planRoute(request);
    return [primary];
  },

  async queryAssistant(request: AssistantRequest): Promise<AssistantMessage> {
    try {
      const response = await fetchWithTimeout(
        `${this.baseUrl}/assistant/query`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: request.query }) },
        15000
      );
      if (!response.ok) throw new Error('Assistant query failed');
      const data: BackendAssistantResponse = await response.json();
      return backendToAssistantMessage(data);
    } catch {
      const result = await queryAssistant(request.query, request.regionId);
      return {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: result.content,
        timestamp: Date.now(),
        evidence: result.evidence,
        sources: result.sources,
        uncertainty: result.uncertainty,
      };
    }
  },

  async getOfflineRegions(): Promise<BackendOfflinePackage[]> {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}/offline/regions`);
      if (!response.ok) throw new Error('Failed to fetch offline regions');
      return await response.json();
    } catch {
      return [];
    }
  },

  async syncStatus(action: string, message?: Record<string, unknown>): Promise<BackendSyncResponse> {
    try {
      const response = await fetchWithTimeout(
        `${this.baseUrl}/sync/status`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, message }) }
      );
      if (!response.ok) throw new Error('Sync status failed');
      return await response.json();
    } catch {
      return { simulated: true, connected: false, pending: 0, last_synchronized: null };
    }
  },
};
