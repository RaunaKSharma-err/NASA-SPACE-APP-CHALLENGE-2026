import { RefreshCw, Satellite, Download, Clock } from 'lucide-react';
import { useMissionStore } from '@/store/mission-store';
import { cacheSet } from '@/lib/cache';
import { apiClient } from '@/lib/api-client';
import { useState } from 'react';

export function RelaySyncPanel() {
  const syncStatus = useMissionStore((s) => s.syncStatus);
  const setSyncStatus = useMissionStore((s) => s.setSyncStatus);
  const connectionState = useMissionStore((s) => s.connectionState);
  const selectedRegion = useMissionStore((s) => s.selectedRegion);
  const layers = useMissionStore((s) => s.layers);
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    if (syncing || connectionState === 'offline') return;
    setSyncing(true);
    setSyncStatus({ syncInProgress: true });

    try {
      // Query current relay status from backend (SIMULATED relay)
      const statusResp = await apiClient.syncStatus('status');
      setSyncStatus({
        connected: statusResp.connected,
        lastSync: statusResp.last_synchronized ? Date.parse(statusResp.last_synchronized) : null,
      });

      // Perform sync action via backend
      const syncResp = await apiClient.syncStatus('sync');

      const now = Date.now();
      const cachedRegions = selectedRegion
        ? Array.from(new Set([...syncStatus.cachedRegions, selectedRegion.id]))
        : syncStatus.cachedRegions;

      const newStatus = {
        lastSync: now,
        syncInProgress: false,
        connected: syncResp.connected,
        synced: syncResp.synced ?? 0,
        pending: syncResp.pending,
        cachedRegions,
        totalCacheSize: cachedRegions.length * 2500 + layers.filter((l) => l.cached).length * 500,
        last_synchronized: syncResp.last_synchronized,
      };

      setSyncStatus(newStatus);
      await cacheSet('sync-status', newStatus);
    } catch {
      setSyncStatus({ syncInProgress: false, connected: false });
    } finally {
      setSyncing(false);
    }
  };

  const formatTime = (ts: number | null) => {
    if (!ts) return 'Never';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5">
        <Satellite className="text-accent-400" size={13} aria-hidden />
        <h3 className="section-title">Relay Synchronization</h3>
      </div>

      <div className="glass-panel p-2.5 space-y-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="data-label flex items-center gap-1">
            <Clock size={10} aria-hidden />
            Last Sync
          </span>
          <span className="data-value text-[#F1F5F9]">{formatTime(syncStatus.lastSync)}</span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="data-label">Cached Regions</span>
          <span className="data-value text-[#F1F5F9]">{syncStatus.cachedRegions.length}</span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="data-label">Cache Size</span>
          <span className="data-value text-[#F1F5F9]">
            {(syncStatus.totalCacheSize / 1024).toFixed(1)} KB
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="data-label">Relay Pending</span>
          <span className="data-value text-[#F1F5F9]">{syncStatus.pending ?? 0}</span>
        </div>
      </div>

      <button
        onClick={handleSync}
        disabled={syncing || connectionState === 'offline'}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-accent-500/10 border border-accent-500/20 text-accent-300 text-xs hover:bg-accent-500/20 transition-colors disabled:opacity-40"
        aria-label="Synchronize cached data"
      >
        {syncing || syncStatus.syncInProgress ? (
          <>
            <RefreshCw className="animate-spin" size={14} aria-hidden />
            Synchronizing...
          </>
        ) : (
          <>
            <Download size={14} aria-hidden />
            Sync Now
          </>
        )}
      </button>

      <p className="text-[9px] text-[#8D9CAF] leading-relaxed">
        SIMULATED relay connection — no actual Mars communication link exists.{' '}
        <span className="text-accent-400">Backend endpoint:</span> POST /api/v1/sync/status
      </p>
    </div>
  );
}
