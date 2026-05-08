// CallsLog.tsx — Sprint 4 Stream D
// Chronological list of nervous_system.ledger rows where source_type='call'.
// Click → detail panel with full transcript, decisions, and action items.

import { useState, useEffect } from 'react';
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
          .select(
            'id, source_type, content_summary, raw_content, metadata, created_at, customer',
          )
          .eq('source_type', 'call')
          .order('created_at', { ascending: false })
          .limit(100);

        if (searchQuery.trim()) {
          query = query.ilike('content_summary', `%${searchQuery.trim()}%`);
        }

        const { data, error: err } = await query.returns<LedgerRow[]>();
        if (err) throw err;
        if (!cancelled) setCalls(data ?? []);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Failed to load calls');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [searchQuery]);

  return { calls, loading, error };
}

function useCallDetail(callId: string | null) {
  const [actionItems, setActionItems] = useState<ActionItemRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!callId) {
      setActionItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);

    const sb = getSupabase();
    sb.schema('nervous_system')
      .from('action_items')
      .select('id, title, priority, status')
      .eq('ledger_id', callId)
      .returns<ActionItemRow[]>()
      .then(({ data }) => {
        if (!cancelled) {
          setActionItems(data ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [callId]);

  return { actionItems, loading };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getParticipants(metadata: Record<string, unknown> | null): string {
  if (!metadata) return '—';
  const p = metadata['participants'];
  if (Array.isArray(p)) return p.join(', ');
  if (typeof p === 'string') return p;
  return '—';
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function CallDetailPanel({
  call,
  onClose,
}: {
  call: LedgerRow;
  onClose: () => void;
}) {
  const { actionItems, loading: aiLoading } = useCallDetail(call.id);
  const participants = getParticipants(call.metadata);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center sm:items-start sm:justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel — full screen on mobile, side panel on sm+ */}
      <div className="relative w-full h-full sm:max-w-lg sm:h-full bg-[#141416] sm:border-l border-[#1F1F23] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1F1F23] sticky top-0 bg-[#141416] z-10">
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.5)]">
              Call Detail
            </div>
            <div className="mono text-[9px] text-[rgba(229,229,231,0.35)] mt-0.5">
              {new Date(call.created_at).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </div>
          </div>
          <button
            onClick={onClose}
            className="mono text-[11px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.5)] hover:text-[#E5E5E7] transition-colors"
          >
            Close
          </button>
        </div>

        <div className="px-5 py-5 space-y-5 flex-1">
          {/* Meta */}
          <div className="space-y-2">
            {[
              { label: 'Participants', value: participants },
              { label: 'Customer', value: call.customer ?? '—' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-baseline gap-3">
                <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] w-24 shrink-0">
                  {label}
                </div>
                <div className="mono text-[12px] text-[rgba(229,229,231,0.8)]">
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          {call.content_summary && (
            <div>
              <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-2">
                Summary
              </div>
              <div className="mono text-[12px] text-[rgba(229,229,231,0.8)] leading-relaxed">
                {call.content_summary}
              </div>
            </div>
          )}

          {/* Full transcript */}
          {call.raw_content && (
            <div>
              <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-2">
                Transcript
              </div>
              <div className="bg-[#1A1A1D] border border-[#1F1F23] rounded-lg p-4 max-h-72 overflow-y-auto">
                <pre className="mono text-[11px] text-[rgba(229,229,231,0.75)] whitespace-pre-wrap leading-relaxed">
                  {call.raw_content}
                </pre>
              </div>
            </div>
          )}

          {/* Action items created from this call */}
          <div>
            <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-2">
              Action Items from this call
            </div>
            {aiLoading ? (
              <div className="h-8 bg-[#1A1A1D] rounded-lg animate-pulse" />
            ) : actionItems.length === 0 ? (
              <div className="mono text-[11px] text-[rgba(229,229,231,0.4)]">
                None linked.
              </div>
            ) : (
              <div className="space-y-1.5">
                {actionItems.map((ai) => (
                  <div
                    key={ai.id}
                    className="flex items-center justify-between gap-3 bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2"
                  >
                    <div className="mono text-[11px] text-[#E5E5E7] truncate">
                      {ai.title}
                    </div>
                    <span className="mono text-[9px] uppercase tracking-[0.12em] text-[rgba(229,229,231,0.5)] shrink-0">
                      {ai.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function CallsLog() {
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<LedgerRow | null>(null);
  const { calls, loading, error } = useCallsLog(search);

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-20 bg-[#141416] rounded-xl animate-pulse"
          />
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
    <div>
      {/* Search */}
      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search call summaries…"
          className="w-full sm:w-72 bg-[#141416] border border-[#1F1F23] rounded-lg px-3 py-2 mono text-[12px] text-[#E5E5E7] placeholder:text-[rgba(229,229,231,0.3)] focus:outline-none focus:border-[#2A2A2E]"
        />
      </div>

      {calls.length === 0 ? (
        <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-8 text-center">
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.4)] mb-1">
            No calls logged yet
          </div>
          <div className="mono text-[11px] text-[rgba(229,229,231,0.3)]">
            Call transcripts are ingested via the Quick Capture or voice
            pipeline.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {calls.map((call) => (
            <div
              key={call.id}
              className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-4 hover:border-[#2A2A2E] transition-colors cursor-pointer"
              onClick={() => setDetail(call)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="mono text-[9px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.4)]">
                      {formatRelativeTime(call.created_at)}
                    </span>
                    {call.customer && (
                      <span className="mono text-[9px] uppercase tracking-[0.12em] text-[#FF6B2B]">
                        {call.customer}
                      </span>
                    )}
                    {call.metadata && getParticipants(call.metadata) !== '—' && (
                      <span className="mono text-[9px] text-[rgba(229,229,231,0.4)]">
                        {getParticipants(call.metadata)}
                      </span>
                    )}
                  </div>
                  <div className="mono text-[12px] text-[rgba(229,229,231,0.8)] line-clamp-2 leading-relaxed">
                    {call.content_summary
                      ? call.content_summary.slice(0, 200)
                      : call.raw_content
                      ? call.raw_content.slice(0, 200)
                      : 'No summary available.'}
                  </div>
                </div>
                <div className="mono text-[10px] uppercase tracking-[0.12em] text-[rgba(229,229,231,0.4)] shrink-0 mt-1">
                  View →
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <CallDetailPanel call={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}
