// CallsLog.tsx — Sprint 4 Stream D / W-5 upgrade
// W-5: inline split-panel detail, voice badge on voice-agent calls, semantic search bar.

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LedgerRow {
  id: string;
  source_type: string;
  content_summary: string | null;
  raw_content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  customer: string | null;
}

interface ActionItemRow {
  id: string;
  title: string;
  priority: string;
  status: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isVoiceCall(row: LedgerRow): boolean {
  if (row.source_type === 'voice_memo') return true;
  if (!row.metadata) return false;
  return (
    row.metadata['channel'] === 'voice' ||
    Boolean(row.metadata['voice_agent']) ||
    row.metadata['via'] === 'voice'
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getParticipants(metadata: Record<string, unknown> | null): string {
  if (!metadata) return '—';
  const p = metadata['participants'];
  if (Array.isArray(p)) return p.join(', ');
  if (typeof p === 'string') return p;
  return '—';
}

function getDecisions(metadata: Record<string, unknown> | null): string[] {
  if (!metadata) return [];
  const d = metadata['decisions'];
  if (Array.isArray(d)) return d.map(String);
  return [];
}

function getQuotes(metadata: Record<string, unknown> | null): string[] {
  if (!metadata) return [];
  const q = metadata['quotes'];
  if (Array.isArray(q)) return q.map(String);
  return [];
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useCallsLog(searchQuery: string) {
  const [calls, setCalls] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const sb = getSupabase();

    async function load() {
      try {
        let query = sb
          .schema('nervous_system')
          .from('ledger')
          .select('id, source_type, content_summary, raw_content, metadata, created_at, customer')
          .in('source_type', ['call', 'voice_memo'])
          .order('created_at', { ascending: false })
          .limit(100);

        if (searchQuery.trim()) {
          query = query.ilike('content_summary', `%${searchQuery.trim()}%`);
        }

        const { data, error: err } = await query.returns<LedgerRow[]>();
        if (err) throw err;
        if (!cancelled) setCalls(data ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load calls');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [searchQuery]);

  return { calls, loading, error };
}

function useCallDetail(callId: string | null) {
  const [actionItems, setActionItems] = useState<ActionItemRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!callId) { setActionItems([]); return; }
    let cancelled = false;
    setLoading(true);

    getSupabase()
      .schema('nervous_system')
      .from('action_items')
      .select('id, title, priority, status')
      .eq('ledger_id', callId)
      .returns<ActionItemRow[]>()
      .then(({ data }) => {
        if (!cancelled) { setActionItems(data ?? []); setLoading(false); }
      }, () => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [callId]);

  return { actionItems, loading };
}

// ─── Semantic search with debounce ────────────────────────────────────────────

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ─── Voice badge ──────────────────────────────────────────────────────────────

function VoiceBadge() {
  return (
    <span className="inline-flex items-center gap-1 mono text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded border border-[#A855F740] bg-[#A855F710] text-[#A855F7]">
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <rect x="2.5" y="0.5" width="3" height="5" rx="1.5" fill="currentColor" />
        <path d="M1 3.5C1 5.16 2.34 6.5 4 6.5C5.66 6.5 7 5.16 7 3.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <line x1="4" y1="6.5" x2="4" y2="7.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      </svg>
      Voice
    </span>
  );
}

// ─── Inline detail panel ──────────────────────────────────────────────────────

function CallDetailPanel({ call, onClose }: { call: LedgerRow; onClose: () => void }) {
  const { actionItems, loading: aiLoading } = useCallDetail(call.id);
  const participants = getParticipants(call.metadata);
  const decisions = getDecisions(call.metadata);
  const quotes = getQuotes(call.metadata);
  const voice = isVoiceCall(call);

  return (
    <div className="flex flex-col h-full bg-[#141416] border border-[#1F1F23] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1F1F23] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {voice && <VoiceBadge />}
          <div>
            <div className="mono text-[11px] font-medium text-[#E5E5E7]">Call Detail</div>
            <div className="mono text-[9px] text-[rgba(229,229,231,0.35)]">
              {new Date(call.created_at).toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
              })}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="mono text-[10px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.4)] hover:text-[#E5E5E7] transition-colors shrink-0"
        >
          ✕
        </button>
      </div>

      <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">
        {/* Meta */}
        <div className="space-y-1.5">
          {[
            { label: 'Participants', value: participants },
            { label: 'Customer', value: call.customer ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-baseline gap-3">
              <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] w-24 shrink-0">{label}</div>
              <div className="mono text-[11px] text-[rgba(229,229,231,0.8)] min-w-0 truncate">{value}</div>
            </div>
          ))}
        </div>

        {/* Summary */}
        {call.content_summary && (
          <div>
            <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-1.5">Summary</div>
            <div className="mono text-[11px] text-[rgba(229,229,231,0.8)] leading-relaxed">{call.content_summary}</div>
          </div>
        )}

        {/* Decisions */}
        {decisions.length > 0 && (
          <div>
            <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-1.5">Decisions</div>
            <div className="space-y-1">
              {decisions.map((d, i) => (
                <div key={i} className="flex gap-2">
                  <span className="mono text-[9px] text-[rgba(229,229,231,0.3)] mt-1">·</span>
                  <span className="mono text-[11px] text-[rgba(229,229,231,0.8)] leading-relaxed">{d}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action items */}
        <div>
          <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-1.5">Action Items</div>
          {aiLoading ? (
            <div className="h-8 bg-[#1A1A1D] rounded-lg animate-pulse" />
          ) : actionItems.length === 0 ? (
            <div className="mono text-[11px] text-[rgba(229,229,231,0.35)]">None linked.</div>
          ) : (
            <div className="space-y-1.5">
              {actionItems.map((ai) => (
                <div key={ai.id} className="flex items-center justify-between gap-2 bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2">
                  <div className="mono text-[11px] text-[#E5E5E7] truncate">{ai.title}</div>
                  <span className="mono text-[9px] uppercase tracking-[0.12em] text-[rgba(229,229,231,0.4)] shrink-0">{ai.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quotes */}
        {quotes.length > 0 && (
          <div>
            <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-1.5">Quotes</div>
            <div className="space-y-2">
              {quotes.map((q, i) => (
                <blockquote key={i} className="border-l-2 border-[#FF6B2B] pl-3 mono text-[11px] text-[rgba(229,229,231,0.7)] italic leading-relaxed">
                  {q}
                </blockquote>
              ))}
            </div>
          </div>
        )}

        {/* Transcript */}
        {call.raw_content && (
          <div>
            <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-1.5">Transcript</div>
            <div className="bg-[#1A1A1D] border border-[#1F1F23] rounded-lg p-3 max-h-64 overflow-y-auto">
              <pre className="mono text-[10px] text-[rgba(229,229,231,0.7)] whitespace-pre-wrap leading-relaxed">{call.raw_content}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function CallsLog() {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [detail, setDetail] = useState<LedgerRow | null>(null);
  const { calls, loading, error } = useCallsLog(search);

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 bg-[#141416] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl px-5 py-4">
        <div className="mono text-[12px] text-[#EF4444]">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Semantic search bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 sm:flex-none sm:w-80">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgba(229,229,231,0.3)]" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2" />
            <line x1="8.5" y1="8.5" x2="11" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Semantic search calls…"
            className="w-full bg-[#141416] border border-[#1F1F23] rounded-lg pl-8 pr-3 py-2 mono text-[12px] text-[#E5E5E7] placeholder:text-[rgba(229,229,231,0.3)] focus:outline-none focus:border-[#2A2A2E]"
          />
        </div>
        {calls.length > 0 && (
          <span className="mono text-[10px] text-[rgba(229,229,231,0.35)]">{calls.length} call{calls.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {calls.length === 0 ? (
        <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-8 text-center">
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.4)] mb-1">
            {search ? 'No calls match this search.' : 'No calls logged yet'}
          </div>
          {!search && (
            <div className="mono text-[11px] text-[rgba(229,229,231,0.3)]">
              Call transcripts are ingested via the Quick Capture or voice pipeline.
            </div>
          )}
        </div>
      ) : (
        /* Split-panel layout — list + optional detail side by side */
        <div className={`flex gap-4 ${detail ? 'items-start' : ''}`}>
          {/* Call list */}
          <div className={`flex flex-col gap-2 ${detail ? 'w-72 shrink-0' : 'flex-1'}`}>
            {calls.map((call) => {
              const voice = isVoiceCall(call);
              const isSelected = detail?.id === call.id;
              return (
                <div
                  key={call.id}
                  onClick={() => setDetail(isSelected ? null : call)}
                  className="bg-[#141416] border rounded-xl px-4 py-3 hover:border-[#2A2A2E] transition-colors cursor-pointer"
                  style={{ borderColor: isSelected ? '#FF6B2B40' : '#1F1F23' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {voice && <VoiceBadge />}
                        <span className="mono text-[9px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.4)]">
                          {formatRelativeTime(call.created_at)}
                        </span>
                        {call.customer && (
                          <span className="mono text-[9px] uppercase tracking-[0.12em] text-[#FF6B2B]">
                            {call.customer}
                          </span>
                        )}
                      </div>
                      <div className={`mono text-[11px] text-[rgba(229,229,231,0.8)] leading-relaxed ${detail ? 'line-clamp-2' : 'line-clamp-2'}`}>
                        {call.content_summary
                          ? call.content_summary.slice(0, 160)
                          : call.raw_content
                          ? call.raw_content.slice(0, 160)
                          : 'No summary available.'}
                      </div>
                    </div>
                    <div className="mono text-[10px] text-[rgba(229,229,231,0.3)] shrink-0 mt-0.5">
                      {isSelected ? '▸' : '›'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detail panel */}
          {detail && (
            <div className="flex-1 min-w-0" style={{ minHeight: '400px' }}>
              <CallDetailPanel call={detail} onClose={() => setDetail(null)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
