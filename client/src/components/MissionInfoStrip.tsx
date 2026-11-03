import { MapPin, Route as RouteIcon, Mountain, Layers, Database, Activity } from 'lucide-react';
import { useMissionStore } from '@/store/mission-store';

export function MissionInfoStrip() {
  const selectedTarget = useMissionStore((s) => s.selectedTarget);
  const selectedRegion = useMissionStore((s) => s.selectedRegion);
  const routes = useMissionStore((s) => s.routes);
  const selectedRouteId = useMissionStore((s) => s.selectedRouteId);
  const layers = useMissionStore((s) => s.layers);
  const connectionState = useMissionStore((s) => s.connectionState);
  const syncStatus = useMissionStore((s) => s.syncStatus);

  const selectedRoute = routes.find((r) => r.id === selectedRouteId);
  const visibleLayers = layers.filter((l) => l.visible && l.available);

  const sourceLabel =
    connectionState === 'online' ? 'Fixture Data' :
    connectionState === 'degraded' ? 'Cached + Fixture' :
    'Cached';

  const cacheDotClass =
    connectionState === 'online' ? 'bg-mission-nominal' :
    connectionState === 'degraded' ? 'bg-mission-caution' :
    'bg-mission-critical';

  return (
    <footer className="flex items-center gap-3 px-4 py-2 glass-panel border-t border-[#344252]/60 rounded-none border-x-0 border-b-0 z-20 overflow-x-auto" role="contentinfo">
      {/* Coordinates */}
      <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
        <MapPin className="text-accent-400" size={12} aria-hidden />
        <span className="data-label">Target</span>
        <span className="data-value text-[#F1F5F9]">
          {selectedTarget ? `${selectedTarget.lat.toFixed(4)}°, ${selectedTarget.lon.toFixed(4)}°` : '—'}
        </span>
      </div>

      <div className="h-4 w-px bg-[#344252]/60 flex-shrink-0" />

      {/* Route distance */}
      <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
        <RouteIcon className="text-accent-400" size={12} aria-hidden />
        <span className="data-label">Route</span>
        <span className="data-value text-[#F1F5F9]">
          {selectedRoute ? `${(selectedRoute.distance / 1000).toFixed(1)} km` : '—'}
        </span>
      </div>

      {/* Elevation */}
      <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
        <Mountain className="text-accent-400" size={12} aria-hidden />
        <span className="data-label">Elevation</span>
        <span className="data-value text-[#F1F5F9]">
          {selectedTarget ? `${selectedTarget.elevation > 0 ? '+' : ''}${selectedTarget.elevation.toLocaleString()} m` : selectedRegion ? `${selectedRegion.elevation > 0 ? '+' : ''}${selectedRegion.elevation.toLocaleString()} m` : '—'}
        </span>
      </div>

      {/* Slope */}
      {selectedRoute && (
        <>
          <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
            <Activity className="text-accent-400" size={12} aria-hidden />
            <span className="data-label">Max slope</span>
            <span className="data-value text-[#F1F5F9]">{selectedRoute.maxSlope}°</span>
          </div>
          <div className="h-4 w-px bg-[#344252]/60 flex-shrink-0" />
        </>
      )}

      {/* Visible layers */}
      <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
        <Layers className="text-accent-400" size={12} aria-hidden />
        <span className="data-label">Layers</span>
        <span className="data-value text-[#F1F5F9]">
          {visibleLayers.length > 0 ? visibleLayers.map((l) => l.name.split(' ')[0]).join(', ') : 'None'}
        </span>
      </div>

      <div className="h-4 w-px bg-[#344252]/60 flex-shrink-0" />

      {/* Data source */}
      <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
        <Database className="text-accent-400" size={12} aria-hidden />
        <span className="data-label">Source</span>
        <span className="data-value text-[#F1F5F9]">
          {sourceLabel}
        </span>
      </div>

      {/* Cache status */}
      <div className="flex items-center gap-1.5 text-xs flex-shrink-0 ml-auto">
        <span className="data-label">Cache</span>
        <span className="data-value text-[#B8C4D3]">
          {syncStatus.cachedRegions.length} regions
        </span>
        <span className={`mission-dot ${cacheDotClass}`} aria-hidden />
      </div>
    </footer>
  );
}
