// components/Chart.tsx
//
// Minimal SVG bar + line chart for the [slug] dashboard. Zero deps,
// renders on the server, and keeps the `data-chart` /
// `data-chart-id` / `data-chart-type` markers so the DoD smoke
// harness (scripts/dod-smoke.ts step 8) still probes them.
//
// Sized for the dashboard's two-up grid; titles are short. Empty
// series render an "—" message instead of a fake bar — the
// blueprint's "quality over volume" emphasis means showing 0 honestly
// beats showing pretend bars.

import * as React from 'react';
import type { UIPlan } from '@/lib/types/architecture';
import type { ChartSeries } from '@/lib/metrics/chartQueries';

void React;

type Chart = UIPlan['charts'][number];

const CHART_WIDTH = 480;
const CHART_HEIGHT = 160;
const PADDING_LEFT = 32;
const PADDING_RIGHT = 12;
const PADDING_TOP = 8;
const PADDING_BOTTOM = 28;
const PLOT_W = CHART_WIDTH - PADDING_LEFT - PADDING_RIGHT;
const PLOT_H = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

function niceMax(maxValue: number): number {
  if (maxValue <= 0) return 1;
  if (maxValue <= 5) return Math.ceil(maxValue);
  // Round up to nearest 5 / 10 / 25 / 50 / 100 etc.
  const magnitude = Math.pow(10, Math.floor(Math.log10(maxValue)));
  const normalized = maxValue / magnitude;
  let scale = 1;
  if (normalized <= 1) scale = 1;
  else if (normalized <= 2) scale = 2;
  else if (normalized <= 5) scale = 5;
  else scale = 10;
  return scale * magnitude;
}

function BarChart({ data }: { data: ChartSeries }) {
  if (data.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: PLOT_H + PADDING_BOTTOM, color: '#555', fontSize: '0.75rem' }}>
        No data yet.
      </div>
    );
  }
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const barGap = 6;
  const barW = Math.max(8, (PLOT_W - barGap * (data.length - 1)) / data.length);
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Bar chart"
      style={{ display: 'block' }}
    >
      {/* y-axis baseline */}
      <line
        x1={PADDING_LEFT}
        x2={CHART_WIDTH - PADDING_RIGHT}
        y1={PADDING_TOP + PLOT_H}
        y2={PADDING_TOP + PLOT_H}
        stroke="#2a2a2a"
      />
      {/* y-axis ticks: 0 and max */}
      <text x={PADDING_LEFT - 6} y={PADDING_TOP + PLOT_H} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="#666">0</text>
      <text x={PADDING_LEFT - 6} y={PADDING_TOP + 6} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="#666">{max}</text>
      {data.map((d, i) => {
        const h = (d.value / max) * PLOT_H;
        const x = PADDING_LEFT + i * (barW + barGap);
        const y = PADDING_TOP + PLOT_H - h;
        return (
          <g key={`${d.label}-${i}`}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={h}
              fill="#3b82f6"
              opacity={0.85}
              rx={2}
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
            <text
              x={x + barW / 2}
              y={PADDING_TOP + PLOT_H + 14}
              textAnchor="middle"
              fontSize="9"
              fill="#888"
            >
              {d.label.length > 14 ? `${d.label.slice(0, 12)}…` : d.label}
            </text>
            {d.value > 0 && (
              <text
                x={x + barW / 2}
                y={y - 4}
                textAnchor="middle"
                fontSize="10"
                fontWeight={600}
                fill="#cfd8e3"
              >
                {d.value}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function LineChart({ data }: { data: ChartSeries }) {
  if (data.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: PLOT_H + PADDING_BOTTOM, color: '#555', fontSize: '0.75rem' }}>
        No data yet.
      </div>
    );
  }
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const stepX = data.length > 1 ? PLOT_W / (data.length - 1) : PLOT_W;
  const points = data.map((d, i) => {
    const x = PADDING_LEFT + i * stepX;
    const y = PADDING_TOP + PLOT_H - (d.value / max) * PLOT_H;
    return { x, y, d };
  });
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Line chart"
      style={{ display: 'block' }}
    >
      <line
        x1={PADDING_LEFT}
        x2={CHART_WIDTH - PADDING_RIGHT}
        y1={PADDING_TOP + PLOT_H}
        y2={PADDING_TOP + PLOT_H}
        stroke="#2a2a2a"
      />
      <text x={PADDING_LEFT - 6} y={PADDING_TOP + PLOT_H} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="#666">0</text>
      <text x={PADDING_LEFT - 6} y={PADDING_TOP + 6} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="#666">{max}</text>
      <path d={path} fill="none" stroke="#22c55e" strokeWidth="1.75" />
      {points.map((p, i) => (
        <g key={`${p.d.label}-${i}`}>
          <circle cx={p.x} cy={p.y} r="2.75" fill="#22c55e">
            <title>{`${p.d.label}: ${p.d.value}`}</title>
          </circle>
          <text
            x={p.x}
            y={PADDING_TOP + PLOT_H + 14}
            textAnchor="middle"
            fontSize="9"
            fill="#888"
          >
            {p.d.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function FunderChart({ chart, data }: { chart: Chart; data: ChartSeries }) {
  return (
    <div
      data-chart
      data-chart-id={chart.metric_id}
      data-chart-type={chart.type}
      style={{
        background: '#111',
        border: '1px solid #222',
        borderRadius: 6,
        padding: '0.875rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
      }}
    >
      <div
        style={{
          color: '#cfd8e3',
          fontSize: '0.8rem',
          fontWeight: 600,
        }}
      >
        {chart.title}
      </div>
      <div
        style={{
          color: '#666',
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '0.25rem',
        }}
      >
        {chart.type}
        {chart.grouping ? ` · ${chart.grouping}` : ''}
      </div>
      {chart.type === 'bar' ? <BarChart data={data} /> : <LineChart data={data} />}
    </div>
  );
}

export function FunderChartGrid({
  charts,
  seriesByMetricId,
}: {
  charts: UIPlan['charts'];
  seriesByMetricId: Record<string, ChartSeries>;
}) {
  return (
    <div
      data-chart-grid
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '0.75rem',
        marginBottom: '1.5rem',
      }}
    >
      {charts.map((c) => (
        <FunderChart key={`${c.metric_id}:${c.title}`} chart={c} data={seriesByMetricId[c.metric_id] ?? []} />
      ))}
    </div>
  );
}
