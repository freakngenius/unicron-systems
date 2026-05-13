// @vitest-environment jsdom
//
// ChartPlaceholder — Build-Out Pass Slice 2.
// Spec: Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md.
//
// Placeholder render only — actual chart drawing (Recharts/D3) is
// out of scope for this slice. We just need the data-chart markers
// to land in the rendered HTML so the DoD smoke step 8 probe flips
// from BLOCKED to PASS.

import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ChartGrid, ChartPlaceholder } from '@/components/ChartPlaceholder';
import type { UIPlan } from '@/lib/types/architecture';

void React;
afterEach(cleanup);

const CHARTS: UIPlan['charts'] = [
  { title: 'Leads over time', type: 'line', metric_id: 'leads_daily', grouping: 'day' },
  { title: 'By source', type: 'bar', metric_id: 'leads_by_source', grouping: 'source' },
  { title: 'Asset mix', type: 'pie', metric_id: 'leads_by_asset' },
];

describe('<ChartPlaceholder /> + <ChartGrid />', () => {
  it('ChartPlaceholder renders a single data-chart element with type + id', () => {
    const { container } = render(
      <ChartPlaceholder chart={CHARTS[0]} />,
    );
    const el = container.querySelector('[data-chart]') as HTMLElement | null;
    expect(el).not.toBeNull();
    expect(el!.getAttribute('data-chart-type')).toBe('line');
    expect(el!.getAttribute('data-chart-id')).toBe('leads_daily');
  });

  it('ChartPlaceholder renders the chart title', () => {
    const { container } = render(<ChartPlaceholder chart={CHARTS[0]} />);
    expect(container.textContent).toContain('Leads over time');
  });

  it('ChartGrid renders one ChartPlaceholder per charts entry with correct types', () => {
    const { container } = render(<ChartGrid charts={CHARTS} />);
    const els = container.querySelectorAll('[data-chart]');
    expect(els.length).toBe(CHARTS.length);
    const types = Array.from(els).map(e => e.getAttribute('data-chart-type'));
    expect(types).toEqual(['line', 'bar', 'pie']);
    const ids = Array.from(els).map(e => e.getAttribute('data-chart-id'));
    expect(ids).toEqual(['leads_daily', 'leads_by_source', 'leads_by_asset']);
  });

  it('ChartGrid renders the wrapper marker even when charts is empty', () => {
    const { container } = render(<ChartGrid charts={[]} />);
    expect(container.querySelector('[data-chart-grid]')).not.toBeNull();
    expect(container.querySelectorAll('[data-chart]').length).toBe(0);
  });
});
