import { useState, useRef, useEffect } from 'react';
import { Bot, Send, AlertCircle, ExternalLink, Info } from 'lucide-react';
import { useMissionStore } from '@/store/mission-store';
import { apiClient } from '@/lib/api-client';
import type { AssistantMessage, AssistantProviderStatus } from '@/types';

function defaultProviderStatus(): AssistantProviderStatus {
  return {
    provider: 'none',
    providerLabel: 'AI Provider Unavailable',
    providerMode: 'none',
    model: null,
    available: false,
    configured: false,
    reason: 'Checking provider status',
  };
}

export function MissionAssistant() {
  const messages = useMissionStore((s) => s.assistantMessages);
  const addMessage = useMissionStore((s) => s.addAssistantMessage);
  const loading = useMissionStore((s) => s.assistantLoading);
  const setLoading = useMissionStore((s) => s.setAssistantLoading);
  const selectedRegion = useMissionStore((s) => s.selectedRegion);
  const selectedTarget = useMissionStore((s) => s.selectedTarget);
  const layers = useMissionStore((s) => s.layers);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState('');
  const [providerStatus, setProviderStatus] = useState<AssistantProviderStatus | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    let cancelled = false;
    apiClient.getAssistantProviderStatus().then((status) => {
      if (!cancelled) {
        setProviderStatus(status);
      }
    }).catch(() => {
      if (!cancelled) setProviderStatus(defaultProviderStatus());
    });
    return () => { cancelled = true; };
  }, []);

  const sendQuery = async (query: string) => {
    if (!query.trim() || loading) return;

    const userMsg: AssistantMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: Date.now(),
    };
    addMessage(userMsg);
    setInput('');
    setLoading(true);

    try {
      const response = await apiClient.queryAssistant({
        query,
        regionId: selectedRegion?.id,
        targetId: selectedTarget?.id,
        activeLayers: layers.filter((l) => l.visible).map((l) => l.id),
      });
      addMessage(response);
      if (response.provider !== 'mock') {
        setProviderStatus((prev) => ({
          provider: (response.provider as AssistantProviderStatus['provider']) || prev?.provider || 'none',
          providerLabel: response.providerLabel || prev?.providerLabel || 'AI Provider Unavailable',
          providerMode: (response.providerMode as AssistantProviderStatus['providerMode']) || prev?.providerMode || 'none',
          model: response.model ?? prev?.model ?? null,
          available: response.provider !== 'none',
          configured: prev?.configured ?? true,
          reason: response.providerError ?? prev?.reason ?? null,
        }));
      }
    } catch (err) {
      addMessage({
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Assistant service unavailable. Please try again.',
        timestamp: Date.now(),
        error: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuery(input);
  };

  const uncertaintyColor = {
    low: 'text-mission-nominal bg-mission-nominal/10',
    medium: 'text-mission-caution bg-mission-caution/10',
    high: 'text-mission-critical bg-mission-critical/10',
  };

  const activeStatus = providerStatus || defaultProviderStatus();
  const statusBadgeClass = !providerStatus
    ? 'bg-[#344252]/60 text-[#8D9CAF] animate-pulse'
    : activeStatus.available
      ? 'bg-mission-nominal/20 text-mission-nominal border border-mission-nominal/30'
      : 'bg-mission-critical/20 text-mission-critical border border-mission-critical/30';
  const statusBadgeText = !providerStatus
    ? 'Checking provider…'
    : activeStatus.providerLabel;

  const quickQueries = [
    'Find interesting targets within 5 km',
    'What are the terrain hazards here?',
    'Where is subsurface ice accessible?',
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-[#344252]/40 flex items-center gap-2">
        <Bot className="text-accent-400" size={14} aria-hidden />
        <h3 className="section-title">Mission Assistant</h3>
        <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded border border-transparent font-mono uppercase ${statusBadgeClass}`}>
          {statusBadgeText}
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0" role="log" aria-live="polite">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <Bot className="text-[#344252] mx-auto" size={28} aria-hidden />
            <p className="text-xs text-[#B8C4D3] mt-2">Ask about targets, hazards, routes, or science</p>
            <div className="mt-3 space-y-1.5">
              {quickQueries.map((q) => (
                <button
                  key={q}
                  onClick={() => sendQuery(q)}
                  className="block w-full text-left px-2.5 py-1.5 rounded-md bg-[#101720] border border-[#344252]/40 text-[11px] text-[#B8C4D3] hover:text-accent-300 hover:border-accent-500/20 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 ${
                msg.role === 'user'
                  ? 'bg-accent-500/10 border border-accent-500/20'
                  : msg.error
                  ? 'bg-mission-critical/10 border border-mission-critical/20'
                  : 'bg-[#101720] border border-[#344252]/40'
              }`}
            >
              {msg.role === 'assistant' && !msg.error && (
                <div className="flex items-center gap-1.5 mb-1">
                  <Bot size={11} className="text-accent-400" aria-hidden />
                  <span className="text-[9px] text-[#8D9CAF] font-mono uppercase">Assistant</span>
                  {msg.provider === 'mock' && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-mission-caution/20 text-mission-caution border border-mission-caution/30 font-mono uppercase">
                      Mock / Demo
                    </span>
                  )}
                  {msg.provider && msg.provider !== 'mock' && msg.provider !== 'none' && msg.generation === 'model' && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-mission-nominal/15 text-mission-nominal border border-mission-nominal/30 font-mono uppercase">
                      {msg.providerLabel || 'Model'}
                    </span>
                  )}
                  {msg.generation === 'deterministic' && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-accent-500/15 text-accent-300 border border-accent-500/30 font-mono uppercase">
                      Deterministic
                    </span>
                  )}
                  {msg.generation === 'fallback' && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-mission-caution/15 text-mission-caution border border-mission-caution/30 font-mono uppercase">
                      Evidence fallback
                    </span>
                  )}
                  {msg.provider === 'none' && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-mission-critical/20 text-mission-critical border border-mission-critical/30 font-mono uppercase">
                      Provider unavailable
                    </span>
                  )}
                  {msg.uncertainty && (
                    <span className={`text-[8px] px-1 py-0.5 rounded font-mono uppercase ${uncertaintyColor[msg.uncertainty]}`}>
                      {msg.uncertainty} uncertainty
                    </span>
                  )}
                </div>
              )}
              <p className={`text-xs leading-relaxed ${msg.error ? 'text-mission-critical' : 'text-[#B8C4D3]'}`}>
                {msg.content}
              </p>
              {msg.evidence && msg.evidence.length > 0 && (
                <div className="mt-2 pt-2 border-t border-[#344252]/40">
                  <p className="text-[9px] text-[#8D9CAF] font-mono uppercase mb-1 flex items-center gap-1">
                    <Info size={9} aria-hidden /> Evidence
                  </p>
                  <ul className="space-y-0.5">
                    {msg.evidence.map((ev, i) => (
                      <li key={i} className="text-[10px] text-[#B8C4D3] flex items-start gap-1">
                        <span className="text-accent-500">›</span>
                        <span>{ev}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {msg.sources.map((src, i) => (
                    <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-[#101720] text-[#8D9CAF] font-mono">
                      {src}
                    </span>
                  ))}
                </div>
              )}
              {msg.error && (
                <div className="mt-1.5 flex items-center gap-1 text-[10px] text-mission-critical">
                  <AlertCircle size={10} aria-hidden />
                  <span>
                    {msg.provider === 'mock'
                      ? 'Backend unreachable — showing demo fallback (not live AI)'
                      : msg.provider === 'none'
                        ? (msg.providerError || 'AI provider unavailable')
                        : (msg.providerError || 'Service error — using fallback')}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start animate-fade-in" aria-label="Assistant is typing">
            <div className="bg-[#101720] border border-[#344252]/40 rounded-lg px-3 py-2.5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-accent-400 rounded-full animate-pulse" />
              <span className="w-1.5 h-1.5 bg-accent-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
              <span className="w-1.5 h-1.5 bg-accent-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-2.5 border-t border-[#344252]/40">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the mission assistant..."
            disabled={loading}
            aria-label="Ask the mission assistant"
            className="flex-1 px-3 py-2 bg-[#101720] border border-[#344252]/60 rounded-md text-xs text-[#F1F5F9] placeholder:text-[#6B7A8E] focus:outline-none focus:border-accent-500/40 transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-2 rounded-md bg-accent-500/15 border border-accent-500/30 text-accent-300 hover:bg-accent-500/25 transition-colors disabled:opacity-30"
            aria-label="Send message"
          >
            <Send size={14} aria-hidden />
          </button>
        </div>
        <p className="text-[9px] text-[#8D9CAF] mt-1.5 flex items-center gap-1">
          <ExternalLink size={9} aria-hidden />
          {!providerStatus
            ? 'Checking configured AI provider…'
            : activeStatus.provider === 'mock'
              ? 'Backend unavailable — showing demo fixtures. Not a live AI response.'
              : activeStatus.available
                ? `${activeStatus.providerLabel}${activeStatus.model ? ` (${activeStatus.model})` : ''} — deterministic answers use project evidence; model answers may be imprecise.`
                : `${activeStatus.providerLabel}${activeStatus.reason ? ` — ${activeStatus.reason}` : ''}`}
        </p>
      </form>
    </div>
  );
}
