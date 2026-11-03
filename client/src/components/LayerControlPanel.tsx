import { Layers, Search, Database, Info, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useMissionStore } from '@/store/mission-store';
import { useState } from 'react';
import type { LayerType } from '@/types';

const layerTypeColors: Record<LayerType, string> = {
  imagery: '#a5f3fc',
  elevation: '#FBBF24',
  composition: '#35D9F2',
  thermal: '#FF6B72',
  radar: '#8b5cf6',
  hazard: '#F97316',
};

const hazardColors: Record<string, string> = {
  low: '#34D399',
  moderate: '#FBBF24',
  high: '#F97316',
  extreme: '#FF6B72',
};

export function LayerControlPanel() {
  const layers = useMissionStore((s) => s.layers);
  const toggleLayer = useMissionStore((s) => s.toggleLayer);
  const setLayerOpacity = useMissionStore((s) => s.setLayerOpacity);
  const selectedRegion = useMissionStore((s) => s.selectedRegion);
  const targets = useMissionStore((s) => s.targets).filter((t) => t.regionId === selectedRegion?.id);
  const selectTarget = useMissionStore((s) => s.selectTarget);
  const selectedTarget = useMissionStore((s) => s.selectedTarget);

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null);

  const filteredTargets = targets.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const parseCoords = (input: string): { lat: number; lon: number } | null => {
    const match = input.match(/(-?\d+\.?\d*)[°\s,]+(-?\d+\.?\d*)/);
    if (!match) return null;
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lat, lon };
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const coords = parseCoords(searchQuery);
    if (coords) {
      useMissionStore.getState().flyToTarget(coords.lat, coords.lon);
    } else {
      const target = targets.find((t) => t.name.toLowerCase().includes(searchQuery.toLowerCase()));
      if (target) {
        selectTarget(target.id);
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-[#344252]/40">
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8D9CAF]" size={14} aria-hidden />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search coordinates or target..."
            aria-label="Search by coordinates or target name"
            className="w-full pl-8 pr-3 py-2 bg-[#101720] border border-[#344252]/60 rounded-md text-xs text-[#F1F5F9] placeholder:text-[#6B7A8E] focus:outline-none focus:border-accent-500/40 transition-colors"
          />
        </form>
        <p className="text-[10px] text-[#8D9CAF] mt-1.5 font-mono">
          Format: lat, lon (e.g. -4.59, 137.44)
        </p>
      </div>

      {/* Data Layers */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <Layers className="text-accent-400" size={14} aria-hidden />
        <h3 className="section-title">Data Layers</h3>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
        {layers.map((layer) => (
          <div
            key={layer.id}
            className={`rounded-md border transition-all ${
              layer.visible
                ? 'bg-accent-500/[0.06] border-accent-500/20'
                : 'bg-[#101720]/60 border-[#344252]/40'
            } ${!layer.available ? 'opacity-60' : ''}`}
          >
            <div className="flex items-center gap-2 px-2.5 py-2">
              <button
                onClick={() => layer.available && toggleLayer(layer.id)}
                disabled={!layer.available}
                className="flex-shrink-0"
                aria-label={layer.available ? `${layer.visible ? 'Hide' : 'Show'} ${layer.name}` : `${layer.name} not available`}
                aria-pressed={layer.visible}
              >
                {layer.loading ? (
                  <Loader2 className="text-accent-400 animate-spin" size={16} aria-hidden />
                ) : layer.visible ? (
                  <Eye className="text-accent-400" size={16} aria-hidden />
                ) : (
                  <EyeOff className="text-[#8D9CAF]" size={16} aria-hidden />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: layerTypeColors[layer.type] }}
                    aria-hidden
                  />
                  <span className={`text-xs truncate ${layer.available ? 'text-[#F1F5F9]' : 'text-[#8D9CAF]'}`}>
                    {layer.name}
                  </span>
                </div>
                <p className="text-[10px] text-[#8D9CAF] mt-0.5 font-mono">{layer.source}</p>
              </div>
              {layer.cached && (
                <Database className="text-mission-nominal/70" size={12} aria-label="Cached" />
              )}
              {!layer.available && (
                <span className="text-[9px] text-[#8D9CAF] font-mono uppercase">N/A</span>
              )}
            </div>
            {layer.visible && layer.available && (
              <div className="px-2.5 pb-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={layer.opacity}
                    onChange={(e) => setLayerOpacity(layer.id, parseFloat(e.target.value))}
                    className="flex-1 h-1 accent-accent-400 cursor-pointer"
                    aria-label={`${layer.name} opacity`}
                  />
                  <span className="text-[10px] text-[#8D9CAF] font-mono w-8 text-right">
                    {Math.round(layer.opacity * 100)}%
                  </span>
                </div>
                <button
                  onClick={() => setExpandedLayer(expandedLayer === layer.id ? null : layer.id)}
                  className="flex items-center gap-1 text-[10px] text-[#8D9CAF] hover:text-accent-400 transition-colors"
                  aria-expanded={expandedLayer === layer.id}
                >
                  <Info size={10} aria-hidden />
                  {expandedLayer === layer.id ? 'Hide info' : 'Show info'}
                </button>
                {expandedLayer === layer.id && (
                  <p className="text-[10px] text-[#B8C4D3] leading-relaxed animate-fade-in">
                    {layer.description}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Targets in region */}
      {filteredTargets.length > 0 && (
        <>
          <div className="flex items-center gap-2 px-3 pt-2 pb-2 border-t border-[#344252]/40">
            <span className="w-2 h-2 rounded-sm bg-accent-400" aria-hidden />
            <h3 className="section-title">Targets in {selectedRegion?.name}</h3>
            <span className="text-[10px] text-[#8D9CAF] font-mono ml-auto">{filteredTargets.length}</span>
          </div>
          <div className="max-h-32 overflow-y-auto px-2 pb-2 space-y-0.5">
            {filteredTargets.map((target) => (
              <button
                key={target.id}
                onClick={() => selectTarget(target.id)}
                className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors ${
                  selectedTarget?.id === target.id
                    ? 'bg-accent-500/10 text-accent-300'
                    : 'text-[#B8C4D3] hover:bg-white/[0.04] hover:text-[#F1F5F9]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="mission-dot flex-shrink-0"
                    style={{ backgroundColor: hazardColors[target.hazardLevel] }}
                    aria-hidden
                  />
                  <span className="truncate flex-1">{target.name}</span>
                  {!target.verified && (
                    <span className="text-[9px] text-[#8D9CAF] font-mono uppercase">est.</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Legend */}
      <div className="border-t border-[#344252]/40 p-3 space-y-1.5">
        <h3 className="section-title mb-2">Hazard Legend</h3>
        {[
          { label: 'Low', color: '#34D399' },
          { label: 'Moderate', color: '#FBBF24' },
          { label: 'High', color: '#F97316' },
          { label: 'Extreme', color: '#FF6B72' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-[10px] text-[#B8C4D3]">
            <span className="mission-dot" style={{ backgroundColor: item.color }} aria-hidden />
            <span className="font-mono uppercase tracking-wider">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
