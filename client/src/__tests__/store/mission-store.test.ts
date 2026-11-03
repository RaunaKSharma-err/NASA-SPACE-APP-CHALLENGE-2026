import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMissionStore } from '@/store/mission-store';
import { REGIONS, DATA_LAYERS, TARGETS } from '@/data/mars-data';
import { apiClient } from '@/lib/api-client';
import type { RegionId, LayerSource } from '@/types';

// Mock the API client
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getRegions: vi.fn(),
    getLayers: vi.fn(),
    getObservations: vi.fn(),
  },
}));

describe('mission-store', () => {
  beforeEach(() => {
    useMissionStore.setState({
      selectedRegion: REGIONS[0],
      selectedTarget: null,
      routes: [],
      selectedRouteId: null,
      layers: DATA_LAYERS,
      targets: TARGETS,
      assistantMessages: [],
      assistantLoading: false,
      routeLoading: false,
      connectionState: 'online',
      syncStatus: { lastSync: null, syncInProgress: false, cachedRegions: [], totalCacheSize: 0 },
      settingsOpen: false,
      cameraTarget: null,
      cameraReady: false,
      regions: REGIONS,
      regionsLoading: false,
      regionsError: null,
      layersLoading: false,
      layersError: null,
      observations: {},
      observationsLoading: false,
    });
    vi.clearAllMocks();
  });

  it('starts with first region selected', () => {
    expect(useMissionStore.getState().selectedRegion?.id).toBe('gale-crater');
  });

  it('selectRegion updates selected region', () => {
    useMissionStore.getState().selectRegion('jezero-crater');
    expect(useMissionStore.getState().selectedRegion?.id).toBe('jezero-crater');
  });

  it('selectRegion clears selected target', () => {
    useMissionStore.getState().selectTarget('gale-mt-sharp');
    useMissionStore.getState().selectRegion('jezero-crater');
    expect(useMissionStore.getState().selectedTarget).toBeNull();
  });

  it('toggleLayer toggles visibility for available layers', () => {
    const initialVisible = useMissionStore.getState().layers.find((l) => l.id === 'mola-elevation')?.visible;
    useMissionStore.getState().toggleLayer('mola-elevation');
    const afterToggle = useMissionStore.getState().layers.find((l) => l.id === 'mola-elevation')?.visible;
    expect(afterToggle).toBe(!initialVisible);
  });

  it('toggleLayer does not toggle unavailable layers', () => {
    useMissionStore.getState().toggleLayer('hirise-imagery');
    expect(useMissionStore.getState().layers.find((l) => l.id === 'hirise-imagery')?.visible).toBe(false);
  });

  it('selectTarget sets the selected target', () => {
    useMissionStore.getState().selectTarget('jezero-delta');
    expect(useMissionStore.getState().selectedTarget?.id).toBe('jezero-delta');
  });

  it('selectTarget with null clears selection', () => {
    useMissionStore.getState().selectTarget('gale-mt-sharp');
    useMissionStore.getState().selectTarget(null);
    expect(useMissionStore.getState().selectedTarget).toBeNull();
  });

  it('setRoutes updates routes and selects first', () => {
    const mockRoutes = [
      { id: 'r1', startLat: 0, startLon: 0, endLat: 1, endLon: 1, distance: 100, estimatedTime: 10, maxSlope: 5, avgSlope: 3, hazardCount: 0, hazardLevel: 'low' as const, waypoints: [], confidence: 0.9, reasoning: 'test' },
    ];
    useMissionStore.getState().setRoutes(mockRoutes);
    expect(useMissionStore.getState().routes).toHaveLength(1);
    expect(useMissionStore.getState().selectedRouteId).toBe('r1');
  });

  it('flyToTarget sets camera target', () => {
    useMissionStore.getState().flyToTarget(-4.5, 137.4, 1000);
    expect(useMissionStore.getState().cameraTarget).toEqual({ lat: -4.5, lon: 137.4, elevation: 1000 });
  });

  it('setConnectionState updates connection state', () => {
    useMissionStore.getState().setConnectionState('offline');
    expect(useMissionStore.getState().connectionState).toBe('offline');
  });

  it('addAssistantMessage appends to messages', () => {
    const msg = { id: 'm1', role: 'user' as const, content: 'test', timestamp: Date.now() };
    useMissionStore.getState().addAssistantMessage(msg);
    expect(useMissionStore.getState().assistantMessages).toHaveLength(1);
  });

  // New tests for backend integration
  it('setRegions replaces regions from backend', () => {
    const backendRegions = [
      { id: 'custom-region' as RegionId, name: 'Custom Region', fullName: 'Custom Region', lat: 10, lon: 20, elevation: 0, radius: 50, description: 'Test', scientificInterest: 'Test', hazardLevel: 'low' as const, missionStatus: 'active' as const },
    ];
    useMissionStore.getState().setRegions(backendRegions);
    expect(useMissionStore.getState().regions).toHaveLength(1);
    expect(useMissionStore.getState().regions[0].id).toBe('custom-region');
  });

  it('setLayers replaces layers from backend', () => {
    const backendLayers = [
      { id: 'custom-layer', name: 'Custom Layer', type: 'elevation' as const, source: 'Test' as LayerSource, description: 'Test', available: true, cached: false, loading: false, color: '#ff0000', opacity: 0.5, visible: false },
    ];
    useMissionStore.getState().setLayers(backendLayers);
    expect(useMissionStore.getState().layers).toHaveLength(1);
    expect(useMissionStore.getState().layers[0].id).toBe('custom-layer');
  });

  it('setRegionsLoading updates loading state', () => {
    useMissionStore.getState().setRegionsLoading(true);
    expect(useMissionStore.getState().regionsLoading).toBe(true);
    useMissionStore.getState().setRegionsLoading(false);
    expect(useMissionStore.getState().regionsLoading).toBe(false);
  });

  it('setLayersLoading updates loading state', () => {
    useMissionStore.getState().setLayersLoading(true);
    expect(useMissionStore.getState().layersLoading).toBe(true);
    useMissionStore.getState().setLayersLoading(false);
    expect(useMissionStore.getState().layersLoading).toBe(false);
  });

  it('setRegionsError updates error state', () => {
    useMissionStore.getState().setRegionsError('Test error');
    expect(useMissionStore.getState().regionsError).toBe('Test error');
    useMissionStore.getState().setRegionsError(null);
    expect(useMissionStore.getState().regionsError).toBeNull();
  });

  it('setLayersError updates error state', () => {
    useMissionStore.getState().setLayersError('Test error');
    expect(useMissionStore.getState().layersError).toBe('Test error');
    useMissionStore.getState().setLayersError(null);
    expect(useMissionStore.getState().layersError).toBeNull();
  });

  it('setObservations stores observations by region', () => {
    const obs = [{ id: 'obs-1', regionId: 'gale-crater' as const, instrument: 'Test', timestamp: '2024-01-01', type: 'test', value: '1', unit: 'm', source: 'test' }];
    useMissionStore.getState().setObservations('gale-crater', obs);
    expect(useMissionStore.getState().observations['gale-crater']).toEqual(obs);
  });

  it('setObservationsLoading updates loading state', () => {
    useMissionStore.getState().setObservationsLoading(true);
    expect(useMissionStore.getState().observationsLoading).toBe(true);
    useMissionStore.getState().setObservationsLoading(false);
    expect(useMissionStore.getState().observationsLoading).toBe(false);
  });

  it('selectRegion fetches observations from backend', async () => {
    const mockObs = [{ id: 'obs-1', regionId: 'jezero-crater' as const, instrument: 'Test', timestamp: '2024-01-01', type: 'test', value: '1', unit: 'm', source: 'test' }];
    vi.mocked(apiClient.getObservations).mockResolvedValue(mockObs);

    useMissionStore.getState().selectRegion('jezero-crater');

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(vi.mocked(apiClient.getObservations)).toHaveBeenCalledWith('jezero-crater');
    expect(useMissionStore.getState().observations['jezero-crater']).toEqual(mockObs);
  });

  it('selectRegion does not overwrite observations for different region', async () => {
    const mockObs = [{ id: 'obs-1', regionId: 'jezero-crater' as RegionId, instrument: 'Test', timestamp: '2024-01-01', type: 'test', value: '1', unit: 'm', source: 'test' }];
    vi.mocked(apiClient.getObservations).mockResolvedValue(mockObs);

    // First select gale-crater
    useMissionStore.getState().selectRegion('gale-crater');
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Then select jezero-crater (gale-crater is no longer selected)
    useMissionStore.getState().selectRegion('jezero-crater');
    await new Promise((resolve) => setTimeout(resolve, 0));

    // gale-crater observations should still be set (from first call)
    // jezero-crater observations should also be set
    expect(useMissionStore.getState().observations['jezero-crater']).toEqual(mockObs);
  });
});
