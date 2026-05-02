import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SourceOnboarderResultPanel } from './SourceOnboarderResultPanel';
import type { OnboardSyncResponse } from '../../../lib/contracts/sourceOnboarder';

const tier1: OnboardSyncResponse = {
  ok: true,
  status: 'live',
  source_id: 'src-1',
  adapter_kind: 'socrata',
  schema: { permit_id: 'string', filing_date: 'date' },
  first_event_at: new Date().toISOString(),
  session_id: 'sess-1',
  cost_usd: 1.2,
  duration_ms: 88_000,
};

const tier2: OnboardSyncResponse = {
  ok: true,
  status: 'human-assist',
  ticket_id: 'ticket-7',
  reason: 'free-text rss; parser hint required',
  session_id: 'sess-2',
  cost_usd: 0.8,
  duration_ms: 60_000,
};

const declined: OnboardSyncResponse = {
  ok: true,
  status: 'declined',
  reason: 'low-signal source',
  session_id: 'sess-3',
  cost_usd: 0.1,
  duration_ms: 12_000,
};

describe('SourceOnboarderResultPanel', () => {
  it('Tier 1 result renders schema preview + Commit button + invokes onCommit', () => {
    const onCommit = vi.fn();
    render(<SourceOnboarderResultPanel result={tier1} onCommit={onCommit} />);
    expect(screen.getByTestId('source-onboarder-schema-preview')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('source-onboarder-commit-button'));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('Tier 2 result renders escalation block + invokes onOpenTier2 with ticket id', () => {
    const onOpenTier2 = vi.fn();
    render(<SourceOnboarderResultPanel result={tier2} onOpenTier2={onOpenTier2} />);
    expect(screen.getByTestId('source-onboarder-tier2-detail')).toHaveTextContent(
      /needs your help/i,
    );
    fireEvent.click(screen.getByTestId('source-onboarder-open-tier2'));
    expect(onOpenTier2).toHaveBeenCalledWith('ticket-7');
  });

  it('Declined result renders the decline block (no Commit / no Tier2 link)', () => {
    render(<SourceOnboarderResultPanel result={declined} />);
    expect(screen.queryByTestId('source-onboarder-commit-button')).toBeNull();
    expect(screen.queryByTestId('source-onboarder-open-tier2')).toBeNull();
    expect(screen.getByText(/low-signal source/i)).toBeInTheDocument();
  });

  it('readOnly hides the Commit button on Tier 1 result', () => {
    render(<SourceOnboarderResultPanel result={tier1} onCommit={vi.fn()} readOnly />);
    expect(screen.queryByTestId('source-onboarder-commit-button')).toBeNull();
  });
});
