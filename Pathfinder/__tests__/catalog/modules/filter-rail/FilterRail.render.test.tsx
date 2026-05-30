// @vitest-environment jsdom
//
// __tests__/catalog/modules/filter-rail/FilterRail.render.test.tsx, Stream B.
//
// The rail renders filter selects for the four configured fields when the
// org's lead_unit.schema declares them. A filter whose backing schema field
// is ABSENT must be dropped from the DOM entirely, not rendered disabled.
// Enum values come from schema[field].enum_values and are humanized for
// display (raw slugs never leak to the UI).

import * as React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// next/navigation mock so the client component can import useRouter
// without booting the App Router.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/internal',
}));

import { FilterRail } from '@/lib/catalog/modules/filter-rail/FilterRail';
import type { LeadUnitSchema } from '@/lib/catalog/modules/ranked-feed/labels';

afterEach(() => cleanup());

const fullSchema: LeadUnitSchema = {
  service_category: {
    type: 'enum',
    display_label: 'Service category',
    enum_values: ['equipment-rental', 'temp-fence', 'crane-rental'],
  },
  sales_motion: {
    type: 'enum',
    display_label: 'Sales motion',
    enum_values: ['active-outbound', 'hiring-bd', 'inbound-only', 'unknown'],
  },
  federal_registration: {
    type: 'enum',
    display_label: 'Federal registration',
    enum_values: ['sam-registered', 'federal-awardee', 'both', 'none'],
  },
  source: { type: 'string', display_label: 'Source' },
};

const sources: ReadonlyArray<{ id: string }> = [{ id: 'sam-gov' }, { id: 'usaspending' }];

describe('FilterRail', () => {
  it('renders one select per configured filter when every backing field is present', () => {
    render(<FilterRail schema={fullSchema} sources={sources} initialFilters={{}} />);
    expect(screen.getByTestId('filter-service_category')).toBeInTheDocument();
    expect(screen.getByTestId('filter-sales_motion')).toBeInTheDocument();
    expect(screen.getByTestId('filter-federal_registration')).toBeInTheDocument();
    expect(screen.getByTestId('filter-source')).toBeInTheDocument();
  });

  it('drops a filter whose backing schema field is absent (no disabled control left behind)', () => {
    const { sales_motion: _sm, federal_registration: _fr, ...partial } = fullSchema as Record<string, unknown>;
    render(
      <FilterRail
        schema={partial as LeadUnitSchema}
        sources={sources}
        initialFilters={{}}
      />,
    );
    expect(screen.getByTestId('filter-service_category')).toBeInTheDocument();
    expect(screen.getByTestId('filter-source')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-sales_motion')).not.toBeInTheDocument();
    expect(screen.queryByTestId('filter-federal_registration')).not.toBeInTheDocument();
  });

  it('humanizes enum option labels (raw slug values never leak to the UI)', () => {
    render(<FilterRail schema={fullSchema} sources={sources} initialFilters={{}} />);
    const salesMotionSelect = screen.getByTestId('filter-sales_motion') as HTMLSelectElement;
    const optionTexts = Array.from(salesMotionSelect.options).map((o) => o.textContent);
    // The "All" option is always first.
    expect(optionTexts[0]).toMatch(/All/i);
    expect(optionTexts).toContain('Active outbound');
    expect(optionTexts).toContain('Hiring bd');
    expect(optionTexts).toContain('Inbound only');
    expect(optionTexts).toContain('Unknown');
    // The slug values stay on the option.value so the URL stays normalized.
    const values = Array.from(salesMotionSelect.options).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['', 'active-outbound', 'hiring-bd', 'inbound-only', 'unknown']));
  });

  it('reflects initialFilters as the select defaultValue', () => {
    render(
      <FilterRail
        schema={fullSchema}
        sources={sources}
        initialFilters={{ service_category: 'crane-rental' }}
      />,
    );
    const sel = screen.getByTestId('filter-service_category') as HTMLSelectElement;
    expect(sel.value).toBe('crane-rental');
  });

  it('source select options come from architecture.sources, not the schema enum_values', () => {
    render(<FilterRail schema={fullSchema} sources={sources} initialFilters={{}} />);
    const sel = screen.getByTestId('filter-source') as HTMLSelectElement;
    const values = Array.from(sel.options).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['', 'sam-gov', 'usaspending']));
  });

  it('renders the SectionHeader with eyebrow "Filters"', () => {
    render(<FilterRail schema={fullSchema} sources={sources} initialFilters={{}} />);
    expect(screen.getByText('Filters')).toBeInTheDocument();
  });
});
