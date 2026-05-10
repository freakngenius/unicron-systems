// DecayHeatmap.tsx — Sprint 7 Stream C Task 4
// Signal decay heatmap backed by ns_decay_heatmap + ns_get_signals_by_topic RPCs.
// Verified signals columns: topic, signal_count, avg_strength (double precision),
//   last_touched (timestamptz), stalest_ttl_days (int).

import { useEffect, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TopicRow {
  topic:            string;
  signal_count:     number;
  avg_strength:     number;
  last_touched:     string | null;
  stalest_ttl_days: number | null;
}

interface SignalRow {
  id:           string;
  signal_type:  string;
  content:      string;
  strength:     number;
  ttl_days:     number;
  last_touched: string | null;
  created_at:   string;
  status:       string;
}

type ArchiveState = 'idle' | 'confirming' | 'checking' | 'done' | 'blocked' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a CSS background color based on avg_strength (0→1). */
function clusterBg(strength: number, stalestTtl: number | null): string {
  // TTL-adjusted decay: very low TTL jobs that haven't been touched decay faster
  const s = Math.max(0, Math.min(1, strength));
  const ttlFactor = stalestTtl !== null && stalestTtl < 7 ? 0.7 : 1;
  const adjusted  = s * ttlFactor;

  if (adjusted >= 0.75) return 'rgba(21,128,61,0.55)';   // green — strong/fresh
  if (adjusted >= 0.50) return 'rgba(21,128,61,0.28)';   // dim green — warm
  if (adjusted >= 0.30) return 'rgba(161,98,7,0.45)';    // amber — aging
  if (adjusted >= 0.15) return 'rgba(185,28,28,0.35)';   // red — stale
  return 'rgba(63,63,70,0.45)';                           // gray — critical/dormant
}

function clusterTextClass(strength: number): string {
  if (strength >= 0.6) return 'text-zinc-100';
  if (strength >= 0.35) return 'text-zinc-300';
  return 'text-zinc-600';
}

function fmtDate(ts: string | null): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return ts;
  }
}

function fmtRelative(ts: string | null): string {
  if (!ts) return '—';
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days < 1)  return 'today';
    if (days === 1) return '1 day ago';
    if (days < 7)  return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 week ago' : `${weeks}w ago`;
  } catch {
    return ts;
  }
}

// ─── Signal Modal ─────────────────────────────────────────────────────────────

function SignalModal({
  topic,
  signals,
  loading,
  archiveState,
  onArchive,
  onClose,
}: {
  topic:         string;
  signals:       SignalRow[];
  loading:       boolean;
  archiveState:  ArchiveState;
  onArchive:     (topic: string) => void;
  onClose:       () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="relative flex flex-col rounded-xl overflow-hidden"
        style={{
          width: 'min(640px, 95vw)',
          maxHeight: '80vh',
          background: '#141416',
          border: '1px solid rgba(229,229,231,0.1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(229,229,231,0.08)]">
          <div>
            <div className="mono text-[14px] font-semibold text-text-primary">{topic}</div>
            <div className="mono text-[11px] text-text-secondary mt-0.5">
              {loading ? 'Loading signals…' : `${signals.length} active signal${signals.length !== 1 ? 's' : ''}`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Archive cluster button */}
            <button
              onClick={() => onArchive(topic)}
              disabled={archiveState !== 'idle' && archiveState !== 'confirming'}
              className="mono text-[11.5px] px-2.5 py-1 rounded-md border transition-all"
              style={{
                border:     `1px solid ${archiveState === 'blocked' ? '#ef4444' : archiveState === 'done' ? '#22c55e' : 'rgba(229,229,231,0.15)'}`,
                color:      archiveState === 'blocked' ? '#ef4444' : archiveState === 'done' ? '#22c55e' : 'rgba(229,229,231,0.6)',
                background: archiveState === 'blocked' ? 'rgba(239,68,68,0.08)' : archiveState === 'done' ? 'rgba(34,197,94,0.08)' : 'transparent',
              }}
            >
              {archiveState === 'idle'       && 'Archive cluster'}
              {archiveState === 'confirming' && 'Confirm archive?'}
              {archiveState === 'checking'   && 'Checking taboo…'}
              {archiveState === 'done'       && 'Archived'}
              {archiveState === 'blocked'    && 'Blocked by Taboo'}
              {archiveState === 'error'      && 'Error — retry?'}
            </button>
            <button
              onClick={onClose}
              className="mono text-[11px] text-text-secondary px-2.5 py-1 rounded-md border border-[rgba(229,229,231,0.12)] hover:border-[rgba(229,229,231,0.25)] transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        {/* Signal list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-5 space-y-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-16 bg-bg-raised rounded-lg animate-pulse" />
              ))}
            </div>
          ) : signals.length === 0 ? (
            <div className="p-8 text-center mono text-[11.5px] text-text-secondary">
              No active signals for this topic.
            </div>
          ) : (
            <div className="divide-y divide-[rgba(229,229,231,0.06)]">
              {signals.map(s => (
                <div key={s.id} className="px-5 py-4">
                  <div className="flex items-baseline gap-2 flex-wrap mb-1">
                    <span className="mono text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded bg-bg-raised text-text-secondary">
                      {s.signal_type}
                    </span>
                    <span className="mono text-[13px] text-text-primary">{s.content}</span>
                  </div>
                  <div className="flex gap-4 mono text-[11px] text-text-secondary flex-wrap">
                    <span>strength {s.strength.toFixed(2)}</span>
                    <span>ttl {s.ttl_days}d</span>
                    <span>last touched {fmtRelative(s.last_touched)}</span>
                    <span>created {fmtDate(s.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DecayHeatmap() {
  const [topics,      setTopics]      = useState<TopicRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [modal,       setModal]       = useState<{ topic: string } | null>(null);
  const [signals,     setSignals]     = useState<SignalRow[]>([]);
  const [sigLoading,  setSigLoading]  = useState(false);
  const [archiveState, setArchiveState] = useState<ArchiveState>('idle');

  useEffect(() => {
    fetch('/api/atrium/decay-heatmap')
      .then(r => r.json() as Promise<{ ok: boolean; topics?: TopicRow[]; error?: string }>)
      .then(json => {
        if (json.ok) setTopics(json.topics ?? []);
        else setError(json.error ?? 'Failed to load');
      })
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const openTopic = async (topic: string) => {
    setModal({ topic });
    setSignals([]);
    setSigLoading(true);
    setArchiveState('idle');

    try {
      const resp = await fetch(`/api/atrium/decay-heatmap?topic=${encodeURIComponent(topic)}`);
      const json = await resp.json() as { ok: boolean; signals?: SignalRow[]; error?: string };
      if (json.ok) setSignals(json.signals ?? []);
    } finally {
      setSigLoading(false);
    }
  };

  const handleArchive = async (topic: string) => {
    if (archiveState === 'idle') {
      // First click — confirmation
      setArchiveState('confirming');
      setTimeout(() => {
        setArchiveState(s => s === 'confirming' ? 'idle' : s);
      }, 3000);
      return;
    }

    if (archiveState === 'confirming') {
      setArchiveState('checking');
      try {
        const resp = await fetch('/api/atrium/decay-heatmap', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ topic, triggered_by: 'operator' }),
        });
        const json = await resp.json() as { ok: boolean; blocked?: boolean; error?: string };

        if (json.blocked) {
          setArchiveState('blocked');
        } else if (json.ok) {
          setArchiveState('done');
          // Remove from heatmap
          setTopics(prev => prev.filter(t => t.topic !== topic));
          setTimeout(() => setModal(null), 1200);
        } else {
          setArchiveState('error');
        }
      } catch {
        setArchiveState('error');
      }
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {modal && (
        <SignalModal
          topic={modal.topic}
          signals={signals}
          loading={sigLoading}
          archiveState={archiveState}
          onArchive={handleArchive}
          onClose={() => { setModal(null); setArchiveState('idle'); }}
        />
      )}

      <div className="bg-bg-card border border-border-default rounded-xl p-6">
        <div className="mb-5">
          <div className="mono text-[15px] font-semibold text-text-primary">Signal decay heatmap</div>
          <div className="mono text-[11.5px] text-text-secondary mt-0.5">
            Topic clusters by avg strength · click to inspect · archive to retire
          </div>
        </div>

        {loading && (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-24 bg-bg-raised rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="mono text-[11.5px] text-red-400 p-4 bg-red-900/10 rounded-lg">
            Error loading heatmap: {error}
          </div>
        )}

        {!loading && !error && topics.length === 0 && (
          <div className="text-center py-12">
            <div className="mono text-[14px] text-text-secondary">No active signal topics</div>
            <div className="mono text-[11px] text-text-secondary mt-1.5 opacity-60">
              Signals will appear here as agents log knowledge to the nervous system.
            </div>
          </div>
        )}

        {!loading && !error && topics.length > 0 && (
          <>
            {/* Grid of topic clusters */}
            <div
              className="grid gap-3 mb-6"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
            >
              {topics.map(t => {
                const strength = t.avg_strength ?? 0;
                const bg       = clusterBg(strength, t.stalest_ttl_days);
                const textCls  = clusterTextClass(strength);

                return (
                  <button
                    key={t.topic}
                    onClick={() => openTopic(t.topic)}
                    className={`text-left p-4 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] ${textCls}`}
                    style={{ background: bg, border: '1px solid rgba(229,229,231,0.06)' }}
                  >
                    <div className="mono font-semibold text-[13px] leading-tight mb-2 truncate">
                      {t.topic}
                    </div>
                    <div className="mono text-[10.5px] opacity-80 space-y-0.5">
                      <div>strength {strength.toFixed(2)}</div>
                      <div>{t.signal_count} signal{t.signal_count !== 1 ? 's' : ''}</div>
                      <div>last {fmtRelative(t.last_touched)}</div>
                      {t.stalest_ttl_days !== null && (
                        <div>min ttl {t.stalest_ttl_days}d</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-5 flex-wrap">
              <span className="mono text-[10px] text-text-secondary">Strength:</span>
              {[
                { label: 'Strong',  bg: 'rgba(21,128,61,0.55)'  },
                { label: 'Warm',    bg: 'rgba(21,128,61,0.28)'  },
                { label: 'Aging',   bg: 'rgba(161,98,7,0.45)'   },
                { label: 'Stale',   bg: 'rgba(185,28,28,0.35)'  },
                { label: 'Dormant', bg: 'rgba(63,63,70,0.45)'   },
              ].map(({ label, bg }) => (
                <span key={label} className="flex items-center gap-1.5 mono text-[10.5px] text-text-secondary">
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: bg, display: 'inline-block', border: '1px solid rgba(229,229,231,0.08)' }} />
                  {label}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
