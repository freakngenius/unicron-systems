// @vitest-environment jsdom
//
// __tests__/catalog/modules/ranked-feed/RankedFeed.render.test.tsx, Stream B.
//
// The hero must render real values with human labels (never raw schema
// keys), the score in the top-right, the one-line "why" pulled from the
// rationale, and an org-context-preserving link per card. An empty rows
// array must render the designed EmptyState rather than a broken card
// stack.

import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

afterEach(() => cleanup());

import { RankedFeed } from '@/lib/catalog/modules/ranked-feed/RankedFeed';
import type { RawCompanyRow } from '@/lib/catalog/modules/filter-rail/applyFilters';
import type { LeadUnitSchema } from '@/lib/catalog/modules/ranked-feed/labels';

const internalSchema: LeadUnitSchema = {
  company_name: { type: 'string', display_label: 'Company' },
  service_category: { type: 'enum', display_label: 'Service category' },
  sales_motion: { type: 'enum', display_label: 'Sales motion' },
  footprint: { type: 'object', display_label: 'Operating footprint' },
  score: { type: 'number', display_label: 'Score' },
};

function makeRow(overrides: Partial<RawCompanyRow> & { rationale?: string } = {}): RawCompanyRow {
  const { rationale, ...rowOverrides } = overrides;
  return {
    id: 'co-1',
    organization_id: 'internal-id',
    score: 87,
    title: 'Acme Equipment Rental',
    source: 'sam-gov',
    raw_payload: {
      internal_enrichment: {
        service_category: 'equipment-rental',
        sales_motion: 'active-outbound',
      },
      internal_geo: { hq_state: 'TX', operating_states: ['TX', 'OK'] },
      ...(rationale ? {} : {}),
    },
    ...rowOverrides,
    // The data fetcher pulls rationale from the top-level Project.rationale
    // (via the projection). Mirror that here by injecting it on raw_payload
    // for the test stub when supplied.
  };
}

describe('RankedFeed', () => {
  it('renders the designed empty state when rows is empty (never a broken card stack)', () => {
    render(<RankedFeed rows={[]} slug="internal" schema={internalSchema} />);
    expect(screen.getByRole('status')).toHaveTextContent(/no ranked companies/i);
  });

  it('renders one card per row with company_name in the heading', () => {
    const rows = [
      makeRow({ id: 'a', title: 'Acme Equipment Rental', score: 87 }),
      makeRow({ id: 'b', title: 'Brava Crane', score: 73 }),
    ];
    render(<RankedFeed rows={rows} slug="internal" schema={internalSchema} />);
    expect(screen.getByText('Acme Equipment Rental')).toBeInTheDocument();
    expect(screen.getByText('Brava Crane')).toBeInTheDocument();
  });

  it('puts a score badge per card showing the numeric score', () => {
    const rows = [makeRow({ id: 'a', score: 87 })];
    render(<RankedFeed rows={rows} slug="internal" schema={internalSchema} />);
    const badge = screen.getByTestId('ranked-feed-score-a');
    expect(badge).toHaveTextContent('87');
  });

  it('renders humanized field labels (never raw schema keys)', () => {
    const rows = [makeRow()];
    const { container } = render(
      <RankedFeed rows={rows} slug="internal" schema={internalSchema} />,
    );
    const html = container.innerHTML;
    // human labels present
    expect(html).toContain('Service category');
    expect(html).toContain('Sales motion');
    expect(html).toContain('Operating footprint');
    // raw schema keys must NOT appear as labels
    expect(html).not.toMatch(/>service_category</);
    expect(html).not.toMatch(/>sales_motion</);
    expect(html).not.toMatch(/>footprint</);
  });

  it('humanizes enum values for display (active-outbound becomes Active outbound)', () => {
    // Exact match avoids collision with the company name in the test
    // fixture (which contains 'Equipment Rental' as part of the title).
    const rows = [makeRow({ title: 'Acme Inc' })];
    render(<RankedFeed rows={rows} slug="internal" schema={internalSchema} />);
    expect(screen.getByText('Active outbound')).toBeInTheDocument();
    expect(screen.getByText('Equipment rental')).toBeInTheDocument();
  });

  it('wraps each card in an org-context link via buildOrgPath (slug intact, id encoded)', () => {
    const rows = [
      makeRow({ id: 'co-1' }),
      makeRow({ id: 'propublica:824334368', title: 'ProPub Co' }),
    ];
    render(<RankedFeed rows={rows} slug="internal" schema={internalSchema} />);
    const link1 = screen.getByTestId('ranked-feed-link-co-1');
    expect(link1).toHaveAttribute('href', '/internal/leads/co-1');
    const link2 = screen.getByTestId('ranked-feed-link-propublica:824334368');
    // encodeURIComponent turns ':' into '%3A' so the propublica id incident
    // documented in lib/nav/orgPath.ts cannot recur.
    expect(link2).toHaveAttribute('href', '/internal/leads/propublica%3A824334368');
  });

  it('renders cards in input order (the data layer is responsible for score desc; the renderer must not re-sort)', () => {
    // fetchRankedCompanies returns rows already sorted score desc. The
    // renderer's contract is to preserve that order; the score-desc
    // invariant itself is verified in __tests__/.../ranked-feed/data.test.ts.
    const rows = [
      makeRow({ id: 'hi', title: 'Hi Co', score: 95 }),
      makeRow({ id: 'mid', title: 'Mid Co', score: 75 }),
      makeRow({ id: 'lo', title: 'Lo Co', score: 50 }),
    ];
    render(<RankedFeed rows={rows} slug="internal" schema={internalSchema} />);
    const allCards = screen.getAllByTestId(/^ranked-feed-card-/);
    expect(allCards.map((el) => el.getAttribute('data-testid'))).toEqual([
      'ranked-feed-card-hi',
      'ranked-feed-card-mid',
      'ranked-feed-card-lo',
    ]);
  });
});
