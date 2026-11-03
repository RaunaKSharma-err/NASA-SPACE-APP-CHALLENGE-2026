import { MapPin, Mountain, AlertTriangle, FlaskConical, CheckCircle2, HelpCircle, Crosshair, Navigation } from 'lucide-react';
import { useMissionStore } from '@/store/mission-store';
import type { TargetLocation } from '@/types';

const typeLabels: Record<TargetLocation['type'], string> = {
  outcrop: 'Geological Outcrop',
  crater: 'Crater',
  channel: 'Channel',
  ridge: 'Ridge / Mountain',
  delta: 'Delta Deposit',
  'cave-candidate': 'Cave Candidate',
  'landing-site': 'Landing Site',
};

const hazardConfig = {
  low: { color: '#34D399', label: 'Low Hazard' },
  moderate: { color: '#FBBF24', label: 'Moderate Hazard' },
  high: { color: '#F97316', label: 'High Hazard' },
  extreme: { color: '#FF6B72', label: 'Extreme Hazard' },
};

export function TargetDetailsPanel() {
  const selectedTarget = useMissionStore((s) => s.selectedTarget);
  const selectTarget = useMissionStore((s) => s.selectTarget);
  const flyToTarget = useMissionStore((s) => s.flyToTarget);
  const setRoutes = useMissionStore((s) => s.setRoutes);
  const selectRoute = useMissionStore((s) => s.selectRoute);

  if (!selectedTarget) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <Crosshair className="text-[#344252]" size={32} aria-hidden />
        <p className="text-xs text-[#B8C4D3] mt-3">No target selected</p>
        <p className="text-[11px] text-[#8D9CAF] mt-1">
          Click a marker on the globe or select from the left panel
        </p>
      </div>
    );
  }

  const hazard = hazardConfig[selectedTarget.hazardLevel];

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Target header */}
      <div className="px-3 py-3 border-b border-[#344252]/40">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <MapPin className="text-accent-400 flex-shrink-0" size={16} aria-hidden />
              <h2 className="text-sm font-semibold text-[#F1F5F9]">{selectedTarget.name}</h2>
            </div>
            <p className="text-[10px] text-[#8D9CAF] mt-1 font-mono">{typeLabels[selectedTarget.type]}</p>
          </div>
          <button
            onClick={() => selectTarget(null)}
            className="text-[#8D9CAF] hover:text-[#B8C4D3] transition-colors text-xs"
            aria-label="Clear target selection"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Coordinates */}
      <div className="px-3 py-2.5 border-b border-[#344252]/40 grid grid-cols-2 gap-2">
        <div>
          <p className="data-label">Latitude</p>
          <p className="data-value text-accent-300">{selectedTarget.lat.toFixed(4)}°</p>
        </div>
        <div>
          <p className="data-label">Longitude</p>
          <p className="data-value text-accent-300">{selectedTarget.lon.toFixed(4)}°</p>
        </div>
        <div>
          <p className="data-label">Elevation</p>
          <p className="data-value text-[#F1F5F9]">
            {selectedTarget.elevation > 0 ? '+' : ''}{selectedTarget.elevation.toLocaleString()} m
          </p>
        </div>
        <div>
          <p className="data-label">Type</p>
          <p className="data-value text-[#F1F5F9] capitalize">{selectedTarget.type.replace('-', ' ')}</p>
        </div>
      </div>

      {/* Scientific Interest */}
      <div className="px-3 py-3 border-b border-[#344252]/40">
        <div className="flex items-center gap-1.5 mb-1.5">
          <FlaskConical className="text-accent-400" size={13} aria-hidden />
          <h3 className="section-title">Scientific Interest</h3>
        </div>
        <p className="text-xs text-[#B8C4D3] leading-relaxed">{selectedTarget.scientificInterest}</p>
      </div>

      {/* Hazard Assessment */}
      <div className="px-3 py-3 border-b border-[#344252]/40">
        <div className="flex items-center gap-1.5 mb-2">
          <AlertTriangle className="text-[#B8C4D3]" size={13} aria-hidden />
          <h3 className="section-title">Terrain & Hazard</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="mission-dot" style={{ backgroundColor: hazard.color }} aria-hidden />
          <span className="text-xs font-medium" style={{ color: hazard.color }}>{hazard.label}</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <Mountain className="text-[#8D9CAF]" size={12} aria-hidden />
          <span className="text-[10px] text-[#8D9CAF] font-mono">
            Elevation: {selectedTarget.elevation > 0 ? '+' : ''}{selectedTarget.elevation.toLocaleString()} m
          </span>
        </div>
        <p className="text-[10px] text-[#8D9CAF] mt-1.5">
          Hazard classification derived from MOLA slope analysis. Actual ground-level hazards require in situ assessment.
        </p>
      </div>

      {/* Evidence & Verification */}
      <div className="px-3 py-3 border-b border-[#344252]/40">
        <div className="flex items-center gap-1.5 mb-2">
          {selectedTarget.verified ? (
            <CheckCircle2 className="text-mission-nominal" size={13} aria-hidden />
          ) : (
            <HelpCircle className="text-mission-caution" size={13} aria-hidden />
          )}
          <h3 className="section-title">Evidence & Verification</h3>
        </div>
        <div className="flex items-center gap-1.5 mb-2">
          <span
            className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase tracking-wider ${
              selectedTarget.verified
                ? 'bg-mission-nominal/10 text-mission-nominal'
                : 'bg-mission-caution/10 text-mission-caution'
            }`}
          >
            {selectedTarget.verified ? 'Verified' : 'Estimated'}
          </span>
        </div>
        <ul className="space-y-1">
          {selectedTarget.evidence.map((ev, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-[#B8C4D3]">
              <span className="text-accent-500 mt-0.5">›</span>
              <span>{ev}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Source */}
      <div className="px-3 py-2.5 border-b border-[#344252]/40">
        <p className="data-label mb-1">Data Source</p>
        <p className="text-[11px] text-[#B8C4D3] font-mono">{selectedTarget.source}</p>
      </div>

      {/* Actions */}
      <div className="px-3 py-3 mt-auto space-y-2">
        <button
          onClick={() => flyToTarget(selectedTarget.lat, selectedTarget.lon, selectedTarget.elevation)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-accent-500/10 border border-accent-500/20 text-accent-300 text-xs hover:bg-accent-500/20 transition-colors"
        >
          <Crosshair size={14} aria-hidden />
          Center on Target
        </button>
        <button
          onClick={() => {
            setRoutes([]);
            selectRoute('');
            window.dispatchEvent(new CustomEvent('use-target-as-destination', {
              detail: { lat: selectedTarget.lat, lon: selectedTarget.lon }
            }));
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-white/[0.04] border border-[#344252]/60 text-[#B8C4D3] text-xs hover:bg-white/[0.06] transition-colors"
        >
          <Navigation size={14} aria-hidden />
          Use as Route Destination
        </button>
      </div>
    </div>
  );
}
