import { create } from 'zustand';
import type { Region, RegionId, DataLayer, TargetLocation, RouteResult, AssistantMessage, ConnectionState, SyncStatus, Observation } from '@/types';
import { REGIONS, DATA_LAYERS, TARGETS } from '@/data/mars-data';
import { cacheGet, cacheSet } from '@/lib/cache';
import { apiClient } from '@/lib/api-client';

interface MissionState {
  // Region
  regions: Region[];
  selectedRegion: Region | null;
  selectRegion: (id: RegionId) => void;
  setRegions: (regions: Region[]) => void;
  regionsLoading: boolean;
  setRegionsLoading: (loading: boolean) => void;
  regionsError: string | null;
  setRegionsError: (error: string | null) => void;

  // Layers
  layers: DataLayer[];
  toggleLayer: (id: string) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  setLayers: (layers: DataLayer[]) => void;
  layersLoading: boolean;
  setLayersLoading: (loading: boolean) => void;
  layersError: string | null;
  setLayersError: (error: string | null) => void;

  // Target
  targets: TargetLocation[];
  selectedTarget: TargetLocation | null;
  selectTarget: (id: string | null) => void;

  // Observations
  observations: Record<string, Observation[]>;
  observationsLoading: boolean;
  setObservationsLoading: (loading: boolean) => void;
  setObservations: (regionId: string, observations: Observation[]) => void;

  // Routes
  routes: RouteResult[];
  selectedRouteId: string | null;
  setRoutes: (routes: RouteResult[]) => void;
  selectRoute: (id: string) => void;
  routeLoading: boolean;
  setRouteLoading: (loading: boolean) => void;

  // Assistant
  assistantMessages: AssistantMessage[];
  addAssistantMessage: (msg: AssistantMessage) => void;
  assistantLoading: boolean;
  setAssistantLoading: (loading: boolean) => void;

  // Connection
  connectionState: ConnectionState;
  setConnectionState: (state: ConnectionState) => void;

  // Sync
  syncStatus: SyncStatus;
  setSyncStatus: (status: Partial<SyncStatus>) => void;

  // Settings
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;

  // Camera target
  cameraTarget: { lat: number; lon: number; elevation: number } | null;
  flyToTarget: (lat: number, lon: number, elevation?: number) => void;
  cameraReady: boolean;
  setCameraReady: (ready: boolean) => void;

  // Init from cache
  initFromCache: () => Promise<void>;
}

export const useMissionStore = create<MissionState>((set, get) => ({
  regions: REGIONS,
  selectedRegion: REGIONS[0],
  selectRegion: async (id) => {
    const region = get().regions.find((r) => r.id === id) || null;
    set({ selectedRegion: region, selectedTarget: null, routes: [], selectedRouteId: null });
    if (region) {
      cacheSet('selected-region', region.id);
      get().flyToTarget(region.lat, region.lon, region.elevation);
      // Fetch observations for the newly selected region
      try {
        get().setObservationsLoading(true);
        const observations = await apiClient.getObservations(region.id);
        // Only set observations if this region is still selected (prevent stale responses)
        if (get().selectedRegion?.id === region.id) {
          get().setObservations(region.id, observations);
        }
      } catch {
        // Observations fetch failure should not block region selection
      } finally {
        get().setObservationsLoading(false);
      }
    }
  },
  setRegions: (regions) => set({ regions }),
  regionsLoading: false,
  setRegionsLoading: (loading) => set({ regionsLoading: loading }),
  regionsError: null,
  setRegionsError: (error) => set({ regionsError: error }),

  layers: DATA_LAYERS,
  toggleLayer: (id) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id && l.available ? { ...l, visible: !l.visible } : l
      ),
    })),
  setLayerOpacity: (id, opacity) =>
    set((state) => ({
      layers: state.layers.map((l) => (l.id === id ? { ...l, opacity } : l)),
    })),
  setLayers: (layers) => set({ layers }),
  layersLoading: false,
  setLayersLoading: (loading) => set({ layersLoading: loading }),
  layersError: null,
  setLayersError: (error) => set({ layersError: error }),

  targets: TARGETS,
  selectedTarget: null,
  selectTarget: (id) => {
    if (id === null) {
      set({ selectedTarget: null });
      return;
    }
    const target = get().targets.find((t) => t.id === id) || null;
    set({ selectedTarget: target });
    if (target) {
      get().flyToTarget(target.lat, target.lon, target.elevation);
    }
  },

  observations: {},
  observationsLoading: false,
  setObservationsLoading: (loading) => set({ observationsLoading: loading }),
  setObservations: (regionId, observations) =>
    set((state) => ({
      observations: { ...state.observations, [regionId]: observations },
    })),

  routes: [],
  selectedRouteId: null,
  setRoutes: (routes) => set({ routes, selectedRouteId: routes[0]?.id || null }),
  selectRoute: (id) => set({ selectedRouteId: id }),
  routeLoading: false,
  setRouteLoading: (loading) => set({ routeLoading: loading }),

  assistantMessages: [],
  addAssistantMessage: (msg) =>
    set((state) => ({ assistantMessages: [...state.assistantMessages, msg] })),
  assistantLoading: false,
  setAssistantLoading: (loading) => set({ assistantLoading: loading }),

  connectionState: 'online',
  setConnectionState: (state) => set({ connectionState: state }),

  syncStatus: {
    lastSync: null,
    syncInProgress: false,
    cachedRegions: [],
    totalCacheSize: 0,
  },
  setSyncStatus: (status) =>
    set((state) => ({ syncStatus: { ...state.syncStatus, ...status } })),

  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  cameraTarget: null,
  flyToTarget: (lat, lon, elevation = 0) =>
    set({ cameraTarget: { lat, lon, elevation } }),
  cameraReady: false,
  setCameraReady: (ready) => set({ cameraReady: ready }),

  initFromCache: async () => {
    const cachedRegionId = await cacheGet<RegionId>('selected-region');
    if (cachedRegionId) {
      const region = get().regions.find((r) => r.id === cachedRegionId);
      if (region) {
        set({ selectedRegion: region });
        get().flyToTarget(region.lat, region.lon, region.elevation);
      }
    }
    const cachedSync = await cacheGet<SyncStatus>('sync-status');
    if (cachedSync) {
      set({ syncStatus: cachedSync });
    }
  },
}));
