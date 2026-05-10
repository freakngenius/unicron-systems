// PathfinderProduct.tsx — Sprint 6 Stream B
// Pathfinder sub-view inside the Atrium Products tab.
//
// Sections:
//  1. Tenant list (pathfinder.customers via service API, falls back to hardcoded Zedcor card)
//  2. Agent run health (pathfinder.agent_runs — last 24h summary per agent)
//  3. Cross-pollination signals (pathfinder.lead_cross_pollination count)
//  4. KPI panel (reads /api/atrium/vault/products/pathfinder/kpis via markdown)

import { useState, useEffect, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AgentRunSummary {
  agent_name: string;
  last_status: string;
  last_run_at: string;
  records_processed_24h: number;
  records_new_24h: number;
  run_count_24h: number;
}

interface PathfinderStats {
  total_projects: number;
  high_score_projects: number;
  cross_pollination_signals: number;
  outreach_drafts: number;
  tenants: TenantRow[];
  agent_runs: AgentRunSummary[];
}

interface TenantRow {
  id: string;
  name: string;
  monthly_value: number | null;
  customer_since: string | null;
}

// ── Design constants ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  success:     '#4FB286',
  empty_queue: '#6B7280',
  error:       '#DD6262',
  running:     '#6F95D6',
};

function statusColor(s: string) {
  return STATUS_COLORS[s] ?? '#6B7280';
}

// ── KPI Panel ─────────────────────────────────────────────────────────────────

function KpiPanel() {
  const [md, setMd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/atrium/vault/products/pathfinder/kpis')
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

  // Render as preformatted text — Stream D will author rich content.
  // We extract table lines for a lightweight display.
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
              // Skip separator rows (---|---|---)
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

// ── Fallback Tenant Card ───────────────────────────────────────────────────────

function ZedcorFallbackCard() {
  return (
    <div className="bg-bg-card border border-border-default rounded-xl px-5 py-4 flex items-center justify-between">
      <div>
        <div className="mono text-[13px] text-text-primary font-semibold">Zedcor</div>
        <div className="mono text-[10px] text-text-muted mt-0.5 uppercase tracking-[0.1em]">
          Customer-zero · Construction security · 24 branches
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-accent-orange" />
        <span className="mono text-[10px] uppercase tracking-[0.1em] text-accent-orange">Pilot</span>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function PathfinderProduct() {
  const [stats, setStats] = useState<PathfinderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [kpiOpen, setKpiOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/atrium/products/pathfinder');
      const json = (await res.json()) as PathfinderStats & { error?: string };
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

  const hasTenants = stats && stats.tenants.length > 0;
  const hasAgentRuns = stats && stats.agent_runs.length > 0;

  return (
    <div className="space-y-6">

      {/* ── Tenants ─────────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            Active Tenants
          </div>
          {stats && (
            <span className="mono text-[10px] text-text-muted">
              {stats.tenants.length} tenant{stats.tenants.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {err ? (
          <>
            <div className="bg-[#D9A23A]/10 border border-[#D9A23A]/30 rounded-xl px-4 py-3 mb-3">
              <div className="mono text-[11px] text-[#D9A23A]">
                Live data unavailable — showing stub. ({err})
              </div>
            </div>
            <ZedcorFallbackCard />
          </>
        ) : hasTenants ? (
          <div className="space-y-2">
            {stats.tenants.map((t) => (
              <div
                key={t.id}
                className="bg-bg-card border border-border-default rounded-xl px-5 py-4 flex items-center justify-between"
              >
                <div>
                  <div className="mono text-[13px] text-text-primary font-semibold">{t.name}</div>
                  {t.customer_since && (
                    <div className="mono text-[10px] text-text-muted mt-0.5">
                      Customer since {t.customer_since}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  {t.monthly_value != null && (
                    <div className="mono text-[13px] text-text-primary tabular-nums">
                      ${t.monthly_value.toLocaleString('en-US')}/mo
                    </div>
                  )}
                  <div className="flex items-center gap-2 justify-end mt-1">
                    <span className="w-2 h-2 rounded-full bg-accent-orange" />
                    <span className="mono text-[10px] uppercase tracking-[0.1em] text-accent-orange">
                      Active
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ZedcorFallbackCard />
        )}
      </section>

      {/* ── Top-line stats ───────────────────────────────────────────────────── */}
      {stats && !err && (
        <section>
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-text-muted mb-3">
            Pipeline Stats
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Leads Ingested', value: stats.total_projects.toLocaleString() },
              { label: 'High-Score (≥70)', value: stats.high_score_projects.toLocaleString() },
              { label: 'Cross-Pollination', value: stats.cross_pollination_signals.toLocaleString() },
              { label: 'Outreach Drafts', value: stats.outreach_drafts.toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label} className="bg-bg-card border border-border-default rounded-xl px-4 py-4">
                <div className="mono text-[9px] uppercase tracking-[0.16em] text-text-muted mb-1">
                  {label}
                </div>
                <div className="mono text-[22px] text-text-primary font-semibold tabular-nums leading-none">
                  {value}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Agent Run Health ─────────────────────────────────────────────────── */}
      <section>
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-text-muted mb-3">
          Agent Run Health (Last 24h)
        </div>

        {!hasAgentRuns ? (
          <div className="bg-bg-card border border-border-default rounded-xl px-5 py-6 text-center">
            <div className="mono text-[11px] text-text-muted">
              No agent runs recorded yet.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border-default">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="bg-bg-card border-b border-border-default">
                  {['Agent', 'Last Status', 'Last Run', 'Runs (24h)', 'Processed', 'New'].map((h, i) => (
                    <th
                      key={i}
                      className="px-4 py-2.5 mono text-[9px] uppercase tracking-[0.16em] text-text-muted text-left whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats!.agent_runs.map((run) => (
                  <tr key={run.agent_name} className="border-b border-border-default hover:bg-bg-raised transition-colors">
                    <td className="px-4 py-3 mono text-[12px] text-text-primary font-medium">
                      {run.agent_name}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: statusColor(run.last_status) }}
                        />
                        <span
                          className="mono text-[10px] uppercase tracking-[0.08em]"
                          style={{ color: statusColor(run.last_status) }}
                        >
                          {run.last_status.replace('_', ' ')}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 mono text-[11px] text-text-secondary">
                      {run.last_run_at
                        ? new Date(run.last_run_at).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 mono text-[12px] text-text-primary tabular-nums">
                      {run.run_count_24h}
                    </td>
                    <td className="px-4 py-3 mono text-[12px] text-text-primary tabular-nums">
                      {run.records_processed_24h.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 mono text-[12px] text-status-green tabular-nums">
                      +{run.records_new_24h.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                unicron-knowledge/wiki/products/pathfinder/kpis.md
              </span>
              <a
                href="https://github.com/freakngenius/unicron-knowledge/blob/main/wiki/products/pathfinder/kpis.md"
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
    </div>
  );
}
