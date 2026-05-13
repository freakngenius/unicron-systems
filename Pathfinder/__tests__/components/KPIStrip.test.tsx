// @vitest-environment jsdom
//
// KPIStrip — Build-Out Pass Slice 2.
// Spec: Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md.
//
// Renders one card per ui_plan.kpis entry with the data-kpi-strip /
// data-kpi-card markers the DoD smoke harness (scripts/dod-smoke.ts
// step 8) probes for. Unmapped metric_ids fall back to em-dash; mapped
// metrics will be wired in Slice 3+ (out of scope here).

import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { KPIStrip } from '@/components/KPIStrip';
import type { UIPlan } from '@/lib/types/architecture';

void React;
afterEach(cleanup);

const KPIS: UIPlan['kpis'] = [
  { label: 'Leads this week', metric_id: 'leads_weekly' },
  { label: 'Conversion', metric_id: 'conversion_rate', unit: '%', target: 25 },
  { label: 'Pipeline value', metric_id: 'pipeline_value', unit: '$', target: 100000 },
];

describe('<KPIStrip />', () => {
  it('renders a data-kpi-strip container', () => {
    const { container } = render(<KPIStrip kpis={KPIS} />);
    expect(container.querySelector('[data-kpi-strip]')).not.toBeNull();
  });

  it('renders one data-kpi-card per kpis entry', () => {
    const { container } = render(<KPIStrip kpis={KPIS} />);
    expect(container.querySelectorAll('[data-kpi-card]').length).toBe(KPIS.length);
  });

  it('renders the label for each kpi', () => {
    render(<KPIStrip kpis={KPIS} />);
    expect(screen.getByText('Leads this week')).toBeInTheDocument();
    expect(screen.getByText('Conversion')).toBeInTheDocument();
    expect(screen.getByText('Pipeline value')).toBeInTheDocument();
  });

  it('renders em-dash for unmapped metric_id (no kpiQuery registered)', () => {
    const { container } = render(<KPIStrip kpis={KPIS} />);
    const cards = container.querySelectorAll('[data-kpi-card]');
    for (const c of Array.from(cards)) {
      expect(within(c as HTMLElement).getByText('—')).toBeInTheDocument();
    }
  });

  it('renders the unit when present', () => {
    const { container } = render(<KPIStrip kpis={KPIS} />);
    const conv = container.querySelector('[data-kpi-card][data-metric-id="conversion_rate"]');
    expect(conv).not.toBeNull();
    expect(conv!.textContent).toContain('%');
  });

  it('renders the target indicator when present', () => {
    const { container } = render(<KPIStrip kpis={KPIS} />);
    const conv = container.querySelector('[data-kpi-card][data-metric-id="conversion_rate"]');
    expect(conv!.textContent).toMatch(/target/i);
    expect(conv!.textContent).toContain('25');
  });

  it('renders nothing visible (empty marker only) when kpis is empty', () => {
    const { container } = render(<KPIStrip kpis={[]} />);
    // Container marker still renders so DoD smoke step 8 can probe it.
    expect(container.querySelector('[data-kpi-strip]')).not.toBeNull();
    expect(container.querySelectorAll('[data-kpi-card]').length).toBe(0);
  });
});
