// @vitest-environment jsdom
//
// __tests__/catalog/modules/kpi-strip/KpiStrip.render.test.tsx, Stream B.
//
// The strip MUST drop a metric whose resolved value is null. The DOM must
// not contain any rendering of "0" or "0%" for a dropped metric. Verifies
// the spec-critical false-zero elimination.

import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { KpiStripView } from '@/lib/catalog/modules/kpi-strip/KpiStrip';

afterEach(() => cleanup());

describe('KpiStripView (pure renderer over resolved values)', () => {
  it('renders one tile per non-null metric', () => {
    render(
      <KpiStripView
        metrics={[
          { id: 'verified_count_1d', label: 'Companies verified today', value: 3 },
          { id: 'avg_score', label: 'Average sales priority', value: 47, suffix: '%' },
        ]}
      />,
    );
    expect(screen.getByTestId('kpi-tile-verified_count_1d')).toHaveTextContent('3');
    expect(screen.getByTestId('kpi-tile-verified_count_1d')).toHaveTextContent(/companies verified/i);
    expect(screen.getByTestId('kpi-tile-avg_score')).toHaveTextContent('47%');
  });

  it('DROPS a null-valued metric from the DOM (no zero placeholder anywhere)', () => {
    render(
      <KpiStripView
        metrics={[
          { id: 'verified_count_1d', label: 'Verified', value: 3 },
          { id: 'active_motion_pct', label: 'Active outbound motion', value: null, suffix: '%' },
        ]}
      />,
    );
    // The dropped tile is absent from the DOM entirely.
    expect(screen.queryByTestId('kpi-tile-active_motion_pct')).not.toBeInTheDocument();
    expect(screen.queryByText(/active outbound motion/i)).not.toBeInTheDocument();
    // And critically: no zero or 0% leaks anywhere (the dispatch prompt's
    // exact red flag).
    expect(screen.queryByText(/^0%$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
  });

  it('renders 0 (real zero) for a metric that legitimately resolved to zero', () => {
    render(
      <KpiStripView
        metrics={[
          { id: 'verified_count_1d', label: 'Verified today', value: 0 },
        ]}
      />,
    );
    const tile = screen.getByTestId('kpi-tile-verified_count_1d');
    expect(tile).toHaveTextContent('0');
    expect(tile).toHaveTextContent(/verified/i);
  });

  it('renders nothing visible (and no role=region) when every metric drops', () => {
    const { container } = render(
      <KpiStripView
        metrics={[
          { id: 'a', label: 'A', value: null },
          { id: 'b', label: 'B', value: null },
        ]}
      />,
    );
    // The strip container itself is absent: nothing to show, no chrome.
    expect(container.querySelector('[data-testid="kpi-strip"]')).toBeNull();
  });

  it('keeps the strip slim and secondary (data-tone="secondary")', () => {
    render(
      <KpiStripView metrics={[{ id: 'a', label: 'A', value: 1 }]} />,
    );
    const strip = screen.getByTestId('kpi-strip');
    expect(strip).toHaveAttribute('data-tone', 'secondary');
  });
});
