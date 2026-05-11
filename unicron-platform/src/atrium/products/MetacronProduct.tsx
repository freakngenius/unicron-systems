// MetacronProduct.tsx — Sprint 6 Stream B
// Metacron sub-view inside the Atrium Products tab.
//
// Pass 1 rebrand: now renders the full embedded Metacron app below a
// summary header. The preview content (Agent Fleet + Architect Proposals
// + KPI panel) stays as a top-level summary for Pass 1; Pass 3 will fold
// it into Metacron's Agents tab + Architect Inbox tab.
//
// Summary sections:
//  1. Agent fleet overview (nervous_system.agents — reuses AgentsGalaxy primitives)
//  2. Architect proposals approved this week (pathfinder.architect_proposals)
//  3. KPI panel (reads /api/atrium/vault/products/metacron/kpis via markdown)
//
// Below the summary: <MetacronEmbedded /> — the full Metacron app
// (Onboarding, Live System, Architect Inbox, Agents, Customers, Audit Log,
// Connectors, Evals, Inngest, Cost) with its outer Topbar shell stripped.

import { useState, useEffect, useCallback } from 'react';
import { MetacronEmbedded } from '../../App';

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
  orchestrator: 'var(--accent)',
  analyst:      '#6F95D6',
  elder:        '#8B7CD8',
  taboo_keeper: '#DD6262',
  specialist:   '#4FB286',
};

function archetypeColor(a: string) {
  return ARCHETYPE_COLORS[a] ?? '#6B7280';
}

const STATUS_COLORS: Record<string, string> = {
  pending:  '#D9A23A',
  approved: '#4FB286',
  rejected: '#DD6262',
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
          <div key={i} className="h-6 bg-bg-card rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (err) {
    return (
      <div className="bg-[#DD6262]/10 border border-[#DD6262]/30 rounded-xl px-4 py-3">
        <div className="mono text-[11px] text-[#DD6262]">KPI vault unavailable: {err}</div>
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
                <tr key={i} className="border-b border-border-default">
                  {cells.map((cell, j) => {
                    const Tag = isHeader ? 'th' : 'td';
                    return (
                      <Tag
                        key={j}
                        className={[
                          'px-3 py-2 mono text-left',
                          isHeader
                            ? 'text-[9px] uppercase tracking-[0.16em] text-text-muted bg-bg-card'
                            : 'text-[11px] text-text-primary',
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
        <pre className="mono text-[11px] text-text-secondary whitespace-pre-wrap leading-relaxed">
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
          <div key={i} className="h-14 bg-bg-card rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Agent Fleet ─────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            Agent Fleet
          </div>
          {stats && (
            <span className="mono text-[10px] text-text-muted">
              {stats.agents.filter((a) => a.active).length} active
            </span>
          )}
        </div>

        {err || !stats ? (
          <div className="bg-[#D9A23A]/10 border border-[#D9A23A]/30 rounded-xl px-4 py-3">
            <div className="mono text-[11px] text-[#D9A23A]">
              {err ? `Live data unavailable: ${err}` : 'No agent data.'}
            </div>
          </div>
        ) : stats.agents.length === 0 ? (
          <div className="bg-bg-card border border-border-default rounded-xl px-5 py-6 text-center">
            <div className="mono text-[11px] text-text-muted">
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
                  className="bg-bg-card border rounded-xl px-4 py-4 flex items-start gap-3"
                  style={{ borderColor: color + '33' }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                    style={{ backgroundColor: agent.active ? color : '#6B7280' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="mono text-[13px] font-semibold text-text-primary">
                      {agent.name}
                    </div>
                    <div
                      className="mono text-[9px] uppercase tracking-[0.12em] mt-0.5"
                      style={{ color }}
                    >
                      {agent.archetype.replace('_', ' ')}
                    </div>
                    {agent.specialty && (
                      <div className="mono text-[10px] text-text-muted mt-1 leading-relaxed line-clamp-2">
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

        {!stats ? (
          <div className="bg-bg-card border border-border-default rounded-xl px-5 py-6 text-center">
            <div className="mono text-[11px] text-text-muted">
              architect_proposals table not yet seeded.
            </div>
          </div>
        ) : stats.proposals_this_week.length === 0 ? (
          <div className="bg-bg-card border border-border-default rounded-xl px-5 py-6 text-center">
            <div className="mono text-[11px] text-text-muted">
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
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-text-muted group-hover:text-text-secondary transition-colors">
            KPI Targets
          </div>
          <span className="mono text-[10px] text-text-muted">
            {kpiOpen ? '▲' : '▼'}
          </span>
        </button>

        {kpiOpen && (
          <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border-default flex items-center justify-between">
              <span className="mono text-[9px] uppercase tracking-[0.18em] text-text-muted">
                unicron-knowledge/wiki/products/metacron/kpis.md
              </span>
              <a
                href="https://github.com/freakngenius/unicron-knowledge/blob/main/wiki/products/metacron/kpis.md"
                target="_blank"
                rel="noopener noreferrer"
                className="mono text-[10px] text-status-blue hover:underline"
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

      {/* ── Embedded Metacron app ────────────────────────────────────────────
          Pass 1 rebrand: full Metacron operator UI rendered here with its
          outer Topbar shell stripped. Atrium provides rail + header; this
          embed provides sub-nav + content. Pass 3 will fold the preview
          above into Metacron's Agents tab + Architect Inbox tab. */}
      <section
        className="pt-6 mt-2"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
        aria-label="Metacron app"
      >
        <div className="mb-4">
          <div
            className="mono text-[10px] uppercase tracking-[0.18em]"
            style={{ color: 'var(--text-lo)' }}
          >
            Metacron — Operator Console
          </div>
        </div>
        <MetacronEmbedded />
      </section>
    </div>
  );
}
