import { Database, FileText, Globe } from 'lucide-react';
import { useMissionStore } from '@/store/mission-store';

export function DataProvenancePanel() {
  const layers = useMissionStore((s) => s.layers);
  const availableLayers = layers.filter((l) => l.available);
  const cachedLayers = layers.filter((l) => l.cached);

  const sources = Array.from(new Set(availableLayers.map((l) => l.source)));

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5">
        <FileText className="text-accent-400" size={13} aria-hidden />
        <h3 className="section-title">Data Provenance</h3>
      </div>

      <div className="glass-panel p-2.5 space-y-1.5">
        <p className="text-[10px] text-[#B8C4D3] leading-relaxed">
          Scientific data is sourced from NASA Mars missions and peer-reviewed publications.
          When the backend API is available, live data is fetched automatically.
          When unavailable, local fixture data is used as a fallback.
        </p>

        <div className="pt-1.5 space-y-1">
          <p className="data-label mb-1">Active Sources</p>
          {sources.map((source) => {
            const sourceLayers = availableLayers.filter((l) => l.source === source);
            return (
              <div key={source} className="flex items-center gap-2 text-[10px]">
                <Globe className="text-[#8D9CAF]" size={10} aria-hidden />
                <span className="text-[#B8C4D3] font-mono flex-1">{source}</span>
                <span className="text-[#8D9CAF]">{sourceLayers.length} layer{sourceLayers.length !== 1 ? 's' : ''}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="glass-panel p-2.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="data-label flex items-center gap-1">
            <Database size={10} aria-hidden />
            Cached Layers
          </span>
          <span className="data-value text-mission-nominal">
            {cachedLayers.length}/{availableLayers.length}
          </span>
        </div>
      </div>

      <p className="text-[9px] text-[#8D9CAF] leading-relaxed">
        MRO = Mars Reconnaissance Orbiter · MGS = Mars Global Surveyor ·
        MO = Mars Odyssey · MARSIS = Mars Advanced Radar · SHARAD = Shallow Radar
      </p>
    </div>
  );
}
