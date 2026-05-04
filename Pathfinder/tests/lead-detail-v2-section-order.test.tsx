// @vitest-environment jsdom
//
// tests/lead-detail-v2-section-order.test.tsx — Demo Polish UX Gate 9A.
//
// Verifies the v2 redesigned LeadDetail body renders sections in the order
// defined by SPEC - Lead Detail Page v2.md:
//
//   2. Quick metrics strip
//   3. Rationale
//   4. Project Facts
//   5. Contacts
//   6. Relationship Context (only when matches present)
//   7. Outreach
//   8. Verifier
//   9. Source Record
//
// Section 1 (Header) is rendered by LeadDetail outside the redesigned body
// and tested separately. Each section carries a stable data-testid; this
// test captures their DOM order via comparison of indexOf in body.innerHTML.

import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { LeadDetail } from '@/components/lead/LeadDetail';
import type { CrossPollinationMatchRow } from '@/components/zedcor/ZedcorRelationshipContext';
import type { Project } from '@/lib/types';

afterEach(() => cleanup());

function baseProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    source: 'sam.gov',
    source_id: 'TXDOT-I45-2026-001',
    title: 'TxDOT I-45 Corridor',
    summary: null,
    lat: 29.83,
    lon: -95.35,
    project_value: 4_200_000,
    project_stage: 'pre-bid',
    posted_date: '2026-04-21T00:00:00Z',
    raw_payload: { url: 'https://sam.gov/opp/abc' },
    rationale: 'Strong fit. Verified. Worth a call this week.',
    rationale_streamed_at: null,
    score: 87,
    nearest_branch_id: 'hou-002',
    distance_miles: 8.5,
    outreach_hook: null,
    warm_for_customer_id: null,
    ingested_at: '2026-04-21T00:00:00Z',
    ranked_at: '2026-04-22T00:00:00Z',
    enriched_at: '2026-05-01T00:00:00Z',
    verified: true,
    ...overrides,
  };
}

function exactMatch(): CrossPollinationMatchRow {
  return {
    id: 'xp1',
    lead_id: 'p1',
    customer_canonical: 'brasfield gorrie',
    match_layer: 'exact',
    match_confidence: 1.0,
    primary_branch_id: 'hou-002',
    primary_branch_name: 'Houston',
    distance_miles: 5.0,
    n_active_sites: 12,
    score: 15,
  } as unknown as CrossPollinationMatchRow;
}

function renderV2(opts: {
  project?: Project;
  matches?: CrossPollinationMatchRow[];
} = {}) {
  return render(
    <LeadDetail
      project={opts.project ?? baseProject()}
      latestEmailDraft={null}
      contacts={[]}
      leadContacts={[]}
      recentEdits={[]}
      timelineEvents={[]}
      crossPollMatches={opts.matches ?? []}
      zedcorBranch={null}
      redesignEnabled={true}
      isTopFifty={true}
      isAdmin={true}
    />,
  );
}

describe('LeadDetail v2 — section presence', () => {
  it('renders the quick metrics strip', () => {
    renderV2();
    expect(screen.getByTestId('lead-detail-quick-metrics')).toBeInTheDocument();
  });

  it('renders the rationale card', () => {
    renderV2();
    expect(screen.getByTestId('lead-detail-rationale-card')).toBeInTheDocument();
  });

  it('marks the rationale card as CACHED when rationale_streamed_at is set', () => {
    renderV2({ project: baseProject({ rationale_streamed_at: '2026-05-01T00:00:00Z' }) });
    expect(screen.getByTestId('lead-detail-rationale-cached')).toBeInTheDocument();
  });

  it('does NOT mark the rationale as CACHED when rationale_streamed_at is null', () => {
    renderV2();
    expect(screen.queryByTestId('lead-detail-rationale-cached')).toBeNull();
  });

  it('renders the Project Facts section heading and grid', () => {
    renderV2();
    expect(
      screen.getByTestId('lead-detail-section-project-facts'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('section-heading-project-facts'),
    ).toBeInTheDocument();
  });

  it('renders the Contacts section heading', () => {
    renderV2();
    expect(
      screen.getByTestId('lead-detail-section-contacts'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('section-heading-contacts')).toBeInTheDocument();
  });

  it('renders the Relationship Context section only when crossPollMatches > 0', () => {
    renderV2();
    expect(
      screen.queryByTestId('lead-detail-section-relationship-context'),
    ).toBeNull();
    cleanup();
    renderV2({ matches: [exactMatch()] });
    expect(
      screen.getByTestId('lead-detail-section-relationship-context'),
    ).toBeInTheDocument();
  });

  it('renders the Outreach section', () => {
    renderV2();
    expect(
      screen.getByTestId('lead-detail-section-outreach'),
    ).toBeInTheDocument();
  });

  it('renders the Verifier section', () => {
    renderV2();
    expect(
      screen.getByTestId('lead-detail-verifier-section'),
    ).toBeInTheDocument();
  });

  it('renders the Source Record section heading', () => {
    renderV2();
    expect(
      screen.getByTestId('lead-detail-section-source-record'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('section-heading-source-record'),
    ).toBeInTheDocument();
  });
});

describe('LeadDetail v2 — section order is canonical', () => {
  it('renders sections in the v2 spec order', () => {
    const { container } = renderV2({ matches: [exactMatch()] });
    const html = container.innerHTML;

    const indexOf = (testid: string) =>
      html.indexOf(`data-testid="${testid}"`);

    const order = [
      indexOf('lead-detail-quick-metrics'),         // §2
      indexOf('lead-detail-rationale-card'),        // §3
      indexOf('lead-detail-section-project-facts'), // §4
      indexOf('lead-detail-section-contacts'),      // §5
      indexOf('lead-detail-section-relationship-context'), // §6
      indexOf('lead-detail-section-outreach'),      // §7
      indexOf('lead-detail-verifier-section'),      // §8
      indexOf('lead-detail-section-source-record'), // §9
    ];

    for (const idx of order) {
      expect(idx).toBeGreaterThan(-1);
    }
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
  });
});

describe('LeadDetail v2 — quick metrics strip cells', () => {
  it('shows the four canonical labels', () => {
    renderV2();
    const strip = screen.getByTestId('lead-detail-quick-metrics');
    expect(strip).toHaveTextContent(/Project Size/i);
    expect(strip).toHaveTextContent(/Stage/i);
    expect(strip).toHaveTextContent(/Distance/i);
    expect(strip).toHaveTextContent(/Posted/i);
  });

  it('formats the project value as $4.2M for the TxDOT flagship', () => {
    renderV2();
    const strip = screen.getByTestId('lead-detail-quick-metrics');
    expect(strip).toHaveTextContent('$4.2M');
  });

  it('renders the distance with one decimal mile', () => {
    renderV2();
    const strip = screen.getByTestId('lead-detail-quick-metrics');
    expect(strip).toHaveTextContent('8.5 mi');
  });
});
