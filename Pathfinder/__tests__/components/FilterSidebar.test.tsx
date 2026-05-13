// @vitest-environment jsdom
//
// FilterSidebar — Build-Out Pass Slice 2.
// Spec: Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md.

import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { FilterSidebar } from '@/components/FilterSidebar';
import type { UIPlan } from '@/lib/types/architecture';

void React;
afterEach(cleanup);

const FILTERS: UIPlan['filters'] = [
  { field: 'asset_class', label: 'Asset class', default: 'commercial' },
  { field: 'stage', label: 'Stage' },
  { field: 'min_value', label: 'Min value', default: 50000 },
];

describe('<FilterSidebar />', () => {
  it('renders a data-filter-sidebar container', () => {
    const { container } = render(<FilterSidebar filters={FILTERS} />);
    expect(container.querySelector('[data-filter-sidebar]')).not.toBeNull();
  });

  it('renders one control per filters entry', () => {
    const { container } = render(<FilterSidebar filters={FILTERS} />);
    expect(container.querySelectorAll('[data-filter-control]').length).toBe(FILTERS.length);
  });

  it('renders the label for each filter', () => {
    render(<FilterSidebar filters={FILTERS} />);
    expect(screen.getByText('Asset class')).toBeInTheDocument();
    expect(screen.getByText('Stage')).toBeInTheDocument();
    expect(screen.getByText('Min value')).toBeInTheDocument();
  });

  it('uses the filter.default as the initial input value when present', () => {
    const { container } = render(<FilterSidebar filters={FILTERS} />);
    const asset = container.querySelector(
      '[data-filter-control][data-field="asset_class"] input',
    ) as HTMLInputElement | null;
    expect(asset).not.toBeNull();
    expect(asset!.value).toBe('commercial');
    const minVal = container.querySelector(
      '[data-filter-control][data-field="min_value"] input',
    ) as HTMLInputElement | null;
    expect(minVal!.value).toBe('50000');
  });

  it('leaves the input empty when no default', () => {
    const { container } = render(<FilterSidebar filters={FILTERS} />);
    const stage = container.querySelector(
      '[data-filter-control][data-field="stage"] input',
    ) as HTMLInputElement | null;
    expect(stage!.value).toBe('');
  });

  it('renders an empty container when filters is empty', () => {
    const { container } = render(<FilterSidebar filters={[]} />);
    expect(container.querySelector('[data-filter-sidebar]')).not.toBeNull();
    expect(container.querySelectorAll('[data-filter-control]').length).toBe(0);
  });
});
