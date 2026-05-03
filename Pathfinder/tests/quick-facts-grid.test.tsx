// @vitest-environment jsdom
//
// tests/quick-facts-grid.test.tsx — Demo Polish UX Gate 7A.
//
// Per spec acceptance criterion #1 (Houston flagship renders all 9 cells)
// + criterion #7 (empty states never bare `—` without a label) +
// per-cell empty-state rules from SPEC § 3.
//
// Two anchor fixtures:
//   - Houston flagship (TxDOT I-45) — full enrichment; every cell populated
//   - Pittsburgh sparse — minimal data; exercises empty-state per cell

import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { QuickFactsGrid } from '@/components/lead/QuickFactsGrid';
import type { Project } from '@/lib/types';

afterEach(() => cleanup());

function baseProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p-test',
    source: 'sam.gov',
    source_id: 'TEST-001',
    title: 'Test project',
    summary: null,
    lat: null,
    lon: null,
    project_value: null,
    project_stage: null,
    posted_date: '2026-04-21T00:00:00Z',
    raw_payload: null,
    rationale: null,
    rationale_streamed_at: null,
    score: 80,
    nearest_branch_id: null,
    distance_miles: null,
    outreach_hook: null,
    warm_for_customer_id: null,
    ingested_at: '2026-04-21T00:00:00Z',
    ranked_at: null,
    ...overrides,
  };
}

const houstonFlagship: Project = baseProject({
  id: 'sam.gov:TXDOT-I45-2026-001',
  source_id: 'TXDOT-I45-2026-001',
  title: 'I-45 corridor security upgrade — Harris County',
  source: 'sam.gov',
  project_value: 12_400_000,
  project_stage: 'RFP open',
  estimated_start_date: '2026-06-01',
  estimated_end_date: '2027-04-30',
  lat: 29.7604,
  lon: -95.3698,
  location_text: 'Houston, TX',
  owner_name: 'Texas Department of Transportation',
  owner_type: 'state_agency',
  prime_contractor_name: 'Brasfield & Gorrie',
  naics_code: '237310',
  naics_description: 'Highway, Street, and Bridge Construction',
  permit_type: null,
  permit_number: null,
  permit_jurisdiction: null,
  permit_filing_date: null,
  lot_size_acres: null, // linear infra — cell hidden
  enriched_at: '2026-05-01T12:00:00Z',
  enrichment_provider: 'sonar+anthropic',
});

const pittsburghSparse: Project = baseProject({
  id: 'sam.gov:PIT-SPARSE-001',
  source_id: 'PIT-SPARSE-001',
  source: 'sam.gov',
  title: 'Pittsburgh courthouse retrofit',
  project_value: null,
  project_stage: null,
  owner_name: null,
  owner_type: null,
  prime_contractor_name: null, // sam.gov + null → pre-award
  naics_code: null,
  naics_description: null,
  location_text: null,
  lat: 40.4406,
  lon: -79.9959,
  estimated_start_date: '2026-07-15', // sam.gov: this is the bid deadline
  estimated_end_date: null,
  permit_type: null,
  permit_number: null,
  permit_jurisdiction: null,
  enriched_at: null, // not yet enriched — drives "pending" empty states
});

describe('QuickFactsGrid — Houston flagship (acceptance criterion #1)', () => {
  it('renders all 9 cells with correct values, hiding Lot Size for linear infra', () => {
    render(<QuickFactsGrid project={houstonFlagship} />);

    // Owner cell — name + state-agency chip
    expect(screen.getByText('Texas Department of Transportation')).toBeInTheDocument();
    expect(screen.getByText('STATE AGENCY')).toBeInTheDocument();

    // Prime Contractor — Brasfield & Gorrie (per spec acceptance #2 also)
    expect(screen.getByText('Brasfield & Gorrie')).toBeInTheDocument();

    // Project Value — $12.4M
    expect(screen.getByText('$12.4M')).toBeInTheDocument();

    // Industry — NAICS code · description (per spec acceptance #6)
    expect(
      screen.getByText('237310 · Highway, Street, and Bridge Construction'),
    ).toBeInTheDocument();

    // Stage — raw value pre-7B normalization
    expect(screen.getByText('RFP open')).toBeInTheDocument();

    // Timing — date range with estimated months subtitle
    expect(screen.getByText('06-01-26 – 04-30-27')).toBeInTheDocument();

    // Location — text + coords
    expect(screen.getByText('Houston, TX')).toBeInTheDocument();
    expect(screen.getByText('29.7604, -95.3698')).toBeInTheDocument();

    // Permit — federal/state-agency with no permit data → "Not disclosed"
    // because state-agency owner is not federal_agency, but no permit data
    // is also valid pending. Houston is enriched + state-agency → unknown
    // (— renders for state-agency since the not-disclosed branch only
    // triggers on federal_agency owner_type).
    const permitCell = screen.getByTestId('quick-facts-cell-permit');
    expect(within(permitCell).getByText('—')).toBeInTheDocument();

    // Lot Size — HIDDEN for linear infra (NAICS 237310)
    expect(screen.queryByTestId('quick-facts-cell-lot-size')).toBeNull();
  });

  it('renders all 8 expected cells (lot-size hidden for linear infra)', () => {
    const { container } = render(<QuickFactsGrid project={houstonFlagship} />);
    const cells = container.querySelectorAll('[data-testid^="quick-facts-cell-"]');
    expect(cells.length).toBe(8);
  });
});

describe('QuickFactsGrid — Pittsburgh sparse (empty-state rules)', () => {
  it('renders sam.gov pre-award handling for Prime Contractor', () => {
    render(<QuickFactsGrid project={pittsburghSparse} />);
    // sam.gov + null prime_contractor → "Pre-award (no awardee yet)" not "—"
    expect(screen.getByText('Pre-award (no awardee yet)')).toBeInTheDocument();
  });

  it('renders "Not disclosed (open solicitation)" for sam.gov pre-award value', () => {
    render(<QuickFactsGrid project={pittsburghSparse} />);
    // sam.gov + null project_value (when also pre-award) → "Not disclosed"
    expect(screen.getByText('Not disclosed (open solicitation)')).toBeInTheDocument();
  });

  it('renders "RFP closes <date>" for sam.gov pre-award timing instead of bare date', () => {
    render(<QuickFactsGrid project={pittsburghSparse} />);
    expect(screen.getByText('RFP closes 07-15-26')).toBeInTheDocument();
  });

  it('renders "Not yet enriched" for fields when enriched_at is null', () => {
    render(<QuickFactsGrid project={pittsburghSparse} />);
    // Owner + Industry + Stage + Location are all null + not enriched →
    // "Not yet enriched" appears multiple times.
    const labels = screen.getAllByText('Not yet enriched');
    expect(labels.length).toBeGreaterThanOrEqual(3);
  });

  it('renders coords-only fallback when location_text is null but lat/lon present', () => {
    render(<QuickFactsGrid project={pittsburghSparse} />);
    expect(screen.getByText('40.4406, -79.9959')).toBeInTheDocument();
  });

  it('shows Lot Size cell when NAICS is unknown (no linear-infra heuristic match)', () => {
    render(<QuickFactsGrid project={pittsburghSparse} />);
    expect(screen.getByTestId('quick-facts-cell-lot-size')).toBeInTheDocument();
  });
});

describe('QuickFactsGrid — federal-contract permit handling', () => {
  it('renders "Not disclosed (federal contract)" when owner_type is federal_agency and no permit', () => {
    const federal: Project = baseProject({
      id: 'usaspending:FED-001',
      source: 'usaspending',
      owner_name: 'Department of Defense',
      owner_type: 'federal_agency',
      prime_contractor_name: 'Lockheed Martin',
      enriched_at: '2026-05-01T00:00:00Z',
      enrichment_provider: 'sonar+anthropic',
    });
    render(<QuickFactsGrid project={federal} />);
    expect(screen.getByText('Not disclosed (federal contract)')).toBeInTheDocument();
  });
});

describe('QuickFactsGrid — populated permit row', () => {
  it('renders permit_type, number, jurisdiction, and filing date', () => {
    const harris: Project = baseProject({
      id: 'harris:HAR-001',
      source: 'harris',
      title: 'Office renovation',
      permit_type: 'commercial-renovation',
      permit_number: 'HAR-2026-0042',
      permit_jurisdiction: 'Harris County, TX',
      permit_filing_date: '2026-04-15',
      enriched_at: '2026-05-01T00:00:00Z',
    });
    render(<QuickFactsGrid project={harris} />);
    expect(
      screen.getByText('commercial-renovation · HAR-2026-0042'),
    ).toBeInTheDocument();
    expect(screen.getByText('Harris County, TX')).toBeInTheDocument();
    expect(screen.getByText('Filed 04-15-26')).toBeInTheDocument();
  });
});

describe('QuickFactsGrid — owner-type chip color coding', () => {
  it.each([
    ['federal_agency' as const, 'FEDERAL AGENCY'],
    ['municipality' as const, 'MUNICIPALITY'],
    ['pe_firm' as const, 'PE FIRM'],
    ['private_developer' as const, 'PRIVATE DEVELOPER'],
    ['reit' as const, 'REIT'],
    ['nonprofit' as const, 'NONPROFIT'],
    ['university' as const, 'UNIVERSITY'],
  ])('renders %s as chip label %s', (type, label) => {
    const p: Project = baseProject({
      owner_name: 'Acme',
      owner_type: type,
    });
    render(<QuickFactsGrid project={p} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
