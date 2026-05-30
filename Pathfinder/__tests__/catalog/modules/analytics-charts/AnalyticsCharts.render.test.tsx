// @vitest-environment jsdom
//
// __tests__/catalog/modules/analytics-charts/AnalyticsCharts.render.test.tsx
//
// Demoted-secondary charts below the feed. Soft-gated on the underlying
// aggregate queries: an empty series renders the designed EmptyState,
// never a broken chart. Categories and dates are humanized; raw schema
// keys never leak.

import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { AnalyticsChartsView } from '@/lib/catalog/modules/analytics-charts/AnalyticsCharts';
import type { LeadUnitSchema } from '@/lib/catalog/modules/ranked-feed/labels';

afterEach(() => cleanup());

const internalSchema: LeadUnitSchema = {
  service_category: {
    type: 'enum',
    display_label: 'Service category',
    enum_values: ['equipment-rental', 'temp-fence', 'crane-rental'],
  },
};

describe('AnalyticsChartsView', () => {
  it('renders both chart sections when both have data', () => {
    render(
      <AnalyticsChartsView
        byCategory={[{ slug: 'equipment-rental', count: 5 }]}
        byDay={[
          { date: '2026-05-14', count: 0 },
          { date: '2026-05-15', count: 2 },
        ]}
        schema={internalSchema}
      />,
    );
    expect(screen.getByTestId('analytics-bar')).toBeInTheDocument();
    expect(screen.getByTestId('analytics-line')).toBeInTheDocument();
  });

  it('renders the designed empty state for the bar chart when category data is empty', () => {
    render(
      <AnalyticsChartsView
        byCategory={[]}
        byDay={[{ date: '2026-05-15', count: 2 }]}
        schema={internalSchema}
      />,
    );
    expect(screen.queryByTestId('analytics-bar')).not.toBeInTheDocument();
    expect(screen.getByTestId('analytics-bar-empty')).toBeInTheDocument();
  });

  it('renders the designed empty state for the line chart when day data is all zero', () => {
    render(
      <AnalyticsChartsView
        byCategory={[{ slug: 'equipment-rental', count: 1 }]}
        byDay={[
          { date: '2026-05-14', count: 0 },
          { date: '2026-05-15', count: 0 },
        ]}
        schema={internalSchema}
      />,
    );
    expect(screen.queryByTestId('analytics-line')).not.toBeInTheDocument();
    expect(screen.getByTestId('analytics-line-empty')).toBeInTheDocument();
  });

  it('humanizes category slugs on the bar chart (equipment-rental becomes Equipment rental)', () => {
    render(
      <AnalyticsChartsView
        byCategory={[{ slug: 'equipment-rental', count: 5 }, { slug: 'temp-fence', count: 2 }]}
        byDay={[]}
        schema={internalSchema}
      />,
    );
    expect(screen.getByText('Equipment rental')).toBeInTheDocument();
    expect(screen.getByText('Temp fence')).toBeInTheDocument();
    // Raw slug must NOT appear in the DOM as visible text.
    expect(screen.queryByText('equipment-rental')).not.toBeInTheDocument();
  });

  it('emits eyebrow "Analytics" and section title to mark secondary content', () => {
    render(
      <AnalyticsChartsView
        byCategory={[{ slug: 'equipment-rental', count: 5 }]}
        byDay={[]}
        schema={internalSchema}
      />,
    );
    expect(screen.getByText(/Analytics/i)).toBeInTheDocument();
  });
});
