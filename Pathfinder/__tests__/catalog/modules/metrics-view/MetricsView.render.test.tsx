// @vitest-environment jsdom
//
// __tests__/catalog/modules/metrics-view/MetricsView.render.test.tsx, Stream F.
//
// The metrics view renders a Card per tile with a tooltip glyph carrying
// plain-language explanation and an optional breakdown subtext. The PR
// blocker for Stream F is that active_outbound_motion never renders a bare
// misleading 0%; this suite drives the renderer with a tile that has
// value=null and asserts no bare "0" appears as the big value.

import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { MetricsViewRender } from '@/lib/catalog/modules/metrics-view/MetricsView';
import type { MetricTile } from '@/lib/catalog/modules/metrics-view/metrics';

afterEach(() => cleanup());

describe('MetricsViewRender', () => {
  it('renders one card per tile with the tooltip on a labelled glyph', () => {
    const tiles: MetricTile[] = [
      {
        id: 'verified_count_1d',
        label: 'Companies verified today',
        value: 0,
        tooltip: 'How many companies the system confirmed today',
      },
      {
        id: 'sources_live',
        label: 'Sources live',
        value: 2,
        tooltip: 'How many data sources are currently feeding leads',
      },
    ];
    render(<MetricsViewRender tiles={tiles} />);
    expect(screen.getByTestId('metric-card-verified_count_1d')).toBeInTheDocument();
    expect(screen.getByTestId('metric-card-sources_live')).toBeInTheDocument();

    const tooltip = screen.getByTestId('metric-tooltip-verified_count_1d');
    expect(tooltip).toHaveAttribute('title', expect.stringContaining('confirmed'));
    expect(tooltip).toHaveAttribute('aria-label', expect.stringContaining('confirmed'));
  });

  it('renders the value with its suffix when present', () => {
    const tiles: MetricTile[] = [
      {
        id: 'avg_score_out_of_100',
        label: 'Average sales priority',
        value: 28,
        suffix: '/100',
        tooltip: 'avg',
      },
    ];
    render(<MetricsViewRender tiles={tiles} />);
    expect(screen.getByTestId('metric-value-avg_score_out_of_100')).toHaveTextContent('28/100');
  });

  it('renders the honest breakdown subtext when active_outbound_motion has no bare value', () => {
    const tiles: MetricTile[] = [
      {
        id: 'active_outbound_motion',
        label: 'Active outbound motion',
        value: null,
        subText: 'Confirmed active: 1 of 220; 219 Unknown',
        tooltip: "Unknown means not yet confirmed",
      },
    ];
    render(<MetricsViewRender tiles={tiles} />);
    // PR-blocker assertion: no "0" rendered as the big metric value.
    expect(screen.queryByTestId('metric-value-active_outbound_motion')).not.toBeInTheDocument();
    // The breakdown sub-text IS present and human-readable.
    expect(screen.getByTestId('metric-subtext-active_outbound_motion')).toHaveTextContent(
      'Confirmed active: 1 of 220; 219 Unknown',
    );
  });

  it('renders nothing when given zero tiles (does not render an empty container)', () => {
    const { container } = render(<MetricsViewRender tiles={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
