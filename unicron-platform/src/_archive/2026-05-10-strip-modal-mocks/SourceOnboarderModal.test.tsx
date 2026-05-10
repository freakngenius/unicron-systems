import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import {
  SourceOnboarderModal,
  type SourceOnboarderBridge,
} from './SourceOnboarderModal';
import type { AgentDispatch } from '../../lib/contracts/agentConsole';
import type { OnboardSyncResponse } from '../../lib/contracts/sourceOnboarder';
import type { InboxTicket } from '../../lib/contracts/inbox';
import { sourceOnboarderMockLiveEvents } from '../../data/mocks';

function makeDispatch(overrides: Partial<AgentDispatch> = {}): AgentDispatch {
  return {
    id: 'disp-test',
    agent_name: 'source-onboarder',
    customer_org_id: 'pathfinder-default',
    dispatched_by_user_id: null,
    input_payload: {},
    status: 'queued',
    result_payload: null,
    rejection_reason: null,
    verified_by_user_id: null,
    verified_at: null,
    cost_usd: null,
    duration_ms: null,
    agent_run_id: null,
    parent_dispatch_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeBridge(opts: { onboardResult: OnboardSyncResponse }): SourceOnboarderBridge {
  const dispatch = makeDispatch();
  return {
    createDispatch: vi.fn().mockResolvedValue(dispatch),
    appendEvent: vi.fn().mockResolvedValue({
      id: 'evt-1',
      dispatch_id: dispatch.id,
      event_type: 'reasoning',
      payload: {},
      created_at: new Date().toISOString(),
    }),
    verifyDispatch: vi.fn().mockResolvedValue({ ...dispatch, status: 'verified' }),
    rejectDispatch: vi.fn().mockResolvedValue({ ...dispatch, status: 'rejected' }),
    getDispatch: vi.fn().mockResolvedValue(dispatch),
    onboard: vi.fn().mockResolvedValue(opts.onboardResult),
    fetchTicket: vi.fn().mockResolvedValue(null as InboxTicket | null),
  };
}

const tier1Result: OnboardSyncResponse = {
  ok: true,
  status: 'live',
  source_id: 'src-test',
  adapter_kind: 'socrata',
  schema: { permit_id: 'string' },
  first_event_at: new Date().toISOString(),
  session_id: 'sess-test',
  cost_usd: 1.4,
  duration_ms: 80_000,
};

const tier2Result: OnboardSyncResponse = {
  ok: true,
  status: 'human-assist',
  ticket_id: 'ticket-pgh-rss-1',
  reason: 'rss needs parser hint',
  session_id: 'sess-test-2',
  cost_usd: 0.8,
  duration_ms: 64_000,
};

describe('SourceOnboarderModal', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SOURCE_ONBOARDER_ENABLED', 'true'); // bridge-injected path
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('Tier 1 happy path: input → live → result with Commit → verified', async () => {
    const bridge = makeBridge({ onboardResult: tier1Result });
    render(<SourceOnboarderModal onClose={() => {}} bridge={bridge} />);

    fireEvent.change(screen.getByTestId('source-onboarder-url'), {
      target: { value: 'https://data.alleghenycounty.us/permits' },
    });
    fireEvent.change(screen.getByTestId('source-onboarder-hint'), {
      target: { value: 'socrata' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('source-onboarder-dispatch-button'));
    });

    expect(bridge.createDispatch).toHaveBeenCalledTimes(1);

    const totalDelay = sourceOnboarderMockLiveEvents.reduce((s, e) => s + e.delayMs, 0);
    await act(async () => {
      vi.advanceTimersByTime(totalDelay + 100);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByTestId('source-onboarder-result-panel')).toBeInTheDocument(),
    );
    expect(bridge.onboard).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('source-onboarder-commit-button')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('source-onboarder-commit-button'));
    });

    expect(bridge.verifyDispatch).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByTestId('source-onboarder-commit-button')).toBeNull(),
    );
  });

  it('Tier 2 path surfaces the open-ticket button + invokes fetchTicket', async () => {
    const ticket: InboxTicket = {
      id: 'ticket-pgh-rss-1',
      category: 'source-discovery',
      candidate_url: 'https://upmcconstruction.example.com/rss',
      reason: 'rss needs parser hint',
      hint: 'rss',
      jurisdiction: 'Pittsburgh, PA',
      status: 'open',
      created_at: new Date().toISOString(),
      payload: null,
      resolved_at: null,
      resolved_by_user_email: null,
      resolution_note: null,
      session_id: null,
      source_id: null,
    };
    const bridge = makeBridge({ onboardResult: tier2Result });
    bridge.fetchTicket = vi.fn().mockResolvedValue(ticket);

    render(<SourceOnboarderModal onClose={() => {}} bridge={bridge} />);

    fireEvent.change(screen.getByTestId('source-onboarder-url'), {
      target: { value: 'https://upmcconstruction.example.com/rss' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('source-onboarder-dispatch-button'));
    });

    const totalDelay = sourceOnboarderMockLiveEvents.reduce((s, e) => s + e.delayMs, 0);
    await act(async () => {
      vi.advanceTimersByTime(totalDelay + 100);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByTestId('source-onboarder-tier2-detail')).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('source-onboarder-open-tier2'));
    });

    expect(bridge.fetchTicket).toHaveBeenCalledWith('ticket-pgh-rss-1');
    await waitFor(() => expect(screen.getByTestId('tier2-resolve-modal')).toBeInTheDocument());
  });

  it('error path surfaces failure when onboard rejects', async () => {
    const bridge = makeBridge({ onboardResult: tier1Result });
    bridge.onboard = vi.fn().mockRejectedValue(new Error('upstream 502'));
    render(<SourceOnboarderModal onClose={() => {}} bridge={bridge} />);

    fireEvent.change(screen.getByTestId('source-onboarder-url'), {
      target: { value: 'https://x.test' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('source-onboarder-dispatch-button'));
    });

    const totalDelay = sourceOnboarderMockLiveEvents.reduce((s, e) => s + e.delayMs, 0);
    await act(async () => {
      vi.advanceTimersByTime(totalDelay + 100);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await screen.findByTestId('source-onboarder-error')).toHaveTextContent(/502/);
  });
});
