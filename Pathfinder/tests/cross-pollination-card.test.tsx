// @vitest-environment jsdom
//
// tests/cross-pollination-card.test.tsx — Demo Polish UX Gate 7B.
//
// Spec § 4 contract: per-match row format, EXACT vs FUZZY chip styling,
// hide-when-empty, hook-insertion callback. Plus the hard-halt test —
// rendering all 12 Gate-2 cross-poll matches preserves every match.

import * as React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { CrossPollinationCard } from '@/components/lead/CrossPollinationCard';
import type { CrossPollinationMatchRow } from '@/components/zedcor/ZedcorRelationshipContext';

afterEach(() => cleanup());

function match(overrides: Partial<CrossPollinationMatchRow> = {}): CrossPollinationMatchRow {
  return {
    id: `m-${Math.random().toString(36).slice(2, 8)}`,
    customer_canonical: 'memorial hermann',
    customer_org_id: 'mh',
    match_layer: 'exact',
    match_confidence: 0.95,
    primary_branch_id: 'b1',
    primary_branch_name: 'Houston',
    branch_count: 1,
    active_site_count: 3,
    most_recent_site_date: '2025-12-01',
    national_account: false,
    matched_field: 'project_owner',
    matched_value_raw: 'Memorial Hermann',
    ...overrides,
  };
}

describe('CrossPollinationCard — empty / single / multi rendering', () => {
  it('renders nothing when matches array is empty', () => {
    const { container } = render(<CrossPollinationCard matches={[]} targetRegion={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the title with the correct match count (singular)', () => {
    render(<CrossPollinationCard matches={[match()]} targetRegion={null} />);
    expect(screen.getByText(/Warm intro available — 1 match$/)).toBeInTheDocument();
  });

  it('renders the title pluralized for >1 matches', () => {
    render(
      <CrossPollinationCard
        matches={[match({ id: 'a' }), match({ id: 'b', customer_canonical: 'big-d construction' })]}
        targetRegion={null}
      />,
    );
    expect(screen.getByText(/Warm intro available — 2 matches$/)).toBeInTheDocument();
  });

  it('renders region subtitle when targetRegion provided', () => {
    render(<CrossPollinationCard matches={[match()]} targetRegion="TX" />);
    expect(screen.getByTestId('cross-pollination-card-region')).toHaveTextContent('TX');
  });
});

describe('CrossPollinationCard — per-match row format (spec § 4)', () => {
  it('renders customer (title-cased), branch, and site count', () => {
    render(
      <CrossPollinationCard
        matches={[match({ customer_canonical: 'memorial hermann', primary_branch_name: 'Houston', active_site_count: 3 })]}
        targetRegion={null}
      />,
    );
    expect(screen.getByText('Memorial Hermann')).toBeInTheDocument();
    expect(screen.getByText('Houston · 3 sites')).toBeInTheDocument();
  });

  it('singularizes "site" when active_site_count is 1', () => {
    render(
      <CrossPollinationCard
        matches={[match({ active_site_count: 1, primary_branch_name: 'Houston' })]}
        targetRegion={null}
      />,
    );
    expect(screen.getByText('Houston · 1 site')).toBeInTheDocument();
  });

  it('renders EXACT chip for exact matches', () => {
    render(<CrossPollinationCard matches={[match({ match_layer: 'exact' })]} targetRegion={null} />);
    expect(screen.getByText('EXACT')).toBeInTheDocument();
  });

  it('renders FUZZY chip for fuzzy matches', () => {
    render(<CrossPollinationCard matches={[match({ match_layer: 'fuzzy' })]} targetRegion={null} />);
    expect(screen.getByText('FUZZY')).toBeInTheDocument();
  });

  it('renders the National account flag when set', () => {
    render(<CrossPollinationCard matches={[match({ national_account: true })]} targetRegion={null} />);
    expect(screen.getByText(/National account/i)).toBeInTheDocument();
  });

  it('renders an inline outreach hook block per match', () => {
    const m = match({ id: 'mh', customer_canonical: 'memorial hermann', active_site_count: 3 });
    render(<CrossPollinationCard matches={[m]} targetRegion={null} />);
    const hook = screen.getByTestId('cross-pollination-match-mh-hook');
    expect(hook).toBeInTheDocument();
    // Hook is generated from match data — must reference the customer name.
    expect(hook).toHaveTextContent(/memorial hermann/i);
  });
});

describe('CrossPollinationCard — sort order', () => {
  it('renders highest-confidence match first', () => {
    const lower = match({ id: 'low', customer_canonical: 'low confidence co', match_confidence: 0.7 });
    const higher = match({ id: 'high', customer_canonical: 'high confidence co', match_confidence: 0.95 });
    render(<CrossPollinationCard matches={[lower, higher]} targetRegion={null} />);
    const rows = screen.getAllByTestId(/^cross-pollination-match-/).filter((el) =>
      el.getAttribute('data-testid')?.split('-').length === 4,
    );
    // First match row in the DOM should be the higher-confidence one.
    expect(rows[0]).toHaveAttribute('data-testid', 'cross-pollination-match-high');
  });
});

describe('CrossPollinationCard — onInsertHook callback wiring', () => {
  it('renders the insert button as enabled when callback provided', () => {
    render(
      <CrossPollinationCard
        matches={[match({ id: 'mh' })]}
        targetRegion={null}
        onInsertHook={vi.fn()}
      />,
    );
    expect(screen.getByTestId('cross-pollination-match-mh-insert')).not.toBeDisabled();
  });

  it('disables the insert button when no callback provided', () => {
    render(<CrossPollinationCard matches={[match({ id: 'mh' })]} targetRegion={null} />);
    expect(screen.getByTestId('cross-pollination-match-mh-insert')).toBeDisabled();
  });

  it('fires onInsertHook with the synthesized hook + matchId on click', () => {
    const onInsertHook = vi.fn();
    render(
      <CrossPollinationCard
        matches={[match({ id: 'mh', customer_canonical: 'memorial hermann' })]}
        targetRegion={null}
        onInsertHook={onInsertHook}
      />,
    );
    fireEvent.click(screen.getByTestId('cross-pollination-match-mh-insert'));
    expect(onInsertHook).toHaveBeenCalledTimes(1);
    expect(onInsertHook).toHaveBeenCalledWith(
      expect.stringContaining('Memorial Hermann'),
      'mh',
    );
  });
});

describe('CrossPollinationCard — Gate-2 hard-halt: 12 matches preserved', () => {
  // Per dispatch prompt + operator-todo hard-halt rule, no cross-poll match
  // can be lost between Gate 7A → 7B. Render 12 matches and assert all 12
  // appear (each gets its own row testid).
  it('renders all 12 matches when given 12', () => {
    const matches: CrossPollinationMatchRow[] = Array.from({ length: 12 }).map((_, i) =>
      match({
        id: `m${i}`,
        customer_canonical: `customer-${i}`,
        match_layer: i % 2 === 0 ? 'exact' : 'fuzzy',
        match_confidence: 0.95 - i * 0.02,
      }),
    );
    render(<CrossPollinationCard matches={matches} targetRegion={null} />);
    for (let i = 0; i < 12; i++) {
      expect(screen.getByTestId(`cross-pollination-match-m${i}`)).toBeInTheDocument();
    }
    // Title reflects the full count.
    expect(screen.getByText(/Warm intro available — 12 matches/)).toBeInTheDocument();
  });
});
