import { Globe2, ChevronDown } from 'lucide-react';
import { useMissionStore } from '@/store/mission-store';
import { useState, useRef, useEffect } from 'react';
import type { Region } from '@/types';

const hazardColors: Record<Region['hazardLevel'], string> = {
  low: '#34D399',
  moderate: '#FBBF24',
  high: '#F97316',
  extreme: '#FF6B72',
};

const statusColors: Record<Region['missionStatus'], string> = {
  active: '#34D399',
  proposed: '#FBBF24',
  candidate: '#35D9F2',
  none: '#8D9CAF',
};

export function RegionSelector() {
  const regions = useMissionStore((s) => s.regions);
  const selectedRegion = useMissionStore((s) => s.selectedRegion);
  const selectRegion = useMissionStore((s) => s.selectRegion);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-[#101720] border border-[#344252]/60 rounded-md hover:border-accent-500/30 transition-colors"
        aria-expanded={open}
        aria-label="Select mission region"
      >
        <Globe2 className="text-accent-400 flex-shrink-0" size={14} aria-hidden />
        <div className="flex-1 text-left min-w-0">
          <p className="text-xs text-[#F1F5F9] truncate">{selectedRegion?.name || 'Select region'}</p>
          <p className="text-[10px] text-[#8D9CAF] font-mono">
            {selectedRegion ? `${selectedRegion.lat.toFixed(2)}°, ${selectedRegion.lon.toFixed(2)}° · ${selectedRegion.elevation > 0 ? '+' : ''}${(selectedRegion.elevation / 1000).toFixed(1)} km` : ''}
          </p>
        </div>
        <ChevronDown className={`text-[#8D9CAF] transition-transform ${open ? 'rotate-180' : ''}`} size={14} aria-hidden />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 glass-panel-accent z-30 max-h-80 overflow-y-auto animate-slide-up" role="listbox">
          {regions.map((region) => (
            <button
              key={region.id}
              onClick={() => {
                selectRegion(region.id);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2.5 border-b border-[#344252]/40 last:border-0 hover:bg-accent-500/[0.06] transition-colors ${
                selectedRegion?.id === region.id ? 'bg-accent-500/[0.08]' : ''
              }`}
              role="option"
              aria-selected={selectedRegion?.id === region.id}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="mission-dot flex-shrink-0" style={{ backgroundColor: statusColors[region.missionStatus] }} />
                <span className="text-xs text-[#F1F5F9] flex-1">{region.name}</span>
                <span className="mission-dot flex-shrink-0" style={{ backgroundColor: hazardColors[region.hazardLevel] }} />
              </div>
              <p className="text-[10px] text-[#8D9CAF] leading-snug pl-4">{region.description.slice(0, 80)}...</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
