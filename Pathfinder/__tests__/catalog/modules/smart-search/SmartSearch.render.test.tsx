// @vitest-environment jsdom
//
// __tests__/catalog/modules/smart-search/SmartSearch.render.test.tsx, Stream F.
//
// The smart-search bar is the single primary control on the Internal feed.
// It renders one text input that writes `?q=` (debounced) and a row of
// optional dropdowns for the four Internal field filters. A filter whose
// backing schema field is ABSENT is dropped from the dropdown row; the
// input is always present.

import * as React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const routerReplace = vi.fn();
const searchParamsState = { current: new URLSearchParams('') };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
  useSearchParams: () => searchParamsState.current,
  usePathname: () => '/internal',
}));

import { SmartSearch } from '@/lib/catalog/modules/smart-search/SmartSearch';
import type { LeadUnitSchema } from '@/lib/catalog/modules/ranked-feed/labels';

const fullSchema: LeadUnitSchema = {
  service_category: {
    type: 'enum',
    display_label: 'Service category',
    enum_values: ['equipment-rental', 'temp-fence'],
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

afterEach(() => {
  cleanup();
  routerReplace.mockReset();
  searchParamsState.current = new URLSearchParams('');
});

describe('SmartSearch', () => {
  it('renders one search input and all four dropdown refinements', () => {
    render(<SmartSearch schema={fullSchema} sources={sources} initialFilters={{}} />);
    expect(screen.getByTestId('smart-search-input')).toBeInTheDocument();
    expect(screen.getByTestId('smart-search-filter-service_category')).toBeInTheDocument();
    expect(screen.getByTestId('smart-search-filter-sales_motion')).toBeInTheDocument();
    expect(screen.getByTestId('smart-search-filter-federal_registration')).toBeInTheDocument();
    expect(screen.getByTestId('smart-search-filter-source')).toBeInTheDocument();
  });

  it('drops dropdowns whose backing schema field is absent (no disabled control left behind)', () => {
    const { sales_motion: _sm, federal_registration: _fr, ...partial } = fullSchema as Record<string, unknown>;
    render(
      <SmartSearch
        schema={partial as LeadUnitSchema}
        sources={sources}
        initialFilters={{}}
      />,
    );
    expect(screen.getByTestId('smart-search-input')).toBeInTheDocument();
    expect(screen.queryByTestId('smart-search-filter-sales_motion')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-search-filter-federal_registration')).not.toBeInTheDocument();
  });

  it('writes the debounced `q` URL param when the user types', async () => {
    vi.useFakeTimers();
    try {
      render(
        <SmartSearch
          schema={fullSchema}
          sources={sources}
          initialFilters={{}}
          debounceMs={50}
        />,
      );
      const input = screen.getByTestId('smart-search-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'manson' } });
      // Debounce: nothing fired yet.
      expect(routerReplace).not.toHaveBeenCalled();
      // Advance past the debounce.
      act(() => {
        vi.advanceTimersByTime(60);
      });
      expect(routerReplace).toHaveBeenCalled();
      const lastCall = routerReplace.mock.calls.at(-1)![0] as string;
      expect(lastCall).toContain('q=manson');
    } finally {
      vi.useRealTimers();
    }
  });

  it('updates a dropdown URL param synchronously (not debounced)', () => {
    render(<SmartSearch schema={fullSchema} sources={sources} initialFilters={{}} />);
    const select = screen.getByTestId('smart-search-filter-service_category') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'temp-fence' } });
    expect(routerReplace).toHaveBeenCalled();
    const lastCall = routerReplace.mock.calls.at(-1)![0] as string;
    expect(lastCall).toContain('service_category=temp-fence');
  });

  it('shows a Clear button when any of q or the four params are set', () => {
    render(
      <SmartSearch
        schema={fullSchema}
        sources={sources}
        initialFilters={{ service_category: 'temp-fence' }}
      />,
    );
    expect(screen.getByTestId('smart-search-clear')).toBeInTheDocument();
  });

  it('clears all filters and `q` when Clear is clicked', () => {
    searchParamsState.current = new URLSearchParams('q=manson&service_category=temp-fence');
    render(
      <SmartSearch
        schema={fullSchema}
        sources={sources}
        initialFilters={{ q: 'manson', service_category: 'temp-fence' }}
      />,
    );
    fireEvent.click(screen.getByTestId('smart-search-clear'));
    expect(routerReplace).toHaveBeenCalledWith('/internal');
  });
});
