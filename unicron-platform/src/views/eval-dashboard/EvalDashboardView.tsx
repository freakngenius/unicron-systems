import { useEffect, useMemo, useState } from 'react';
import {
  binByWeekPerAgent,
  computeKpis,
  fetchEvalRuns,
  filterRuns,
  listAgentNames,
  recentFailures,
  type EvalRun,
  type TimeWindow,
} from '../../lib/evalDashboardClient';
import type { AgentName } from '../../lib/activity';
import { PassRateChart } from './PassRateChart';

const WINDOW_OPTIONS: { id: TimeWindow; label: string }[] = [
  { id: 'today', label: 'TODAY' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: 'all', label: 'ALL' },
];

export function EvalDashboardView() {
  const [runs, setRuns] = useState<EvalRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [window, setWindow] = useState<TimeWindow>('30d');
  const [selectedAgents, setSelectedAgents] = useState<AgentName[]>([]);

  useEffect(() => {
    let cancelled = false;
    setRuns(null);
    setError(null);
    fetchEvalRuns(window)
      .then((rows) => {
        if (cancelled) return;
        setRuns(rows);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [window]);

  const allAgents = useMemo(() => (runs ? listAgentNames(runs) : []), [runs]);
  const filtered = useMemo(
    () => (runs ? filterRuns(runs, window, selectedAgents.length ? selectedAgents : null) : []),
    [runs, window, selectedAgents],
  );
  const kpis = useMemo(() => computeKpis(filtered), [filtered]);
  const series = useMemo(() => binByWeekPerAgent(filtered), [filtered]);
  const failures = useMemo(() => recentFailures(filtered, 10), [filtered]);

  function toggleAgent(name: AgentName) {
    setSelectedAgents((prev) =>
      prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name],
    );
  }

  return (
    <div className="px-6 py-8" data-testid="eval-dashboard">
      <header className="flex items-baseline justify-between mb-6">
        <h1 className="mono text-[16px] tracking-wide text-text-primary">Eval Pass-Rate Dashboard</h1>
        <span className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40">
          {runs === null && error === null
            ? 'LOADING'
            : runs
              ? `${filtered.length} OF ${runs.length} RUNS`
              : 'ERROR'}
        </span>
      </header>

      <FilterBar
        window={window}
        onWindow={setWindow}
        agents={allAgents}
        selected={selectedAgents}
        onToggleAgent={toggleAgent}
        onClearAgents={() => setSelectedAgents([])}
      />

      {error ? (
        <p
          data-testid="eval-dashboard-error"
          className="mono text-[11px] uppercase tracking-[0.18em] text-rose-400"
        >
          {error}
        </p>
      ) : runs === null ? (
        <SkeletonBody />
      ) : (
        <>
          <KpiCards kpis={kpis} />
          <section className="mt-8" data-testid="eval-dashboard-chart-section">
            <h2 className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/60 mb-3">
              Pass rate over time (weekly)
            </h2>
            <PassRateChart series={series} />
          </section>
          <FailuresTable failures={failures} />
        </>
      )}
    </div>
  );
}

interface FilterBarProps {
  window: TimeWindow;
  onWindow: (w: TimeWindow) => void;
  agents: AgentName[];
  selected: AgentName[];
  onToggleAgent: (a: AgentName) => void;
  onClearAgents: () => void;
}

function FilterBar({
  window,
  onWindow,
  agents,
  selected,
  onToggleAgent,
  onClearAgents,
}: FilterBarProps) {
  return (
    <div
      data-testid="eval-dashboard-filters"
      className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6 border border-border-default rounded-md bg-bg-panel p-3"
    >
      <div className="flex items-center gap-2">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40 mr-2">
          WINDOW
        </span>
        {WINDOW_OPTIONS.map((o) => {
          const active = o.id === window;
          return (
            <button
              key={o.id}
              type="button"
              data-testid={`eval-dashboard-window-${o.id}`}
              onClick={() => onWindow(o.id)}
              className={[
                'mono text-[10px] uppercase tracking-[0.18em] px-2 py-1 rounded-md border transition-colors',
                active
                  ? 'border-accent-gold/60 text-accent-gold'
                  : 'border-border-default text-text-primary/50 hover:text-text-primary/80',
              ].join(' ')}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40 mr-2">
          AGENT
        </span>
        {agents.length === 0 ? (
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/30">
            (none in window)
          </span>
        ) : (
          agents.map((a) => {
            const active = selected.includes(a);
            return (
              <button
                key={a}
                type="button"
                data-testid={`eval-dashboard-agent-${a}`}
                onClick={() => onToggleAgent(a)}
                className={[
                  'mono text-[10px] uppercase tracking-[0.18em] px-2 py-1 rounded-md border transition-colors',
                  active
                    ? 'border-accent-gold/60 text-accent-gold'
                    : 'border-border-default text-text-primary/50 hover:text-text-primary/80',
                ].join(' ')}
              >
                {a}
              </button>
            );
          })
        )}
        {selected.length > 0 ? (
          <button
            type="button"
            onClick={onClearAgents}
            data-testid="eval-dashboard-clear-agents"
            className="mono text-[10px] uppercase tracking-[0.18em] px-2 py-1 rounded-md border border-border-default text-text-primary/40 hover:text-text-primary/70 transition-colors"
          >
            CLEAR
          </button>
        ) : null}
      </div>
    </div>
  );
}

function KpiCards({ kpis }: { kpis: ReturnType<typeof computeKpis> }) {
  const rate =
    kpis.passRate === null
      ? '—'
      : `${(kpis.passRate * 100).toFixed(1)}%`;
  return (
    <section
      className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      data-testid="eval-dashboard-kpis"
    >
      <KpiCard label="TOTAL RUNS" value={kpis.total.toLocaleString()} />
      <KpiCard label="PASSED" value={kpis.passed.toLocaleString()} tone="emerald" />
      <KpiCard label="FAILED" value={kpis.failed.toLocaleString()} tone="rose" />
      <KpiCard label="PASS RATE" value={rate} tone="gold" testId="eval-dashboard-kpi-pass-rate" />
    </section>
  );
}

function KpiCard({
  label,
  value,
  tone = 'default',
  testId,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'emerald' | 'rose' | 'gold';
  testId?: string;
}) {
  const toneClass = {
    default: 'text-text-primary',
    emerald: 'text-emerald-400',
    rose: 'text-rose-400',
    gold: 'text-accent-gold',
  }[tone];
  return (
    <div
      data-testid={testId}
      className="border border-border-default rounded-md bg-bg-panel p-4 flex flex-col gap-2"
    >
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
        {label}
      </span>
      <span className={`mono text-[24px] tracking-wide ${toneClass}`}>{value}</span>
    </div>
  );
}

function FailuresTable({ failures }: { failures: ReturnType<typeof recentFailures> }) {
  return (
    <section className="mt-8" data-testid="eval-dashboard-failures">
      <h2 className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/60 mb-3">
        Recent failures (last 10)
      </h2>
      {failures.length === 0 ? (
        <p
          data-testid="eval-dashboard-failures-empty"
          className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/30 border border-border-default border-dashed rounded-md bg-bg-panel/50 p-6 text-center"
        >
          no failures in window
        </p>
      ) : (
        <div className="border border-border-default rounded-md bg-bg-panel overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border-default">
                <th className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40 px-3 py-2">
                  TIMESTAMP
                </th>
                <th className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40 px-3 py-2">
                  AGENT
                </th>
                <th className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40 px-3 py-2">
                  ERROR
                </th>
                <th className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40 px-3 py-2">
                  RUN
                </th>
              </tr>
            </thead>
            <tbody>
              {failures.map((f) => (
                <tr
                  key={f.id}
                  data-testid="eval-dashboard-failure-row"
                  className="border-b border-border-default/50 last:border-b-0"
                >
                  <td className="mono text-[11px] text-text-primary/70 px-3 py-2 align-top whitespace-nowrap">
                    {f.startedAt.replace('T', ' ').slice(0, 19)}
                  </td>
                  <td className="mono text-[11px] text-text-primary px-3 py-2 align-top whitespace-nowrap">
                    {f.agentName}
                  </td>
                  <td className="mono text-[11px] text-rose-300/90 px-3 py-2 align-top">
                    {f.errorExcerpt}
                  </td>
                  <td className="mono text-[10px] text-text-primary/40 px-3 py-2 align-top whitespace-nowrap">
                    #{f.id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SkeletonBody() {
  return (
    <div data-testid="eval-dashboard-skeleton" className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 border border-border-default border-dashed rounded-md bg-bg-panel/50 animate-pulse"
          />
        ))}
      </div>
      <div className="h-64 border border-border-default border-dashed rounded-md bg-bg-panel/50 animate-pulse" />
      <div className="h-40 border border-border-default border-dashed rounded-md bg-bg-panel/50 animate-pulse" />
    </div>
  );
}
