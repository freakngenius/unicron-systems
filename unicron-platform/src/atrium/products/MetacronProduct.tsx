// MetacronProduct.tsx — Sprint 6 Stream B
// Metacron sub-view inside the Atrium Products tab.
//
// Sections:
//  1. Agent fleet overview (nervous_system.agents — reuses AgentsGalaxy primitives)
//  2. Architect proposals approved this week (pathfinder.architect_proposals)
//  3. KPI panel (reads /api/atrium/vault/products/metacron/kpis via markdown)

import { useState, useEffect, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AgentRow {
  id: string;
  name: string;
  archetype: string;
  specialty: string | null;
  active: boolean;
}

interface ProposalRow {
  id: string;
  type: string;
  headline: string;
  status: string;
  confidence: number;
  created_at: string;
}

interface MetacronStats {
  agents: AgentRow[];
  proposals_this_week: ProposalRow[];
  proposals_pending: number;
  proposals_approved_week: number;
}

// ── Design constants ───────────────────────────────────────────────────────────

const ARCHETYPE_COLORS: Record<string, string> = {
  orchestrator: '#FF6B2B',
  analyst:      '#3B82F6',
  elder:        '#A855F7',
  taboo_keeper: '#EF4444',
  specialist:   '#22C55E',
};

function archetypeColor(a: string) {
  return ARCHETYPE_COLORS[a] ?? '#6B7280';
}

const STATUS_COLORS: Record<string, string> = {
  pending:  '#F59E0B',
  approved: '#22C55E',
  rejected: '#EF4444',
};

function proposalStatusColor(s: string) {
  return STATUS_COLORS[s] ?? '#6B7280';
}

// ── KPI Panel ─────────────────────────────────────────────────────────────────

function KpiPanel() {
  const [md, setMd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/atrium/vault/products/metacron/kpis')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        setMd(text);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-6 bg-[#141416] rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (err) {
    return (
      <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl px-4 py-3">
        <div className="mono text-[11px] text-[#EF4444]">KPI vault unavailable: {err}</div>
      </div>
    );
  }

  const lines = (md ?? '').split('\n');
  const tableLines = lines.filter((l) => l.startsWith('|'));

  return (
    <div className="overflow-x-auto">
      {tableLines.length > 0 ? (
        <table className="w-full min-w-[500px] border-collapse">
          <tbody>
            {tableLines.map((line, i) => {
              const cells = line
                .split('|')
                .slice(1, -1)
                .map((c) => c.trim());
              if (cells.every((c) => /^:?-+:?$/.test(c))) return null;
              const prevLine = i > 0 ? tableLines[i - 1] : undefined;
              const prevIsSeparator = prevLine != null &&
                prevLine.split('|').slice(1, -1).every((c) => /^:?-+:?$/.test(c.trim()));
              const isHeader = i === 0 || prevIsSeparator;
              return (
                <tr key={i} className="border-b border-[#1F1F23]">
                  {cells.map((cell, j) => {
                    const Tag = isHeader ? 'th' : 'td';
                    return (
                      <Tag
                        key={j}
                        className={[
                          'px-3 py-2 mono text-left',
                          isHeader
                            ? 'text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] bg-[#141416]'
                            : 'text-[11px] text-[#E5E5E7]',
                        ].join(' ')}
                      >
                        {cell}
                      </Tag>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <pre className="mono text-[11px] text-[rgba(229,229,231,0.6)] whitespace-pre-wrap leading-relaxed">
          {md}
        </pre>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function MetacronProduct() {
  const [stats, setStats] = useState<MetacronStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [kpiOpen, setKpiOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/atrium/products/metacron');
      const json = (await res.json()) as MetacronStats & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setStats(json);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-[#141416] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Agent Fleet ─────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.4)]">
            Agent Fleet
          </div>
          {stats && (
            <span className="mono text-[10px] text-[rgba(229,229,231,0.3)]">
              {stats.agents.filter((a) => a.active).length} active
            </span>
          )}
        </div>

        {err || !stats ? (
          <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl px-4 py-3">
            <div className="mono text-[11px] text-[#F59E0B]">
              {err ? `Live data unavailable: ${err}` : 'No agent data.'}
            </div>
          </div>
        ) : stats.agents.length === 0 ? (
          <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-6 text-center">
            <div className="mono text-[11px] text-[rgba(229,229,231,0.3)]">
              No agents found in nervous_system.agents.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {stats.agents.map((agent) => {
              const color = archetypeColor(agent.archetype);
              return (
                <div
                  key={agent.id}
                  className="bg-[#141416] border rounded-xl px-4 py-4 flex items-start gap-3"
                  style={{ borderColor: color + '33' }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                    style={{ backgroundColor: agent.active ? color : '#6B7280' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="mono text-[13px] font-semibold text-[#E5E5E7]">
                      {agent.name}
                    </div>
                    <div
                      className="mono text-[9px] uppercase tracking-[0.12em] mt-0.5"
                      style={{ color }}
                    >
                      {agent.archetype.replace('_', ' ')}
                    </div>
                    {agent.specialty && (
                      <div className="mono text-[10px] text-[rgba(229,229,231,0.4)] mt-1 leading-relaxed line-clamp-2">
                        {agent.specialty}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    <span
                      className="mono text-[9px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full"
                      style={{
                        background: (agent.active ? color : '#6B7280') + '22',
                        color: agent.active ? color : '#6B7280',
                      }}
                    >
                      {agent.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Architect Proposals ──────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.4)]">
            Architect Proposals — This Week
          </div>
          {stats && (
            <div className="flex gap-3">
              <span className="mono text-[10px] text-[#F59E0B]">
                {stats.proposals_pending} pending
              </span>
              <span className="mono text-[10px] text-[#22C55E]">
                {stats.proposals_approved_week} approved
              </span>
            </div>
          )}
        </div>

        {!stats ? (
          <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-6 text-center">
            <div className="mono text-[11px] text-[rgba(229,229,231,0.3)]">
              architect_proposals table not yet seeded.
            </div>
          </div>
        ) : stats.proposals_this_week.length === 0 ? (
          <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-6 text-center">
            <div className="mono text-[11px] text-[rgba(229,229,231,0.3)]">
              No proposals this week.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {stats.proposals_this_week.map((p) => {
              const statusColor = proposalStatusColor(p.status);
              return (
                <div
                  key={p.id}
                  className="bg-[#141416] border border-[#1F1F23] rounded-xl px-4 py-3 flex items-start justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="mono text-[11px] text-[#E5E5E7] leading-relaxed line-clamp-2">
                      {p.headline}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="mono text-[9px] uppercase tracking-[0.1em] text-[rgba(229,229,231,0.35)]">
                        {p.type.replace('_', ' ')}
                      </span>
                      <span className="mono text-[9px] text-[rgba(229,229,231,0.3)]">
                        {new Date(p.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                      <span className="mono text-[9px] text-[rgba(229,229,231,0.3)]">
                        {Math.round(p.confidence * 100)}% confidence
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: statusColor }}
                    />
                    <span
                      className="mono text-[10px] uppercase tracking-[0.08em]"
                      style={{ color: statusColor }}
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

      {/* ── KPI Panel (collapsible) ──────────────────────────────────────────── */}
      <section>
        <button
          onClick={() => setKpiOpen((o) => !o)}
          className="flex items-center gap-2 mb-3 group"
        >
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.4)] group-hover:text-[rgba(229,229,231,0.7)] transition-colors">
            KPI Targets
          </div>
          <span className="mono text-[10px] text-[rgba(229,229,231,0.3)]">
            {kpiOpen ? '▲' : '▼'}
          </span>
        </button>

        {kpiOpen && (
          <div className="bg-[#141416] border border-[#1F1F23] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1F1F23] flex items-center justify-between">
              <span className="mono text-[9px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.35)]">
                unicron-knowledge/wiki/products/metacron/kpis.md
              </span>
              <a
                href="https://github.com/freakngenius/unicron-knowledge/blob/main/wiki/products/metacron/kpis.md"
                target="_blank"
                rel="noopener noreferrer"
                className="mono text-[10px] text-[#3B82F6] hover:underline"
              >
                Edit ↗
              </a>
            </div>
            <div className="px-4 py-4">
              <KpiPanel />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
