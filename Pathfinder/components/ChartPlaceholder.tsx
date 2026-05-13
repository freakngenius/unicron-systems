// components/ChartPlaceholder.tsx — Build-Out Pass Slice 2.
//
// Spec: Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md.
//
// Placeholder chart renderer. Each ui_plan.charts entry becomes a
// <div data-chart data-chart-id data-chart-type> with the chart title
// visible — actual chart drawing (Recharts/D3) is out of scope for
// this slice. The data-chart markers are what step 8 of the DoD smoke
// harness (scripts/dod-smoke.ts) probes for.

import * as React from 'react';
import type { UIPlan } from '@/lib/types/architecture';

void React;

type Chart = UIPlan['charts'][number];

export type ChartPlaceholderProps = { chart: Chart };

export function ChartPlaceholder({ chart }: ChartPlaceholderProps) {
  return (
    <div
      data-chart
      data-chart-id={chart.metric_id}
      data-chart-type={chart.type}
      style={{
        background: '#111',
        border: '1px dashed #2d2d2d',
        borderRadius: 6,
        padding: '1rem',
        minHeight: 160,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <div
        style={{
          color: '#aaa',
          fontSize: '0.8rem',
          fontWeight: 600,
        }}
      >
        {chart.title}
      </div>
      <div
        style={{
          color: '#555',
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {chart.type}
        {chart.grouping ? ` · grouped by ${chart.grouping}` : ''}
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#444',
          fontSize: '0.75rem',
        }}
      >
        chart placeholder
      </div>
    </div>
  );
}

export type ChartGridProps = { charts: UIPlan['charts'] };

export function ChartGrid({ charts }: ChartGridProps) {
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
      {charts.map(c => (
        <ChartPlaceholder key={`${c.metric_id}:${c.title}`} chart={c} />
      ))}
    </div>
  );
}

export default ChartPlaceholder;
