import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BusinessSummaryPanel } from './BusinessSummaryPanel';
import type { BusinessSummary } from '../lib/contracts/architect';

const baseSummary: BusinessSummary = {
  lead_type:
    'Acquisition opportunities — multifamily (200+ units) and hospitality properties.',
  business_area:
    'Real estate investment / acquisitions team. Feeds the underwriting pipeline.',
  problem_solved:
    'The acquisitions team can\'t manually monitor SEC filings, distressed debt feeds, broker listings, county recorders, and trade press across 8 metros.',
  what_they_get:
    'Daily scored feed of acquisition opportunities matching their underwriting profile. AI-drafted broker outreach. Pipeline kanban.',
};

describe('<BusinessSummaryPanel />', () => {
  it('renders the customer headline and all four summary fields', () => {
    render(
      <BusinessSummaryPanel
        summary={baseSummary}
        customerName="Realberry"
        onEdit={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/WHAT REALBERRY GETS/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/LEAD TYPE & BUSINESS AREA/)).toBeInTheDocument();
    expect(screen.getByText(/PROBLEM WE SOLVE/)).toBeInTheDocument();
    expect(screen.getByText(/WHAT THEY GET/)).toBeInTheDocument();
    expect(screen.getByText(baseSummary.lead_type)).toBeInTheDocument();
    expect(screen.getByText(baseSummary.business_area)).toBeInTheDocument();
    expect(screen.getByText(baseSummary.problem_solved)).toBeInTheDocument();
    expect(screen.getByText(baseSummary.what_they_get)).toBeInTheDocument();
  });

  it('invokes onEdit with the field key and edited value when an inline edit is committed', () => {
    const onEdit = vi.fn();
    render(
      <BusinessSummaryPanel
        summary={baseSummary}
        customerName="Realberry"
        onEdit={onEdit}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /edit problem solved/i }),
    );
    const textarea = screen.getByLabelText(/problem solved/i, {
      selector: 'textarea',
    });
    fireEvent.change(textarea, {
      target: { value: 'Reps lose deals because incumbents see permits first.' },
    });
    fireEvent.blur(textarea);

    expect(onEdit).toHaveBeenCalledWith(
      'problem_solved',
      'Reps lose deals because incumbents see permits first.',
    );
  });

  it('hides edit affordances when readOnly is true', () => {
    render(
      <BusinessSummaryPanel
        summary={baseSummary}
        customerName="Realberry"
        onEdit={vi.fn()}
        readOnly
      />,
    );
    expect(
      screen.queryByRole('button', { name: /edit/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the skeleton state while loading', () => {
    render(
      <BusinessSummaryPanel
        summary={null}
        customerName="Realberry"
        onEdit={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId('business-summary-skeleton'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(baseSummary.lead_type),
    ).not.toBeInTheDocument();
  });

  it('renders the error state with the default message when status is "error"', () => {
    render(
      <BusinessSummaryPanel
        summary={null}
        customerName="Realberry"
        onEdit={vi.fn()}
        status="error"
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toMatch(/did not complete a business summary/i);
  });

  it('uses a custom error message when one is provided', () => {
    render(
      <BusinessSummaryPanel
        summary={null}
        customerName="Realberry"
        onEdit={vi.fn()}
        status="error"
        errorMessage="Decomposition timed out — please retry."
      />,
    );
    expect(screen.getByRole('alert').textContent).toMatch(
      /Decomposition timed out — please retry\./,
    );
  });

  it('shows fallback headline when customerName is empty', () => {
    render(
      <BusinessSummaryPanel
        summary={baseSummary}
        customerName=""
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('WHAT THE CUSTOMER GETS')).toBeInTheDocument();
  });

  it('renders customer names containing special characters without splitting', () => {
    render(
      <BusinessSummaryPanel
        summary={baseSummary}
        customerName="Realberry is a $3.6B"
        onEdit={vi.fn()}
      />,
    );
    // toUpperCase() preserves $ and . — the panel must not split on them.
    expect(screen.getByText('WHAT REALBERRY IS A $3.6B GETS')).toBeInTheDocument();
  });

  it('cancels an in-progress edit on Escape and discards the draft', () => {
    const onEdit = vi.fn();
    render(
      <BusinessSummaryPanel
        summary={baseSummary}
        customerName="Realberry"
        onEdit={onEdit}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /edit lead type/i }),
    );
    const textarea = screen.getByLabelText(/lead type/i, {
      selector: 'textarea',
    });
    fireEvent.change(textarea, { target: { value: 'discarded draft' } });
    fireEvent.keyDown(textarea, { key: 'Escape' });

    expect(onEdit).not.toHaveBeenCalled();
    // Edit mode collapsed; original value still rendered.
    expect(screen.getByText(baseSummary.lead_type)).toBeInTheDocument();
  });
});
