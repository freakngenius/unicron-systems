// DecisionsTimeline.tsx — Sprint 4 Stream D
// Vertical timeline of nervous_system.ledger rows where
// source_type='elder_decision'. Gracefully degrades to empty state if no
// elder_decision rows exist yet (Elder agent writes here from Sprint 3 forward).

import { useState, useEffect } from 'react';
import { getSupabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DecisionRow {
  id: string;
  source_type: string;
  content_summary: string | null;
  metadata: {
    decision_type?: string;
    supersedes_id?: string;
    evidence_url?: string;
  } | null;
  created_at: string;
}

type DecisionType = 'tactical' | 'strategic' | 'irreversible' | 'unknown';

const DECISION_TYPE_COLORS: Record<DecisionType, string> = {
  tactical: '#3B82F6',
  strategic: '#F59E0B',
  irreversible: '#EF4444',
  unknown: 'rgba(229,229,231,0.4)',
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useDecisions(typeFilter: string) {
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const sb = getSupabase();

    async function load() {
      try {
        // PGRST106 fix: use ns_list_ledger_decisions RPC
        const { data, error: err } = await sb
          .rpc('ns_list_ledger_decisions', { p_limit: 100 });
        if (err) throw err;

        const rows = data ?? [];
        if (!cancelled) {
          setEmpty(rows.length === 0);
          const filtered =
            typeFilter && typeFilter !== 'all'
              ? rows.filter(
                  (r) =>
                    (r.metadata?.decision_type ?? 'unknown') === typeFilter,
                )
              : rows;
          setDecisions(filtered);
        }
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : 'Failed to load decisions',
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [typeFilter]);

  return { decisions, loading, error, empty };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDecisionType(row: DecisionRow): DecisionType {
  const t = row.metadata?.decision_type;
  if (t === 'tactical' || t === 'strategic' || t === 'irreversible') return t;
  return 'unknown';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function DecisionsTimeline() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const { decisions, loading, error, empty } = useDecisions(typeFilter);

  const TYPE_FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'tactical', label: 'Tactical' },
    { value: 'strategic', label: 'Strategic' },
    { value: 'irreversible', label: 'Irreversible' },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-[#1F1F23] animate-pulse" />
              <div className="w-px flex-1 bg-[#1F1F23] mt-2" />
            </div>
            <div
              className="flex-1 h-16 bg-[#141416] rounded-xl animate-pulse mb-4"
              style={{ animationDelay: `${i * 100}ms` }}
            />
          </div>
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

  if (empty) {
    return (
      <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-6 py-10 text-center">
        <div
          className="w-8 h-8 rounded-full border-2 border-[#2A2A2E] mx-auto mb-4 flex items-center justify-center"
        >
          <div className="w-2 h-2 rounded-full bg-[#2A2A2E]" />
        </div>
        <div className="mono text-[11px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.4)] mb-2">
          No decisions logged yet
        </div>
        <div className="mono text-[11px] text-[rgba(229,229,231,0.3)] max-w-xs mx-auto leading-relaxed">
          Elder agent begins writing here in Sprint 3. Decisions are created
          when the Elder processes signals and logs a decision to the ledger.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Type filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setTypeFilter(f.value)}
            className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg border transition-colors"
            style={{
              borderColor:
                typeFilter === f.value ? '#FF6B2B' : '#1F1F23',
              color:
                typeFilter === f.value
                  ? '#FF6B2B'
                  : 'rgba(229,229,231,0.45)',
              background:
                typeFilter === f.value
                  ? 'rgba(255,107,43,0.08)'
                  : 'transparent',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {decisions.length === 0 ? (
        <div className="mono text-[11px] text-[rgba(229,229,231,0.4)] text-center py-8">
          No decisions match the selected filter.
        </div>
      ) : (
        <div className="relative">
          {decisions.map((row, idx) => {
            const dtype = getDecisionType(row);
            const dotColor = DECISION_TYPE_COLORS[dtype];
            const isLast = idx === decisions.length - 1;

            return (
              <div key={row.id} className="flex gap-4">
                {/* Timeline spine */}
                <div className="flex flex-col items-center shrink-0">
                  <div
                    className="w-3 h-3 rounded-full shrink-0 mt-1"
                    style={{
                      backgroundColor: dotColor,
                      boxShadow: `0 0 6px ${dotColor}60`,
                    }}
                  />
                  {!isLast && (
                    <div className="w-px flex-1 bg-[#1F1F23] mt-1 min-h-[2rem]" />
                  )}
                </div>

                {/* Entry card */}
                <div className="flex-1 pb-6">
                  <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-4">
                    {/* Header row */}
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="mono text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded"
                          style={{
                            color: dotColor,
                            background: `${dotColor}18`,
                          }}
                        >
                          {dtype}
                        </span>
                      </div>
                      <div className="mono text-[10px] text-[rgba(229,229,231,0.4)]">
                        {formatDate(row.created_at)}
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="mono text-[12px] text-[rgba(229,229,231,0.85)] leading-relaxed">
                      {row.content_summary ?? 'No summary.'}
                    </div>

                    {/* Supersedes link */}
                    {row.metadata?.supersedes_id && (
                      <div className="mt-2 mono text-[10px] text-[rgba(229,229,231,0.4)]">
                        supersedes:{' '}
                        <span className="font-mono text-[rgba(229,229,231,0.5)]">
                          {row.metadata.supersedes_id}
                        </span>
                      </div>
                    )}

                    {/* Evidence link */}
                    {row.metadata?.evidence_url && (
                      <div className="mt-2">
                        <a
                          href={row.metadata.evidence_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mono text-[10px] text-[#FF6B2B] hover:underline"
                        >
                          Evidence link →
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
