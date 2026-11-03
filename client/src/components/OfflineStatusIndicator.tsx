import { Wifi, WifiOff, AlertTriangle, Database, CheckCircle2 } from 'lucide-react';
import { useMissionStore } from '@/store/mission-store';

export function OfflineStatusIndicator() {
  const connectionState = useMissionStore((s) => s.connectionState);
  const syncStatus = useMissionStore((s) => s.syncStatus);

  const config = {
    online: {
      icon: Wifi,
      color: 'text-mission-nominal',
      bg: 'bg-mission-nominal/10 border-mission-nominal/20',
      label: 'All Systems Operational',
    },
    degraded: {
      icon: AlertTriangle,
      color: 'text-mission-caution',
      bg: 'bg-mission-caution/10 border-mission-caution/20',
      label: 'Degraded — Using Fixture Data',
    },
    offline: {
      icon: WifiOff,
      color: 'text-mission-critical',
      bg: 'bg-mission-critical/10 border-mission-critical/20',
      label: 'Offline — Cached Data Only',
    },
  };

  const { icon: Icon, color, bg, label } = config[connectionState];

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-md border ${bg}`} role="status" aria-live="polite">
      <Icon className={color} size={14} aria-hidden />
      <div className="flex-1 min-w-0">
        <p className={`text-xs ${color}`}>{label}</p>
        {connectionState !== 'online' && (
          <p className="text-[10px] text-[#B8C4D3] mt-0.5 flex items-center gap-1">
            <Database size={9} aria-hidden />
            {syncStatus.cachedRegions.length} region(s) cached
            {syncStatus.lastSync && (
              <span className="ml-1">· Last sync: {new Date(syncStatus.lastSync).toLocaleTimeString()}</span>
            )}
          </p>
        )}
      </div>
      {connectionState === 'online' && (
        <CheckCircle2 className="text-mission-nominal/60" size={14} aria-hidden />
      )}
    </div>
  );
}
