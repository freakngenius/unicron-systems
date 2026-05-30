// @vitest-environment jsdom
//
// __tests__/components/LeadCard-internal.test.tsx, Stream E (Internal V2).
//
// Asserts the Internal branch of LeadCard:
// - When a schema is passed, labels resolve through displayLabel, never
//   the raw field key.
// - Projected CompanyLeadView values render in the value cells.
// - The placeholder for null values is "-" (no em-dash anywhere in the
//   Internal branch output).
//
// The Funder backward-compat path is covered by the existing
// __tests__/components/LeadCard.test.tsx (unchanged).

import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LeadCard } from '@/components/LeadCard';
import type { UIPlan } from '@/lib/types/architecture';
import type { LeadUnitSchema } from '@/lib/catalog/modules/ranked-feed/labels';

void React;
afterEach(cleanup);

const INTERNAL_LAYOUT: UIPlan['lead_card_layout'] = {
  primary_fields: ['company_name', 'service_category', 'footprint', 'sales_motion', 'score'],
  secondary_fields: ['hq_location', 'federal_registration', 'source'],
  score_position: 'top-right',
};

const INTERNAL_SCHEMA: LeadUnitSchema = {
  company_name: { type: 'string', display_label: 'Company' },
  service_category: { type: 'enum', display_label: 'Service category' },
  footprint: { type: 'object', display_label: 'Operating footprint' },
  sales_motion: { type: 'enum', display_label: 'Sales motion' },
  score: { type: 'number', display_label: 'Score' },
  hq_location: { type: 'string', display_label: 'Headquarters' },
  federal_registration: { type: 'enum', display_label: 'Federal registration' },
  source: { type: 'string', display_label: 'Source' },
};

const INTERNAL_LEAD = {
  id: 'thalle-construction-co-inc',
  company_name: 'Thalle Construction Co Inc',
  service_category: 'General contractor',
  footprint: 'HQ NC ops NC / VA / TN',
  sales_motion: 'Active outbound',
  score: 55,
  hq_location: 'Hillsborough, NC',
  federal_registration: 'SAM + awardee',
  source: 'sam.gov',
};

describe('<LeadCard /> with Internal schema', () => {
  it('renders the display_label for every primary field, never the raw key', () => {
    const { container } = render(
      <LeadCard
        lead={INTERNAL_LEAD}
        layout={INTERNAL_LAYOUT}
        schema={INTERNAL_SCHEMA}
        placeholder="-"
      />,
    );
    const primary = container.querySelector('[data-lead-primary]') as HTMLElement;
    const text = primary.textContent ?? '';
    expect(text).toContain('Company');
    expect(text).toContain('Service category');
    expect(text).toContain('Operating footprint');
    expect(text).toContain('Sales motion');
    expect(text).toContain('Score');
    // Raw keys must not leak.
    expect(text).not.toMatch(/\bcompany_name\b/);
    expect(text).not.toMatch(/\bservice_category\b/);
    expect(text).not.toMatch(/\bfootprint\b\s*\n/);
    expect(text).not.toMatch(/\bsales_motion\b/);
  });

  it('drops the CSS uppercase transform on labels when a schema is present', () => {
    const { container } = render(
      <LeadCard
        lead={INTERNAL_LEAD}
        layout={INTERNAL_LAYOUT}
        schema={INTERNAL_SCHEMA}
        placeholder="-"
      />,
    );
    const primary = container.querySelector('[data-lead-primary]') as HTMLElement;
    const firstRow = primary.querySelector('[data-field="company_name"]') as HTMLElement;
    const label = firstRow.querySelector('span') as HTMLElement;
    expect((label.style.textTransform ?? '').toLowerCase()).not.toBe('uppercase');
  });

  it('renders the projected value for every primary field', () => {
    const { container } = render(
      <LeadCard
        lead={INTERNAL_LEAD}
        layout={INTERNAL_LAYOUT}
        schema={INTERNAL_SCHEMA}
        placeholder="-"
      />,
    );
    const text = (container.querySelector('[data-lead-primary]') as HTMLElement).textContent ?? '';
    expect(text).toContain('Thalle Construction Co Inc');
    expect(text).toContain('General contractor');
    expect(text).toContain('HQ NC ops NC / VA / TN');
    expect(text).toContain('Active outbound');
    expect(text).toContain('55');
  });

  it('uses the "-" placeholder for null fields when schema is present, never the em dash', () => {
    const partial = { ...INTERNAL_LEAD, footprint: null, sales_motion: null };
    const { container } = render(
      <LeadCard
        lead={partial}
        layout={INTERNAL_LAYOUT}
        schema={INTERNAL_SCHEMA}
        placeholder="-"
      />,
    );
    const text = (container.querySelector('[data-lead-primary]') as HTMLElement).textContent ?? '';
    expect(text).not.toContain('—');
    expect(text).not.toContain('–');
    const footprintRow = container.querySelector('[data-field="footprint"]') as HTMLElement;
    const motionRow = container.querySelector('[data-field="sales_motion"]') as HTMLElement;
    expect(footprintRow.textContent).toContain('-');
    expect(motionRow.textContent).toContain('-');
  });

  it('humanizes a schema-less key if a configured field is missing from the schema', () => {
    const layout: UIPlan['lead_card_layout'] = {
      primary_fields: ['licensure'],
      secondary_fields: [],
      score_position: 'top-right',
    };
    const lead = { id: 'x', licensure: 'NC GC license' };
    // A schema that does not include licensure should still humanize the key
    // ("Licensure") rather than render "licensure" verbatim.
    const { container } = render(
      <LeadCard
        lead={lead}
        layout={layout}
        schema={INTERNAL_SCHEMA}
        placeholder="-"
      />,
    );
    const text = (container.querySelector('[data-lead-primary]') as HTMLElement).textContent ?? '';
    expect(text).toContain('Licensure');
    expect(text).not.toMatch(/\blicensure\s/);
  });
});
