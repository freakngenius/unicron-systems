// Cost Tracking Dashboard (Wave 3, Stream W3-G).
//
// Aggregates LLM spend across pathfinder.llm_calls and
// unicron.agent_dispatches.cost_usd. See ../lib/costClient.ts for schema
// notes and the aggregation/binning logic (covered by costClient.test.ts).

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  loadCostSummary,
  type CostBreakdown,
  type CostSummary,
  type CostWindow,
} from '../lib/costClient';

const WINDOW_OPTIONS: { id: CostWindow; label: string }[] = [
  { id: 'today', label: 'TODAY' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: 'all', label: 'ALL TIME' },
];

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#d4a574',
  openai: '#4fd1c5',
  perplexity: '#8b5cf6',
  google: '#f472b6',
  xai: '#facc15',
  unknown: '#6b7280',
};

const BAR_COLOR = '#d4a574';
const LINE_COLOR = '#8b5cf6';

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  if (Math.abs(n) >= 1000) return `$${n.toFixed(0)}`;
  if (Math.abs(n) >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function CostDashboardView() {
  const [win, setWin] = useState<CostWindow>('7d');
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadCostSummary(win)
      .then((s) => {
        if (cancelled) return;
        setSummary(s);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [win]);

  return (
    <div className="px-6 py-8" data-testid="cost-dashboard">
      <header className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="mono text-[16px] tracking-wide text-text-primary">Cost dashboard</h1>
          <p className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40 mt-1">
            LLM spend across agents · customers · models
          </p>
        </div>
        <WindowSelector value={win} onChange={setWin} />
      </header>

      {error ? (
        <p
          data-testid="cost-dashboard-error"
          className="mono text-[11px] uppercase tracking-[0.18em] text-rose-400"
        >
          {error}
        </p>
      ) : loading || !summary ? (
        <SkeletonBlocks />
      ) : (
        <DashboardBody summary={summary} />
      )}
    </div>
  );
}

function WindowSelector({
  value,
  onChange,
}: {
  value: CostWindow;
  onChange: (w: CostWindow) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Time window"
      className="flex border border-border-default rounded-md overflow-hidden"
    >
      {WINDOW_OPTIONS.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={`cost-window-${opt.id}`}
            onClick={() => onChange(opt.id)}
            className={[
              'mono text-[11px] uppercase tracking-[0.18em] px-3 py-1.5 border-l first:border-l-0 border-border-default transition-colors',
              active
                ? 'bg-bg-panel text-text-primary'
                : 'bg-transparent text-text-primary/50 hover:text-text-primary/80',
            ].join(' ')}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function DashboardBody({ summary }: { summary: CostSummary }) {
  return (
    <div className="flex flex-col gap-6" data-testid="cost-dashboard-body">
      <KpiStrip summary={summary} />
      <Card title="Spend trend (daily)" testId="cost-trend-card">
        <TrendChart summary={summary} />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Per-agent spend" testId="cost-by-agent-card">
          <BreakdownContent rows={summary.by_agent} valueLabel="USD" />
        </Card>
        <Card title="Per-customer spend" testId="cost-by-customer-card">
          <BreakdownContent rows={summary.by_customer} valueLabel="USD" />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Per-model spend" testId="cost-by-model-card">
          <BreakdownContent rows={summary.by_model} valueLabel="USD" includeTokens />
        </Card>
        <Card title="Provider mix" testId="cost-by-provider-card">
          <ProviderPie rows={summary.by_provider} />
        </Card>
      </div>
    </div>
  );
}

function KpiStrip({ summary }: { summary: CostSummary }) {
  return (
    <div
      data-testid="cost-kpis"
      className="grid grid-cols-2 lg:grid-cols-4 gap-4"
    >
      <Kpi label="Total spend" value={fmtUsd(summary.total_cost_usd)} />
      <Kpi label="LLM calls" value={summary.llm_call_count.toLocaleString()} />
      <Kpi label="Dispatches" value={summary.dispatch_count.toLocaleString()} />
      <Kpi label="Tokens" value={fmtTokens(summary.total_tokens)} />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border-default rounded-md bg-bg-panel p-4 flex flex-col gap-2">
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
        {label}
      </span>
      <span className="mono text-[20px] text-text-primary">{value}</span>
    </div>
  );
}

function Card({
  title,
  testId,
  children,
}: {
  title: string;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      className="border border-border-default rounded-md bg-bg-panel p-4 flex flex-col gap-3"
    >
      <h2 className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/60">
        {title}
      </h2>
      {children}
    </section>
  );
}

function TrendChart({ summary }: { summary: CostSummary }) {
  const data = summary.daily.map((d) => ({
    bucket: d.bucket.slice(5), // MM-DD
    cost: Number(d.cost_usd.toFixed(4)),
    calls: d.call_count,
  }));
  return (
    <div className="h-56 w-full" data-testid="cost-trend-chart">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#1f2937" strokeDasharray="2 4" />
          <XAxis dataKey="bucket" stroke="#6b7280" tick={{ fontSize: 10 }} />
          <YAxis
            stroke="#6b7280"
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => fmtUsd(Number(v))}
            width={60}
          />
          <Tooltip
            contentStyle={{
              background: '#0b0b0b',
              border: '1px solid #2a2a2a',
              fontFamily: 'monospace',
              fontSize: 11,
            }}
            formatter={(v, name) =>
              name === 'cost' ? [fmtUsd(Number(v)), 'cost'] : [String(v), String(name)]
            }
          />
          <Line
            type="monotone"
            dataKey="cost"
            stroke={LINE_COLOR}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function BreakdownContent({
  rows,
  valueLabel,
  includeTokens = false,
}: {
  rows: CostBreakdown[];
  valueLabel: string;
  includeTokens?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40 py-6 text-center">
        no spend in window
      </p>
    );
  }
  const top = rows.slice(0, 8);
  const chartData = top.map((r) => ({ key: r.key, cost: Number(r.cost_usd.toFixed(4)) }));
  return (
    <div className="flex flex-col gap-3">
      <div className="h-44 w-full">
        <ResponsiveContainer>
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 12 }}>
            <CartesianGrid stroke="#1f2937" strokeDasharray="2 4" horizontal={false} />
            <XAxis
              type="number"
              stroke="#6b7280"
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => fmtUsd(Number(v))}
            />
            <YAxis
              type="category"
              dataKey="key"
              stroke="#6b7280"
              tick={{ fontSize: 10 }}
              width={120}
            />
            <Tooltip
              contentStyle={{
                background: '#0b0b0b',
                border: '1px solid #2a2a2a',
                fontFamily: 'monospace',
                fontSize: 11,
              }}
              formatter={(v) => [fmtUsd(Number(v)), valueLabel]}
            />
            <Bar dataKey="cost" fill={BAR_COLOR} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="w-full mono text-[11px]">
        <thead>
          <tr className="text-text-primary/40 uppercase tracking-[0.18em] text-[10px]">
            <th className="text-left py-1">Key</th>
            <th className="text-right py-1">Cost</th>
            <th className="text-right py-1">Calls</th>
            {includeTokens ? <th className="text-right py-1">Tokens</th> : null}
          </tr>
        </thead>
        <tbody>
          {top.map((r) => (
            <tr key={r.key} className="border-t border-border-default/40">
              <td className="py-1 text-text-primary/80 truncate max-w-[180px]">{r.key}</td>
              <td className="py-1 text-right text-text-primary">{fmtUsd(r.cost_usd)}</td>
              <td className="py-1 text-right text-text-primary/60">{r.call_count}</td>
              {includeTokens ? (
                <td className="py-1 text-right text-text-primary/60">
                  {fmtTokens(r.total_tokens)}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProviderPie({ rows }: { rows: CostBreakdown[] }) {
  const data = useMemo(
    () => rows.map((r) => ({ key: r.key, cost: Number(r.cost_usd.toFixed(4)) })),
    [rows],
  );
  if (rows.length === 0) {
    return (
      <p className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40 py-6 text-center">
        no spend in window
      </p>
    );
  }
  const total = rows.reduce((s, r) => s + r.cost_usd, 0);
  return (
    <div className="flex flex-col gap-3" data-testid="cost-provider-pie">
      <div className="h-44 w-full">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="cost"
              nameKey="key"
              outerRadius={70}
              innerRadius={40}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={PROVIDER_COLORS[d.key] ?? PROVIDER_COLORS.unknown} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: '#0b0b0b',
                border: '1px solid #2a2a2a',
                fontFamily: 'monospace',
                fontSize: 11,
              }}
              formatter={(v, name) => [fmtUsd(Number(v)), String(name)]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid grid-cols-2 gap-2 mono text-[11px]">
        {rows.map((r) => {
          const pct = total > 0 ? (r.cost_usd / total) * 100 : 0;
          return (
            <li key={r.key} className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ background: PROVIDER_COLORS[r.key] ?? PROVIDER_COLORS.unknown }}
                aria-hidden
              />
              <span className="text-text-primary/80 truncate flex-1">{r.key}</span>
              <span className="text-text-primary/60">{pct.toFixed(0)}%</span>
              <span className="text-text-primary">{fmtUsd(r.cost_usd)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SkeletonBlocks() {
  return (
    <div className="flex flex-col gap-6" data-testid="cost-dashboard-skeleton">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 border border-border-default border-dashed rounded-md bg-bg-panel/50 animate-pulse"
          />
        ))}
      </div>
      <div className="h-56 border border-border-default border-dashed rounded-md bg-bg-panel/50 animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-72 border border-border-default border-dashed rounded-md bg-bg-panel/50 animate-pulse" />
        <div className="h-72 border border-border-default border-dashed rounded-md bg-bg-panel/50 animate-pulse" />
      </div>
    </div>
  );
}
