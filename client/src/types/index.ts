export type RegionId =
  | 'gale-crater'
  | 'jezero-crater'
  | 'olympus-mons'
  | 'valles-marineris'
  | 'hellas-basin'
  | 'olympia-planitia';

export interface Region {
  id: RegionId;
  name: string;
  fullName: string;
  lat: number;
  lon: number;
  elevation: number;
  radius: number;
  description: string;
  scientificInterest: string;
  hazardLevel: 'low' | 'moderate' | 'high' | 'extreme';
  missionStatus: 'active' | 'proposed' | 'candidate' | 'none';
}

export type LayerType = 'imagery' | 'elevation' | 'composition' | 'thermal' | 'radar' | 'hazard';
export type LayerSource = 'MRO/CRISM' | 'MGS/MOLA' | 'MRO/HIRISE' | 'MO/THEMIS' | 'MARSIS' | 'SHARAD';

export interface DataLayer {
  id: string;
  name: string;
  type: LayerType;
  source: LayerSource;
  description: string;
  available: boolean;
  cached: boolean;
  loading: boolean;
  color: string;
  opacity: number;
  visible: boolean;
}

export interface TargetLocation {
  id: string;
  name: string;
  regionId: RegionId;
  lat: number;
  lon: number;
  elevation: number;
  type: 'outcrop' | 'crater' | 'channel' | 'ridge' | 'delta' | 'cave-candidate' | 'landing-site';
  scientificInterest: string;
  hazardLevel: 'low' | 'moderate' | 'high' | 'extreme';
  verified: boolean;
  evidence: string[];
  source: string;
}

export interface RouteResult {
  id: string;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  distance: number;
  estimatedTime: number;
  maxSlope: number;
  avgSlope: number;
  hazardCount: number;
  hazardLevel: 'low' | 'moderate' | 'high';
  waypoints: { lat: number; lon: number; elevation: number }[];
  confidence: number;
  reasoning: string;
  // Terrain-aware route metrics
  straightLineDistanceM?: number;
  distanceRatio?: number;
  elevationGainM?: number;
  elevationLossM?: number;
  maxElevationM?: number | null;
  minElevationM?: number | null;
  highSlopeSegments?: number;
  noDataCellsEncountered?: number;
  terrainCoverage?: string;
  hazardsEvaluated?: string[];
  assumptions?: string[];
  warnings?: string[];
}

export interface RouteRequest {
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  avoidHazards: boolean;
  maxSlope: number;
  vehicleSpeed: number;
  regionId: RegionId;
  elevationWeight?: number;
  hazardWeight?: number;
}

export type AssistantProvider = 'live' | 'mock' | 'unavailable';

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  evidence?: string[];
  sources?: string[];
  uncertainty?: 'low' | 'medium' | 'high';
  error?: boolean;
  provider?: AssistantProvider;
}

export interface AssistantRequest {
  query: string;
  regionId?: RegionId;
  targetId?: string;
  activeLayers?: string[];
  mapBounds?: { north: number; south: number; east: number; west: number };
}

export interface SyncStatus {
  lastSync: number | null;
  syncInProgress: boolean;
  cachedRegions: RegionId[];
  totalCacheSize: number;
  connected?: boolean;
  synced?: number;
  pending?: number;
  last_synchronized?: string | null;
}

export type ConnectionState = 'online' | 'offline' | 'degraded';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  apiVersion: string;
  timestamp: number;
}

export interface Observation {
  id: string;
  regionId: RegionId;
  instrument: string;
  timestamp: string;
  type: string;
  value: string;
  unit: string;
  source: string;
}

// Backend API types (matching FastAPI schemas)
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Array<{ loc: string[]; msg: string }>;
  };
}

export interface BackendRegion {
  id: string;
  name: string;
  bbox: [number, number, number, number];
  description: string;
  layer_ids: string[];
  terrain_dataset_id: string | null;
  status: 'verified' | 'unverified' | 'synthetic' | 'partial';
}

export interface BackendDataset {
  id: string;
  name: string;
  authoritative_source: string;
  access_url: string | null;
  format: string;
  crs: string | null;
  coverage: string;
  resolution: string | null;
  units: string | null;
  license: string | null;
  storage_estimate_mb: number | null;
  processing_steps: string[];
  limitations: string[];
  status: 'verified' | 'unverified' | 'synthetic' | 'partial';
  verified_on: string | null;
  terrain_file: string | null;
}

export interface BackendRouteResponse {
  region_id: string;
  terrain_status: string;
  coordinates: Array<{ lon: number; lat: number }>;
  horizontal_distance_m: number;
  surface_distance_m: number;
  straight_line_distance_m: number;
  distance_ratio: number;
  total_cost: number;
  max_slope_deg: number;
  mean_slope_deg: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  max_elevation_m: number | null;
  min_elevation_m: number | null;
  high_slope_segments: number;
  no_data_cells_encountered: number;
  hazards_evaluated: string[];
  assumptions: string[];
  warnings: string[];
}

export interface BackendAssistantResponse {
  status: 'ok' | 'no_evidence' | 'provider_unavailable';
  answer: string | null;
  evidence: Array<{ doc_id: string; title: string; kind: string; snippet: string; score: number }>;
  notes: string[];
}

export interface BackendObservationsResponse {
  region_id: string;
  status: string;
  observations: Array<Record<string, unknown>>;
  notes: string[];
}

export interface BackendOfflinePackage {
  package_id: string;
  version: string;
  created_at: string;
  file_count: number;
  integrity_ok: boolean;
  problems: string[];
}

export interface BackendSyncResponse {
  simulated: boolean;
  connected: boolean;
  synced?: number;
  pending: number;
  last_synchronized: string | null;
}