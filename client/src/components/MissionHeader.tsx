import { Radio, Globe2, Settings, Wifi, WifiOff, RefreshCw, Download, Satellite } from 'lucide-react';
import { useMissionStore } from '@/store/mission-store';
import { useEffect, useState } from 'react';

export function MissionHeader() {
  const selectedRegion = useMissionStore((s) => s.selectedRegion);
  const connectionState = useMissionStore((s) => s.connectionState);
  const setConnectionState = useMissionStore((s) => s.setConnectionState);
  const syncStatus = useMissionStore((s) => s.syncStatus);
  const setSettingsOpen = useMissionStore((s) => s.setSettingsOpen);
  const layers = useMissionStore((s) => s.layers);

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const cachedLayerCount = layers.filter((l) => l.cached).length;
  const availableLayerCount = layers.filter((l) => l.available).length;
  const isOnline = connectionState === 'online';

  const formatSyncTime = (ts: number | null) => {
    if (!ts) return 'Never';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  };

  const toggleConnection = () => {
    setConnectionState(isOnline ? 'offline' : 'online');
  };

  const statusDotClass =
    selectedRegion?.missionStatus === 'active' ? 'bg-mission-nominal' :
    selectedRegion?.missionStatus === 'proposed' ? 'bg-mission-caution' :
    'bg-mission-standby';

  const statusLabel = selectedRegion?.missionStatus || 'standby';

  const timeStr = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <header className="flex items-center justify-between px-4 py-2.5 glass-panel border-b border-[#344252]/60 rounded-none border-x-0 border-t-0 z-20">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="relative">
            <Globe2 className="text-accent-400" size={22} aria-hidden />
            <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-accent-400 rounded-full animate-pulse" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-[#F1F5F9] tracking-wide">
              MARS <span className="text-accent-400">EXPLORER</span>
            </h1>
            <p className="text-[10px] text-[#8D9CAF] font-mono tracking-widest uppercase">
              Interplanetary Survival Guide
            </p>
          </div>
        </div>

        <div className="h-8 w-px bg-[#344252]/60 flex-shrink-0" />

        <div className="flex items-center gap-2 text-xs flex-shrink-0">
          <Satellite className="text-[#8D9CAF]" size={14} aria-hidden />
          <span className="data-label">Region</span>
          <span className="data-value text-accent-300">
            {selectedRegion?.name || 'None Selected'}
          </span>
        </div>

        {selectedRegion && (
          <div className="hidden md:flex items-center gap-2 text-xs flex-shrink-0">
            <span className="data-label">Coords</span>
            <span className="data-value text-[#B8C4D3]">
              {selectedRegion.lat.toFixed(4)}°, {selectedRegion.lon.toFixed(4)}°
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5 flex-shrink-0">
        <div className="hidden lg:flex items-center gap-2 text-xs">
          <span className="data-label">Mission</span>
          <div className="flex items-center gap-1.5">
            <span className={`mission-dot ${statusDotClass}`} />
            <span className="data-value text-[#B8C4D3] capitalize">{statusLabel}</span>
          </div>
        </div>

        <div className="h-5 w-px bg-[#344252]/60 hidden lg:block" />

        <button
          onClick={toggleConnection}
          className="flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-white/[0.04] transition-colors"
          title={isOnline ? 'Online — click to simulate offline' : 'Offline — click to reconnect'}
          aria-label={isOnline ? 'Online — click to simulate offline' : 'Offline — click to reconnect'}
          aria-pressed={!isOnline}
        >
          {isOnline ? (
            <Wifi className="text-mission-nominal" size={14} aria-hidden />
          ) : (
            <WifiOff className="text-mission-critical" size={14} aria-hidden />
          )}
          <span className={`data-value ${isOnline ? 'text-mission-nominal' : 'text-mission-critical'}`}>
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
        </button>

        <div className="hidden md:flex items-center gap-1.5 text-xs">
          <Download className="text-[#8D9CAF]" size={14} aria-hidden />
          <span className="data-label">Cache</span>
          <span className="data-value text-[#B8C4D3]">
            {cachedLayerCount}/{availableLayerCount} layers
          </span>
        </div>

        <div className="hidden lg:flex items-center gap-1.5 text-xs">
          <RefreshCw className={`text-[#8D9CAF] ${syncStatus.syncInProgress ? 'animate-spin' : ''}`} size={14} aria-hidden />
          <span className="data-label">Sync</span>
          <span className="data-value text-[#B8C4D3]">{formatSyncTime(syncStatus.lastSync)}</span>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-[#8D9CAF] tabular-nums" aria-label="Current time">
          <Radio className="text-accent-500/60" size={14} aria-hidden />
          <span>{timeStr}</span>
        </div>

        <button
          onClick={() => setSettingsOpen(true)}
          className="p-1.5 rounded hover:bg-white/[0.06] transition-colors"
          title="Settings"
          aria-label="Open settings"
        >
          <Settings className="text-[#B8C4D3] hover:text-accent-400 transition-colors" size={16} aria-hidden />
        </button>
      </div>
    </header>
  );
}
