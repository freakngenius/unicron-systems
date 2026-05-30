// @vitest-environment jsdom
//
// __tests__/components/catalog/cards/CompanyLeadCard.test.tsx, Stream E.
//
// Direct tests for the shared Internal lead card. The card is consumed by
// the Companies list (app/[slug]/leads/page.tsx), the Dashboard ranked
// feed (lib/catalog/modules/ranked-feed/RankedFeed.tsx), and the Pipeline
// kanban (Stream G). Per SPEC-Internal-Rework-V2.md Stream E the three
// surfaces render through this one card to stay visually consistent.

import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CompanyLeadCard } from '@/components/catalog/cards/CompanyLeadCard';
import type { CompanyLeadView } from '@/lib/agents/internal/companyLeadView';
import type { LeadUnitSchema } from '@/lib/catalog/modules/ranked-feed/labels';

void React;
afterEach(cleanup);

const SCHEMA: LeadUnitSchema = {
  company_name: { type: 'string', display_label: 'Company' },
  service_category: { type: 'enum', display_label: 'Service category' },
  footprint: { type: 'object', display_label: 'Operating footprint' },
  sales_motion: { type: 'enum', display_label: 'Sales motion' },
  hq_location: { type: 'string', display_label: 'Headquarters' },
  score: { type: 'number', display_label: 'Score' },
};

function view(overrides: Partial<CompanyLeadView> = {}): CompanyLeadView {
  return {
    id: 'manson-construction-co',
    company_name: 'Manson Construction Co',
    score: 78,
    verified: true,
    service_category: 'General contractor',
    sales_motion: 'Active outbound',
    footprint: 'HQ WA ops WA / OR / CA',
    hq_location: 'Seattle, WA',
    employee_count: 1500,
    federal_registration: 'SAM + awardee',
    associations: ['AGC'],
    source: 'sam.gov',
    posted_date: '2026-05-10',
    warm_intro: null,
    first_step: 'Mention the Houston tower replacement program',
    rationale: 'Top-quartile federal awardee with three regional offices and confirmed BD hiring. Strong fit for the construction surveillance pitch.',
    brief: 'Marine general contractor; coastal infrastructure focus.',
    citations: [],
    website: 'https://example.com',
    linkedin: null,
    contacts: [],
    ...overrides,
  };
}

describe('<CompanyLeadCard />', () => {
  it('renders company name, schema display labels, and projected values (no raw keys, no blanks)', () => {
    const { container } = render(<CompanyLeadCard view={view()} slug="internal" schema={SCHEMA} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Manson Construction Co');
    expect(text).toContain('Service category');
    expect(text).toContain('General contractor');
    expect(text).toContain('Operating footprint');
    expect(text).toContain('HQ WA ops WA / OR / CA');
    expect(text).toContain('Sales motion');
    expect(text).toContain('Active outbound');
    expect(text).toContain('Headquarters');
    expect(text).toContain('Seattle, WA');
    // Raw schema keys must not leak.
    expect(text).not.toMatch(/\bservice_category\b/);
    expect(text).not.toMatch(/\bsales_motion\b/);
    expect(text).not.toMatch(/\bcompany_name\b/);
    // No em-dash placeholder.
    expect(text).not.toContain('—');
  });

  it('renders the one-line "why" from the rationale (first sentence)', () => {
    const { container } = render(<CompanyLeadCard view={view()} slug="internal" schema={SCHEMA} />);
    const why = container.querySelector('[data-testid="company-lead-card-why-manson-construction-co"]');
    expect(why).not.toBeNull();
    expect(why!.textContent).toContain('Top-quartile federal awardee');
    // Should be one sentence, not the whole paragraph.
    expect(why!.textContent).not.toContain('confirmed BD hiring. Strong fit');
  });

  it('renders the real total score in the score badge slot (no fabricated breakdown)', () => {
    const { container } = render(<CompanyLeadCard view={view()} slug="internal" schema={SCHEMA} />);
    const scoreSlot = container.querySelector('[data-testid="company-lead-card-score-manson-construction-co"]');
    expect(scoreSlot).not.toBeNull();
    expect(scoreSlot!.textContent).toContain('78');
  });

  it('renders a placeholder "-" when a field is null (never the em dash)', () => {
    const v = view({ footprint: null, sales_motion: null, hq_location: null });
    const { container } = render(<CompanyLeadCard view={v} slug="internal" schema={SCHEMA} />);
    const text = container.textContent ?? '';
    expect(text).not.toContain('—');
    expect(text).not.toContain('–');
    expect(text).toContain('-');
  });

  it('default mode wraps the card in a Next link to /[slug]/leads/[id]', () => {
    const { container } = render(<CompanyLeadCard view={view()} slug="internal" schema={SCHEMA} />);
    const link = container.querySelector('a[data-testid="company-lead-card-link-manson-construction-co"]');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toContain('/internal/leads/manson-construction-co');
  });

  it('mode="bare" renders without a link wrapper (Pipeline kanban consumer)', () => {
    const { container } = render(<CompanyLeadCard view={view()} slug="internal" schema={SCHEMA} mode="bare" />);
    const link = container.querySelector('a[data-testid="company-lead-card-link-manson-construction-co"]');
    expect(link).toBeNull();
    const card = container.querySelector('[data-testid="company-lead-card-card-manson-construction-co"]');
    expect(card).not.toBeNull();
  });

  it('testIdPrefix overrides the data-testid prefix for surface-specific selectors', () => {
    const { container } = render(
      <CompanyLeadCard view={view()} slug="internal" schema={SCHEMA} testIdPrefix="ranked-feed" />,
    );
    expect(container.querySelector('[data-testid="ranked-feed-card-manson-construction-co"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ranked-feed-link-manson-construction-co"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ranked-feed-why-manson-construction-co"]')).not.toBeNull();
  });
});
