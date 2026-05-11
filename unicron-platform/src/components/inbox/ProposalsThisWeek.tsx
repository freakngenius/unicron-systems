// ProposalsThisWeek.tsx — Pass 3 of the Metacron → Atrium rebrand.
//
// Renders the week-to-date Architect proposals (from
// pathfinder.architect_proposals) as a featured section that anchors the
// top of the Architect Inbox tab. Sits ABOVE the existing
// listProposals()-driven proposal grid in <ArchitectInbox>.
//
// Data source: GET /api/atrium/products/metacron → `proposals_this_week`,
// `proposals_pending`, `proposals_approved_week`.
//
// Migrated from src/atrium/products/MetacronProduct.tsx (Pass 1) — see PR
// #297 + Pass 3 spec for the consolidation rationale.

import { useEffect, useState } from 'react';

interface ProposalRow {
  id: string;
  type: string;
  headline: string;
  status: string;
  confidence: number;
  created_at: string;
}

interface MetacronStats {
  proposals_this_week: ProposalRow[];
  proposals_pending: number;
  proposals_approved_week: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending:  '#D9A23A',
  approved: '#4FB286',
  rejected: '#DD6262',
};

function statusColor(s: string) {
  return STATUS_COLORS[s] ?? '#6B7280';
}

export function ProposalsThisWeek() {
  const [stats, setStats] = useState<MetacronStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/atrium/products/metacron')
      .then(async (res) => {
        const json = (await res.json()) as MetacronStats & { error?: string };
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (cancelled) return;
        setStats({
          proposals_this_week: json.proposals_this_week ?? [],
          proposals_pending: json.proposals_pending ?? 0,
          proposals_approved_week: json.proposals_approved_week ?? 0,
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mb-10" aria-label="Architect Proposals — This Week">
      <div className="flex items-center justify-between mb-3">
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
          Architect Proposals — This Week
        </div>
        {stats && (
          <div className="flex gap-3">
            <span className="mono text-[10px] text-[#D9A23A]">
              {stats.proposals_pending} pending
            </span>
            <span className="mono text-[10px] text-status-green">
              {stats.proposals_approved_week} approved
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 bg-bg-card rounded-xl animate-pulse" />
          ))}
        </div>
      ) : err ? (
        <div className="bg-[#D9A23A]/10 border border-[#D9A23A]/30 rounded-xl px-4 py-3">
          <div className="mono text-[11px] text-[#D9A23A]">
            Live data unavailable: {err}
          </div>
        </div>
      ) : !stats || stats.proposals_this_week.length === 0 ? (
        <div className="bg-bg-card border border-border-default rounded-xl px-5 py-6 text-center">
          <div className="mono text-[11px] text-text-muted">
            No proposals this week.
          </div>
        </div>
      ) : (
        <div className="space-y-2" data-testid="proposals-this-week-list">
          {stats.proposals_this_week.map((p) => {
            const color = statusColor(p.status);
            return (
              <div
                key={p.id}
                className="bg-bg-card border border-border-default rounded-xl px-4 py-3 flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="mono text-[11px] text-text-primary leading-relaxed line-clamp-2">
                    {p.headline}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="mono text-[9px] uppercase tracking-[0.1em] text-text-muted">
                      {p.type.replace('_', ' ')}
                    </span>
                    <span className="mono text-[9px] text-text-muted">
                      {new Date(p.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="mono text-[9px] text-text-muted">
                      {Math.round(p.confidence * 100)}% confidence
                    </span>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    className="mono text-[10px] uppercase tracking-[0.08em]"
                    style={{ color }}
                  >
                    {p.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
