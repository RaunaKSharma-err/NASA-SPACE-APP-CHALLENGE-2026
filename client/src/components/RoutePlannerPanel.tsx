import { useState, useEffect } from 'react';
import { Route, Navigation, Gauge, Shield, Clock, TrendingDown, Sparkles, Globe, ChevronUp, ChevronDown } from 'lucide-react';
import { useMissionStore } from '@/store/mission-store';
import { apiClient } from '@/lib/api-client';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import type { RouteRequest } from '@/types';

export function RoutePlannerPanel() {
  const selectedTarget = useMissionStore((s) => s.selectedTarget);
  const selectedRegion = useMissionStore((s) => s.selectedRegion);
  const routes = useMissionStore((s) => s.routes);
  const setRoutes = useMissionStore((s) => s.setRoutes);
  const selectedRouteId = useMissionStore((s) => s.selectedRouteId);
  const selectRoute = useMissionStore((s) => s.selectRoute);
  const routeLoading = useMissionStore((s) => s.routeLoading);
  const setRouteLoading = useMissionStore((s) => s.setRouteLoading);
  const flyToTarget = useMissionStore((s) => s.flyToTarget);

  const [startLat, setStartLat] = useState('');
  const [startLon, setStartLon] = useState('');
  const [endLat, setEndLat] = useState('');
  const [endLon, setEndLon] = useState('');
  const [avoidHazards, setAvoidHazards] = useState(true);
  const [maxSlope, setMaxSlope] = useState(15);
  const [vehicleSpeed, setVehicleSpeed] = useState(0.1);
  const [elevationWeight, setElevationWeight] = useState(0.5);
  const [hazardWeight, setHazardWeight] = useState(10);
  const [error, setError] = useState<string | null>(null);
  // When routes exist, config is collapsed by default; user can expand via "Edit Route"
  const [showConfig, setShowConfig] = useState(routes.length === 0);

  // Listen for "Use as Route Destination" events from TargetDetailsPanel
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { lat: number; lon: number };
      setEndLat(detail.lat.toString());
      setEndLon(detail.lon.toString());
      if (selectedRegion) {
        setStartLat(selectedRegion.lat.toString());
        setStartLon(selectedRegion.lon.toString());
      }
      setRoutes([]);
      setShowConfig(true);
    };
    window.addEventListener('use-target-as-destination', handler);
    return () => window.removeEventListener('use-target-as-destination', handler);
  }, [selectedRegion, setRoutes]);

  // When routes change, collapse config so results get priority
  useEffect(() => {
    if (routes.length > 0) {
      setShowConfig(false);
    }
  }, [routes]);

  const fillFromTarget = () => {
    if (selectedTarget) {
      setEndLat(selectedTarget.lat.toString());
      setEndLon(selectedTarget.lon.toString());
    }
    if (selectedRegion) {
      setStartLat(selectedRegion.lat.toString());
      setStartLon(selectedRegion.lon.toString());
    }
  };

  const handlePlanRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const sLat = parseFloat(startLat);
    const sLon = parseFloat(startLon);
    const eLat = parseFloat(endLat);
    const eLon = parseFloat(endLon);

    if (isNaN(sLat) || isNaN(sLon) || isNaN(eLat) || isNaN(eLon)) {
      setError('Invalid coordinates. Please enter valid numeric values.');
      return;
    }

    if (Math.abs(sLat) > 90 || Math.abs(eLat) > 90) {
      setError('Latitude must be between -90° and 90°.');
      return;
    }

    if (Math.abs(sLon) > 180 || Math.abs(eLon) > 180) {
      setError('Longitude must be between -180° and 180°.');
      return;
    }

    setRouteLoading(true);
    try {
      const request: RouteRequest = {
        startLat: sLat,
        startLon: sLon,
        endLat: eLat,
        endLon: eLon,
        avoidHazards,
        maxSlope,
        vehicleSpeed,
        regionId: selectedRegion?.id || 'gale-crater',
        elevationWeight,
        hazardWeight,
      };
      const alternatives = await apiClient.getRouteAlternatives(request);
      setRoutes(alternatives);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Route planning failed. Check connection and try again.');
    } finally {
      setRouteLoading(false);
    }
  };

  const selectedRoute = routes.find((r) => r.id === selectedRouteId);

  const inputClass = "w-full px-2 py-1.5 bg-[#101720] border border-[#344252]/60 rounded text-xs text-[#F1F5F9] font-mono placeholder:text-[#6B7A8E] focus:outline-none focus:border-accent-500/40 transition-colors";

  const renderConfigForm = () => (
    <form onSubmit={handlePlanRoute} className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="data-label block mb-1" htmlFor="startLat">Start Lat</label>
          <input
            id="startLat"
            type="number"
            step="0.0001"
            value={startLat}
            onChange={(e) => setStartLat(e.target.value)}
            placeholder="-4.5894"
            className={inputClass}
          />
        </div>
        <div>
          <label className="data-label block mb-1" htmlFor="startLon">Start Lon</label>
          <input
            id="startLon"
            type="number"
            step="0.0001"
            value={startLon}
            onChange={(e) => setStartLon(e.target.value)}
            placeholder="137.4417"
            className={inputClass}
          />
        </div>
        <div>
          <label className="data-label block mb-1" htmlFor="endLat">End Lat</label>
          <input
            id="endLat"
            type="number"
            step="0.0001"
            value={endLat}
            onChange={(e) => setEndLat(e.target.value)}
            placeholder="18.4341"
            className={inputClass}
          />
        </div>
        <div>
          <label className="data-label block mb-1" htmlFor="endLon">End Lon</label>
          <input
            id="endLon"
            type="number"
            step="0.0001"
            value={endLon}
            onChange={(e) => setEndLon(e.target.value)}
            placeholder="77.6986"
            className={inputClass}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={fillFromTarget}
        className="text-[10px] text-accent-400 hover:text-accent-300 transition-colors flex items-center gap-1"
      >
        <Navigation size={10} aria-hidden />
        Use region center & selected target
      </button>

      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <button
            type="button"
            onClick={() => setAvoidHazards(!avoidHazards)}
            className={`relative w-8 h-4 rounded-full transition-colors ${avoidHazards ? 'bg-accent-500/40' : 'bg-[#344252]/60'}`}
            aria-pressed={avoidHazards}
            aria-label="Toggle hazard avoidance"
          >
            <span
              className={`absolute top-0.5 w-3 h-3 rounded-full bg-[#F1F5F9] transition-transform ${avoidHazards ? 'translate-x-4' : 'translate-x-0.5'}`}
            />
          </button>
          <span className="text-xs text-[#B8C4D3] flex items-center gap-1">
            <Shield size={11} className="text-[#8D9CAF]" aria-hidden />
            Avoid hazards
          </span>
        </label>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="data-label flex items-center gap-1" htmlFor="maxSlope">
              <TrendingDown size={10} aria-hidden />
              Max slope: {maxSlope}°
            </label>
          </div>
          <input
            id="maxSlope"
            type="range"
            min="5"
            max="30"
            step="1"
            value={maxSlope}
            onChange={(e) => setMaxSlope(parseInt(e.target.value))}
            className="w-full h-1 accent-accent-400 cursor-pointer"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="data-label flex items-center gap-1" htmlFor="vehicleSpeed">
              <Gauge size={10} aria-hidden />
              Vehicle speed: {vehicleSpeed.toFixed(2)} m/s
            </label>
          </div>
          <input
            id="vehicleSpeed"
            type="range"
            min="0.01"
            max="0.5"
            step="0.01"
            value={vehicleSpeed}
            onChange={(e) => setVehicleSpeed(parseFloat(e.target.value))}
            className="w-full h-1 accent-accent-400 cursor-pointer"
          />
        </div>

        <div className="pt-2 border-t border-[#344252]/30">
          <div className="flex items-center justify-between mb-1">
            <label className="data-label flex items-center gap-1" htmlFor="elevationWeight">
              <TrendingDown size={10} aria-hidden />
              Elevation weight: {elevationWeight}
            </label>
          </div>
          <input
            id="elevationWeight"
            type="range"
            min="0"
            max="5"
            step="0.1"
            value={elevationWeight}
            onChange={(e) => setElevationWeight(parseFloat(e.target.value))}
            className="w-full h-1 accent-accent-400 cursor-pointer"
          />
          <div className="flex items-center justify-between mb-1 mt-1">
            <label className="data-label flex items-center gap-1" htmlFor="hazardWeight">
              <Shield size={10} className="text-[#8D9CAF]" aria-hidden />
              Hazard weight: {hazardWeight}
            </label>
          </div>
          <input
            id="hazardWeight"
            type="range"
            min="0"
            max="50"
            step="1"
            value={hazardWeight}
            onChange={(e) => setHazardWeight(parseFloat(e.target.value))}
            className="w-full h-1 accent-accent-400 cursor-pointer"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={routeLoading}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-accent-500/15 border border-accent-500/30 text-accent-300 text-xs font-medium hover:bg-accent-500/25 transition-colors disabled:opacity-50"
      >
        <Route size={14} aria-hidden />
        {routeLoading ? 'Planning...' : 'Plan Route'}
      </button>
    </form>
  );

  const renderConfigSection = () => {
    if (routes.length === 0) {
      // Before planning: show full config
      return (
        <div className="p-3 border-b border-[#344252]/40 shrink-0">
          {renderConfigForm()}
          {error && <div className="mt-2"><ErrorState message={error} compact onRetry={() => setError(null)} /></div>}
        </div>
      );
    }

    // After planning: config collapsed, show compact "Edit Route" bar
    return (
      <div className="px-3 py-2 border-b border-[#344252]/40 shrink-0 flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-[#8D9CAF] font-mono">
            {selectedRoute?.startLat?.toFixed(4)}°, {selectedRoute?.startLon?.toFixed(4)}° →
            {selectedRoute?.endLat?.toFixed(4)}°, {selectedRoute?.endLon?.toFixed(4)}°
          </p>
          <p className="text-[9px] text-[#B8C4D3]">{routes.length} route alternative{routes.length !== 1 ? 's' : ''} calculated</p>
        </div>
        <button
          onClick={() => setShowConfig(true)}
          className="text-[10px] text-accent-400 hover:text-accent-300 transition-colors flex items-center gap-1 shrink-0"
        >
          {showConfig ? <ChevronUp size={10} aria-hidden /> : <ChevronDown size={10} aria-hidden />}
          <span className="ml-0.5">{showConfig ? 'Collapse' : 'Edit Route'}</span>
        </button>
      </div>
    );
  };

  const renderExpandedConfig = () => {
    if (!showConfig || routes.length === 0) return null;
    return (
      <div className="p-3 border-b border-[#344252]/40 shrink-0 space-y-2">
        {renderConfigForm()}
        {error && <div className="mt-2"><ErrorState message={error} compact onRetry={() => setError(null)} /></div>}
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-3 py-2.5 border-b border-[#344252]/40 flex items-center gap-2 shrink-0">
        <Route className="text-accent-400" size={14} aria-hidden />
        <h3 className="section-title">Route Planner</h3>
      </div>

      {/* Configuration section — full form before planning, compact bar after */}
      {renderConfigSection()}
      {renderExpandedConfig()}

      {routeLoading && <LoadingState message="Computing route alternatives" submessage="Analyzing terrain and hazards" size="sm" className="shrink-0" />}

      {/* Results section — takes remaining vertical space, scrollable */}
      {routes.length > 0 && (
        <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-1.5">
          <div className="flex items-center gap-1.5 px-1 pb-1 shrink-0">
            <Sparkles className="text-accent-400" size={12} aria-hidden />
            <span className="section-title">
              {routes.length === 1 ? 'Calculated Route' : 'Route Alternatives'}
            </span>
            <span className="text-[10px] text-[#8D9CAF] ml-auto font-mono">
              {routes.length} route{routes.length !== 1 ? 's' : ''} calculated
            </span>
          </div>
          {routes.map((route, idx) => {
            const isSelected = route.id === selectedRouteId;
            const hazardColor = route.hazardLevel === 'low' ? '#34D399' : route.hazardLevel === 'moderate' ? '#FBBF24' : '#FF6B72';
            return (
              <button
                key={route.id}
                onClick={() => selectRoute(route.id)}
                className={`w-full text-left p-2.5 rounded-md border transition-all ${
                  isSelected
                    ? 'bg-accent-500/[0.08] border-accent-500/30'
                    : 'bg-[#101720]/60 border-[#344252]/40 hover:border-[#344252]'
                }`}
                aria-pressed={isSelected}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-[#F1F5F9]">
                    {routes.length === 1 ? 'Primary Route' : `Option ${idx + 1}`}
                  </span>
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase"
                    style={{ backgroundColor: `${hazardColor}20`, color: hazardColor }}
                  >
                    {route.hazardLevel}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <p className="text-[#8D9CAF]">Distance</p>
                    <p className="text-[#F1F5F9] font-mono">{(route.distance / 1000).toFixed(1)} km</p>
                  </div>
                  <div>
                    <p className="text-[#8D9CAF]">Est. time</p>
                    <p className="text-[#F1F5F9] font-mono">{route.estimatedTime} min</p>
                  </div>
                  <div>
                    <p className="text-[#8D9CAF]">Max slope</p>
                    <p className="text-[#F1F5F9] font-mono">{route.maxSlope}°</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-1.5 text-[10px] text-[#8D9CAF]">
                  <Clock size={10} aria-hidden />
                  <span>Confidence: {(route.confidence * 100).toFixed(0)}%</span>
                  <span className="ml-auto">{route.hazardCount} hazard{route.hazardCount !== 1 ? 's' : ''}</span>
                </div>
              </button>
            );
          })}

          {selectedRoute && (
            <div className="p-2.5 rounded-md bg-[#101720]/60 border border-[#344252]/40 animate-fade-in space-y-2 shrink-0">
              {/* Route Summary */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 px-1 pb-1">
                  <Navigation size={12} className="text-accent-400" aria-hidden />
                  <span className="section-title">Route Summary</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <p className="text-[#8D9CAF]">Start</p>
                    <p className="text-[#F1F5F9] font-mono">
                      {selectedRoute.startLat.toFixed(4)}°, {selectedRoute.startLon.toFixed(4)}°
                    </p>
                  </div>
                  <div>
                    <p className="text-[#8D9CAF]">Destination</p>
                    <p className="text-[#F1F5F9] font-mono">
                      {selectedRoute.endLat.toFixed(4)}°, {selectedRoute.endLon.toFixed(4)}°
                    </p>
                  </div>
                  <div>
                    <p className="text-[#8D9CAF]">Route distance</p>
                    <p className="text-[#F1F5F9] font-mono">
                      {(selectedRoute.distance / 1000).toFixed(2)} km
                    </p>
                  </div>
                  <div>
                    <p className="text-[#8D9CAF]">Direct distance</p>
                    <p className="text-[#F1F5F9] font-mono">
                      {selectedRoute.straightLineDistanceM
                        ? (selectedRoute.straightLineDistanceM / 1000).toFixed(2)
                        : '—'
                      } km
                    </p>
                  </div>
                  <div>
                    <p className="text-[#8D9CAF]">Route overhead</p>
                    <p className="text-[#F1F5F9] font-mono">
                      {selectedRoute.distanceRatio
                        ? ((selectedRoute.distanceRatio - 1) * 100).toFixed(1) + '%'
                        : '—'
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-[#8D9CAF]">Waypoints</p>
                    <p className="text-[#F1F5F9] font-mono">{selectedRoute.waypoints.length}</p>
                  </div>
                </div>
              </div>

              {/* Terrain Analysis */}
              <div className="space-y-1.5 border-t border-[#344252]/30 pt-2 shrink-0">
                <div className="flex items-center gap-1.5 px-1 pb-1">
                  <Globe size={12} className="text-accent-400" aria-hidden />
                  <span className="section-title">Terrain Analysis</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <p className="text-[#8D9CAF]">Avg slope</p>
                    <p className="text-[#F1F5F9] font-mono">{selectedRoute.avgSlope.toFixed(1)}°</p>
                  </div>
                  <div>
                    <p className="text-[#8D9CAF]">Max slope</p>
                    <p className="text-[#F1F5F9] font-mono">{selectedRoute.maxSlope.toFixed(1)}°</p>
                  </div>
                  <div>
                    <p className="text-[#8D9CAF]">Elevation gain</p>
                    <p className="text-[#F1F5F9] font-mono">
                      {selectedRoute.elevationGainM != null
                        ? selectedRoute.elevationGainM.toFixed(0) + ' m'
                        : '—'
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-[#8D9CAF]">Elevation loss</p>
                    <p className="text-[#F1F5F9] font-mono">
                      {selectedRoute.elevationLossM != null
                        ? selectedRoute.elevationLossM.toFixed(0) + ' m'
                        : '—'
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-[#8D9CAF]">High-slope segments</p>
                    <p className="text-[#F1F5F9] font-mono">
                      {selectedRoute.highSlopeSegments != null
                        ? selectedRoute.highSlopeSegments
                        : '—'
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-[#8D9CAF]">Terrain coverage</p>
                    <p className="text-[#F1F5F9] font-mono">
                      {selectedRoute.terrainCoverage || '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Route Decision Explanation */}
              <div className="space-y-1.5 border-t border-[#344252]/30 pt-2 shrink-0">
                <div className="flex items-center gap-1.5 px-1 pb-1">
                  <Sparkles size={12} className="text-accent-400" aria-hidden />
                  <span className="section-title">Route Decision</span>
                </div>
                <p className="text-[10px] text-[#B8C4D3] leading-relaxed">
                  {selectedRoute.reasoning}
                </p>
                {selectedRoute.distanceRatio != null && selectedRoute.distanceRatio > 1.05 && (
                  <p className="text-[9px] text-[#FBBF24] leading-relaxed mt-1">
                    The selected route detours around steeper terrain to reduce slope risk.
                    Direct distance was {(selectedRoute.straightLineDistanceM ?? 0) / 1000} km;
                    the terrain-aware path adds {((selectedRoute.distanceRatio - 1) * 100).toFixed(1)}% route overhead.
                  </p>
                )}
                {selectedRoute.distanceRatio != null && selectedRoute.distanceRatio <= 1.05 && (
                  <p className="text-[9px] text-[#34D399] leading-relaxed mt-1">
                    The direct path is the optimal route — no terrain detour was needed.
                  </p>
                )}
              </div>

              {/* Data Confidence */}
              <div className="space-y-1.5 border-t border-[#344252]/30 pt-2 shrink-0">
                <div className="flex items-center gap-1.5 px-1 pb-1">
                  <Shield size={12} className="text-accent-400" aria-hidden />
                  <span className="section-title">Data Confidence</span>
                </div>
                <div className="space-y-1 text-[9px]">
                  <p className="leading-relaxed text-[#B8C4D3]">
                    Route is based on measured slope from elevation grid ({selectedRoute.terrainCoverage || 'unknown status'}).
                    {' '}
                    {selectedRoute.warnings?.some((w: string) => w.includes('SYNTHETIC')) ? (
                      <span className="text-[#FBBF24]">⚠ Synthetic terrain fixture — not real Mars data.</span>
                    ) : (
                      <span className="text-[#34D399]">✓ Terrain data from verified source.</span>
                    )}
                  </p>
                  <p className="leading-relaxed text-[#B8C4D3]">
                    Only slope hazard is evaluated. Rocks, loose regolith, thermal, dust and radiation
                    were NOT assessed. This is a slope-feasible route, not a verified safe route.
                  </p>
                  {selectedRoute.noDataCellsEncountered != null && selectedRoute.noDataCellsEncountered > 0 && (
                    <p className="leading-relaxed text-[#FBBF24]">
                      ⚠ {selectedRoute.noDataCellsEncountered} no-data cell(s) encountered along route.
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={() => flyToTarget(
                  (selectedRoute.startLat + selectedRoute.endLat) / 2,
                  (selectedRoute.startLon + selectedRoute.endLon) / 2
                )}
                className="mt-2 text-[10px] text-accent-400 hover:text-accent-300 transition-colors flex items-center gap-1 shrink-0"
              >
                <Navigation size={10} aria-hidden />
                View route on map
              </button>
            </div>
          )}

          <p className="text-[9px] text-[#8D9CAF] leading-relaxed px-1 pt-1 shrink-0">
            Route computation uses slope-aware A* pathfinding on terrain elevation grids.
            Only slope is evaluated — other hazards are NOT assessed.
            When the backend is unavailable, simulated fallback data is used.
          </p>
        </div>
      )}

      {!routeLoading && routes.length === 0 && (
        <div className="flex-1 flex-col items-center justify-center min-h-0 px-4 text-center">
          <Route className="text-[#344252]" size={28} aria-hidden />
          <p className="text-xs text-[#B8C4D3] mt-2">No routes planned yet</p>
          <p className="text-[11px] text-[#8D9CAF] mt-1">Enter coordinates and plan a route</p>
        </div>
      )}
    </div>
  );
}
