import { useEffect, useState, useCallback, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { MissionHeader } from '@/components/MissionHeader';
import { MarsGlobe } from '@/components/MarsGlobe';
import { LayerControlPanel } from '@/components/LayerControlPanel';
import { RegionSelector } from '@/components/RegionSelector';
import { TargetDetailsPanel } from '@/components/TargetDetailsPanel';
import { RoutePlannerPanel } from '@/components/RoutePlannerPanel';
import { MissionAssistant } from '@/components/MissionAssistant';
import { DataProvenancePanel } from '@/components/DataProvenancePanel';
import { OfflineStatusIndicator } from '@/components/OfflineStatusIndicator';
import { RelaySyncPanel } from '@/components/RelaySyncPanel';
import { MissionInfoStrip } from '@/components/MissionInfoStrip';
import { useMissionStore } from '@/store/mission-store';
import { apiClient } from '@/lib/api-client';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30000,
    },
  },
});

type RightTab = 'target' | 'route' | 'assistant';

const LEFT_MIN = 240;
const LEFT_MAX = 420;
const RIGHT_MIN = 280;
const RIGHT_MAX = 480;
const LEFT_DEFAULT = 300;
const RIGHT_DEFAULT = 340;

function Workspace() {
  const [rightTab, setRightTab] = useState<RightTab>('target');
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftWidth, setLeftWidth] = useState(LEFT_DEFAULT);
  const [rightWidth, setRightWidth] = useState(RIGHT_DEFAULT);

  const settingsOpen = useMissionStore((s) => s.settingsOpen);
  const setSettingsOpen = useMissionStore((s) => s.setSettingsOpen);
  const initFromCache = useMissionStore((s) => s.initFromCache);
  const setConnectionState = useMissionStore((s) => s.setConnectionState);
  const setSyncStatus = useMissionStore((s) => s.setSyncStatus);
  const setRegions = useMissionStore((s) => s.setRegions);
  const setLayers = useMissionStore((s) => s.setLayers);
  const setRegionsLoading = useMissionStore((s) => s.setRegionsLoading);
  const setRegionsError = useMissionStore((s) => s.setRegionsError);
  const setLayersLoading = useMissionStore((s) => s.setLayersLoading);
  const setLayersError = useMissionStore((s) => s.setLayersError);

  // Resizing state
  const resizingRef = useRef<'left' | 'right' | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  useEffect(() => {
    initFromCache();

    apiClient.checkHealth().then((health) => {
      if (health.status === 'down') {
        setConnectionState('degraded');
      }
      setSyncStatus({ lastSync: Date.now() });
    });

    (async () => {
      setRegionsLoading(true);
      try {
        const regions = await apiClient.getRegions();
        setRegions(regions);
        if (regions.length > 0 && !useMissionStore.getState().selectedRegion) {
          useMissionStore.getState().selectRegion(regions[0].id);
        }
      } catch {
        setRegionsError('Unable to load regions from backend. Using fallback fixture data.');
      } finally {
        setRegionsLoading(false);
      }
    })();

    (async () => {
      setLayersLoading(true);
      try {
        const layers = await apiClient.getLayers();
        setLayers(layers);
      } catch {
        setLayersError('Unable to load layers from backend. Using fallback fixture data.');
      } finally {
        setLayersLoading(false);
      }
    })();

    const handleOnline = () => setConnectionState('online');
    const handleOffline = () => setConnectionState('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [initFromCache, setConnectionState, setSyncStatus, setRegions, setLayers, setRegionsLoading, setRegionsError, setLayersLoading, setLayersError]);

  // Drag resize handlers
  const startResize = useCallback((side: 'left' | 'right', e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = side;
    startXRef.current = e.clientX;
    startWidthRef.current = side === 'left' ? leftWidth : rightWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [leftWidth, rightWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = e.clientX - startXRef.current;
      if (resizingRef.current === 'left') {
        const newWidth = Math.max(LEFT_MIN, Math.min(LEFT_MAX, startWidthRef.current + delta));
        setLeftWidth(newWidth);
      } else {
        const newWidth = Math.max(RIGHT_MIN, Math.min(RIGHT_MAX, startWidthRef.current - delta));
        setRightWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      if (resizingRef.current) {
        resizingRef.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const tabs: { id: RightTab; label: string }[] = [
    { id: 'target', label: 'Target' },
    { id: 'route', label: 'Route' },
    { id: 'assistant', label: 'Assistant' },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden grid-bg">
      <MissionHeader />

      <div className="flex flex-1 min-h-0 relative">
        {/* Left panel toggle (when collapsed) */}
        {!leftOpen && (
          <button
            onClick={() => setLeftOpen(true)}
            className="absolute left-2 top-3 z-30 p-1.5 glass-panel border border-[#344252]/60 text-[#B8C4D3] hover:text-accent-400 transition-all"
            title="Expand left panel"
            aria-label="Expand left panel"
          >
            <ChevronRight size={14} aria-hidden />
          </button>
        )}

        {/* Left panel */}
        {leftOpen && (
          <aside
            className="flex-shrink-0 glass-panel border-r border-[#344252]/60 rounded-none flex flex-col overflow-hidden"
            style={{ width: leftWidth }}
          >
            {/* Header: Region selector + collapse button */}
            <div className="flex items-center gap-2 p-3 border-b border-[#344252]/40 flex-shrink-0">
              <div className="flex-1 min-w-0">
                <RegionSelector />
              </div>
              <button
                onClick={() => setLeftOpen(false)}
                className="p-1 text-[#8D9CAF] hover:text-[#B8C4D3] transition-colors flex-shrink-0"
                title="Collapse left panel"
                aria-label="Collapse left panel"
              >
                <ChevronLeft size={14} aria-hidden />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <CollapsibleSection title="Data Layers" defaultOpen>
                <LayerControlPanel />
              </CollapsibleSection>

              <CollapsibleSection title="Mission Status">
                <OfflineStatusIndicator />
              </CollapsibleSection>

              <CollapsibleSection title="Relay Synchronization">
                <RelaySyncPanel />
              </CollapsibleSection>
            </div>

            {/* Resize handle */}
            <div
              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent-500/30 transition-colors z-20"
              onMouseDown={(e) => startResize('left', e)}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize left panel"
            />
          </aside>
        )}

        {/* Main viewport */}
        <main className="flex-1 relative min-w-0 min-h-0">
          <MarsGlobe />
        </main>

        {/* Right panel toggle (when collapsed) */}
        {!rightOpen && (
          <button
            onClick={() => setRightOpen(true)}
            className="absolute right-2 top-3 z-30 p-1.5 glass-panel border border-[#344252]/60 text-[#B8C4D3] hover:text-accent-400 transition-all"
            title="Expand right panel"
            aria-label="Expand right panel"
          >
            <ChevronLeft size={14} aria-hidden />
          </button>
        )}

        {/* Right panel */}
        {rightOpen && (
          <aside
            className="flex-shrink-0 glass-panel border-l border-[#344252]/60 rounded-none flex flex-col overflow-hidden"
            style={{ width: rightWidth }}
          >
            {/* Tab bar */}
            <div className="flex border-b border-[#344252]/40 flex-shrink-0" role="tablist">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setRightTab(tab.id)}
                  className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors relative ${
                    rightTab === tab.id
                      ? 'text-accent-300'
                      : 'text-[#8D9CAF] hover:text-[#B8C4D3]'
                  }`}
                  role="tab"
                  aria-selected={rightTab === tab.id}
                  aria-controls={`tabpanel-${tab.id}`}
                >
                  {tab.label}
                  {rightTab === tab.id && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-400" />
                  )}
                </button>
              ))}
              <button
                onClick={() => setRightOpen(false)}
                className="px-2 text-[#8D9CAF] hover:text-[#B8C4D3] transition-colors flex-shrink-0"
                title="Collapse right panel"
                aria-label="Collapse right panel"
              >
                <ChevronRight size={14} aria-hidden />
              </button>
            </div>

            {/* Tab content */}
            <div className="flex flex-col flex-1 overflow-y-auto min-h-0" role="tabpanel" id={`tabpanel-${rightTab}`}>
              {rightTab === 'target' && <TargetDetailsPanel />}
              {rightTab === 'route' && <RoutePlannerPanel />}
              {rightTab === 'assistant' && <MissionAssistant />}

              {/* Collapsible Data Provenance */}
              <CollapsibleSection title="Data Provenance" defaultOpen={false}>
                <DataProvenancePanel />
              </CollapsibleSection>
            </div>

            {/* Resize handle */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent-500/30 transition-colors z-20"
              onMouseDown={(e) => startResize('right', e)}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize right panel"
            />
          </aside>
        )}
      </div>

      <MissionInfoStrip />

      {/* Settings modal */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setSettingsOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
        >
          <div
            className="glass-panel-accent max-w-md w-full mx-4 p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="settings-title" className="text-sm font-semibold text-[#F1F5F9]">Mission Settings</h2>
              <button
                onClick={() => setSettingsOpen(false)}
                className="text-[#8D9CAF] hover:text-[#B8C4D3]"
                aria-label="Close settings"
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <p className="data-label mb-1">API Endpoint</p>
                <p className="text-xs text-[#B8C4D3] font-mono break-all">
                  {apiClient.baseUrl}
                </p>
              </div>
              <div>
                <p className="data-label mb-1">3D Globe</p>
                <p className="text-xs text-[#B8C4D3]">
                  Three.js rendered with MOLA texture. Not authentic NASA imagery.
                </p>
              </div>
              <div>
                <p className="data-label mb-1">Data Mode</p>
                <p className="text-xs text-[#B8C4D3]">
                  Backend API connected. Live data fetched automatically.
                </p>
              </div>
              <div className="pt-2 border-t border-[#344252]/40">
                <p className="text-[10px] text-[#8D9CAF]">
                  Mars Explorer — NASA Space Apps Challenge 2026. Scientific data from NASA PDS (MOLA MEGDR). 3D globe uses provided texture, not authentic planetary imagery.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Workspace />
    </QueryClientProvider>
  );
}