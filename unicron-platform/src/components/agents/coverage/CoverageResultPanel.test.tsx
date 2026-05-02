import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CoverageResultPanel } from './CoverageResultPanel';
import { buildCoverageGoalDetailMock, coverageGoalsMock } from '../../../data/mocks';

describe('CoverageResultPanel', () => {
  const detail = buildCoverageGoalDetailMock(coverageGoalsMock[0].id);

  it('renders Tier 1 + Tier 2 sections with the candidate URLs', () => {
    render(<CoverageResultPanel detail={detail} baselineLeadCount={100} />);

    expect(screen.getByText(/TIER 1 — AUTO-VERIFIED/)).toBeInTheDocument();
    expect(screen.getByText(/TIER 2 — NEEDS OPERATOR REVIEW/)).toBeInTheDocument();
    expect(screen.getAllByTestId('coverage-tier1-row').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('coverage-tier2-row').length).toBeGreaterThan(0);
  });

  it('renders the lead-pool delta line with baseline and projected counts', () => {
    render(<CoverageResultPanel detail={detail} baselineLeadCount={100} />);
    const delta = screen.getByTestId('coverage-lead-delta');
    expect(delta).toHaveTextContent(/100/);
    expect(delta).toHaveTextContent(/\+/); // delta indicator present
  });

  it('Commit-to-production button is present and triggers onCommit', () => {
    const onCommit = vi.fn();
    render(<CoverageResultPanel detail={detail} onCommit={onCommit} />);
    fireEvent.click(screen.getByTestId('coverage-commit-button'));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('hides the commit button when readOnly', () => {
    render(<CoverageResultPanel detail={detail} readOnly />);
    expect(screen.queryByTestId('coverage-commit-button')).toBeNull();
  });

  it('Tier 2 row click invokes onTier2Click with the candidate', () => {
    const onTier2Click = vi.fn();
    render(<CoverageResultPanel detail={detail} onTier2Click={onTier2Click} />);
    const rows = screen.getAllByTestId('coverage-tier2-row');
    fireEvent.click(rows[0]);
    expect(onTier2Click).toHaveBeenCalledTimes(1);
    expect(onTier2Click.mock.calls[0][0]).toHaveProperty('candidate_url');
  });
});
