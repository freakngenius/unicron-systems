// @vitest-environment jsdom
//
// LeadCard — Build-Out Pass Slice 2.
// Spec: Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md.
//
// Honors ui_plan.lead_card_layout: primary_fields are surfaced
// prominently, secondary_fields live inside an expandable <details>.
// score_position controls which corner the score chip renders in.
// Container emits data-lead-card so DoD smoke step 8 sees a marker.

import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LeadCard, LeadCardList } from '@/components/LeadCard';
import type { UIPlan } from '@/lib/types/architecture';

void React;
afterEach(cleanup);

const LAYOUT: UIPlan['lead_card_layout'] = {
  primary_fields: ['name', 'asset_class', 'value'],
  secondary_fields: ['source', 'created_at'],
  score_position: 'top-right',
};

const LEAD = {
  id: 'lead-1',
  name: 'Acme Tower 14',
  asset_class: 'commercial',
  value: 250000,
  source: 'sam.gov',
  created_at: '2026-05-12',
  score: 87,
};

describe('<LeadCard />', () => {
  it('renders a data-lead-card container', () => {
    const { container } = render(<LeadCard lead={LEAD} layout={LAYOUT} />);
    expect(container.querySelector('[data-lead-card]')).not.toBeNull();
  });

  it('renders each primary_field prominently (outside <details>)', () => {
    const { container } = render(<LeadCard lead={LEAD} layout={LAYOUT} />);
    const primary = container.querySelector('[data-lead-primary]') as HTMLElement | null;
    expect(primary).not.toBeNull();
    expect(primary!.textContent).toContain('Acme Tower 14');
    expect(primary!.textContent).toContain('commercial');
    expect(primary!.textContent).toContain('250000');
  });

  it('renders secondary_fields inside a <details> element', () => {
    const { container } = render(<LeadCard lead={LEAD} layout={LAYOUT} />);
    const details = container.querySelector('[data-lead-secondary]') as HTMLElement | null;
    expect(details).not.toBeNull();
    expect(details!.tagName.toLowerCase()).toBe('details');
    expect(details!.textContent).toContain('sam.gov');
    expect(details!.textContent).toContain('2026-05-12');
  });

  it('respects score_position via a data attribute', () => {
    const { container } = render(<LeadCard lead={LEAD} layout={LAYOUT} />);
    const card = container.querySelector('[data-lead-card]') as HTMLElement;
    expect(card.getAttribute('data-score-position')).toBe('top-right');
    const score = within(card).getByText('87');
    expect(score).toBeInTheDocument();
  });

  it('LeadCardList renders one card per lead', () => {
    const { container } = render(
      <LeadCardList leads={[LEAD, { ...LEAD, id: 'lead-2', name: 'Acme Site 15' }]} layout={LAYOUT} />,
    );
    expect(container.querySelectorAll('[data-lead-card]').length).toBe(2);
  });

  it('LeadCardList renders the wrapper even when leads is empty', () => {
    const { container } = render(<LeadCardList leads={[]} layout={LAYOUT} />);
    expect(container.querySelector('[data-lead-card-list]')).not.toBeNull();
    expect(container.querySelectorAll('[data-lead-card]').length).toBe(0);
  });
});
