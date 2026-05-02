import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CoverageExpansionModal, type DispatchBridge } from './CoverageExpansionModal';
import {
  buildCoverageGoalDetailMock,
  coverageGoalsMock,
  coverageMockLiveEvents,
} from '../../data/mocks';
import type { AgentDispatch } from '../../lib/contracts/agentConsole';

const PITTSBURGH_GOAL_ID = coverageGoalsMock[0].id;

function makeDispatch(overrides: Partial<AgentDispatch> = {}): AgentDispatch {
  return {
    id: 'disp-test-1',
    agent_name: 'coverage-expansion',
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

function makeBridge(): DispatchBridge {
  const detail = buildCoverageGoalDetailMock(PITTSBURGH_GOAL_ID);
  const dispatch = makeDispatch();
  return {
    createDispatch: vi.fn().mockResolvedValue(dispatch),
    appendEvent: vi.fn().mockResolvedValue({
      id: 'evt-1',
      dispatch_id: dispatch.id,
      event_type: 'reasoning',
      payload: { text: 'hi' },
      created_at: new Date().toISOString(),
    }),
    verifyDispatch: vi.fn().mockResolvedValue({ ...dispatch, status: 'verified' }),
    rejectDispatch: vi.fn().mockResolvedValue({ ...dispatch, status: 'rejected' }),
    getDispatch: vi.fn().mockResolvedValue(dispatch),
    createCoverageGoal: vi.fn().mockResolvedValue({
      goal_id: PITTSBURGH_GOAL_ID,
      status: 'estimating',
    }),
    getCoverageGoal: vi.fn().mockResolvedValue(detail),
    runCoverageGoal: vi.fn().mockResolvedValue({ ok: true, run_event_id: 'evt-1' }),
  };
}

describe('CoverageExpansionModal', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_COVERAGE_API_ENABLED', 'false');
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('renders the input form on mount and the history grid', async () => {
    const bridge = makeBridge();
    render(<CoverageExpansionModal onClose={() => {}} bridge={bridge} />);
    expect(screen.getByTestId('coverage-input-form')).toBeInTheDocument();
    // History grid loads from the mock dispatches list provided to it.
    await waitFor(() => expect(screen.getByTestId('agent-history-grid')).toBeInTheDocument());
  });

  it('end-to-end: input → dispatch → live → result → verify', async () => {
    const bridge = makeBridge();
    render(<CoverageExpansionModal onClose={() => {}} bridge={bridge} />);

    fireEvent.change(screen.getByTestId('coverage-goal-text'), {
      target: { value: 'Pittsburgh expansion target 50 leads' },
    });
    const metroInput = screen.getByTestId('coverage-metro-input');
    fireEvent.change(metroInput, { target: { value: 'Pittsburgh, PA' } });
    fireEvent.keyDown(metroInput, { key: 'Enter' });

    await act(async () => {
      fireEvent.click(screen.getByTestId('coverage-dispatch-button'));
    });

    expect(bridge.createCoverageGoal).toHaveBeenCalledTimes(1);
    expect(bridge.createDispatch).toHaveBeenCalledTimes(1);

    // Walk through the mock event timeline.
    const totalDelay = coverageMockLiveEvents.reduce((s, e) => s + e.delayMs, 0);
    await act(async () => {
      vi.advanceTimersByTime(totalDelay + 50);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByTestId('coverage-result-panel')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('coverage-commit-button')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('coverage-commit-button'));
    });

    expect(bridge.verifyDispatch).toHaveBeenCalledTimes(1);
    expect(bridge.runCoverageGoal).toHaveBeenCalledWith(PITTSBURGH_GOAL_ID);
    // After verify the modal flips to readOnly — commit button disappears.
    await waitFor(() => expect(screen.queryByTestId('coverage-commit-button')).toBeNull());
  });

  it('surfaces an error state when createCoverageGoal rejects', async () => {
    const bridge = makeBridge();
    bridge.createCoverageGoal = vi.fn().mockRejectedValue(new Error('upstream 502'));
    render(<CoverageExpansionModal onClose={() => {}} bridge={bridge} />);

    fireEvent.change(screen.getByTestId('coverage-goal-text'), {
      target: { value: 'Pittsburgh expansion target 50 leads' },
    });
    const metroInput = screen.getByTestId('coverage-metro-input');
    fireEvent.change(metroInput, { target: { value: 'Pittsburgh, PA' } });
    fireEvent.keyDown(metroInput, { key: 'Enter' });

    await act(async () => {
      fireEvent.click(screen.getByTestId('coverage-dispatch-button'));
    });

    expect(await screen.findByTestId('coverage-error')).toHaveTextContent(/upstream 502/);
  });

  it('clicking a verified history tile loads the prior run into the result panel', async () => {
    const bridge = makeBridge();
    render(<CoverageExpansionModal onClose={() => {}} bridge={bridge} />);
    await waitFor(() => expect(screen.getByTestId('agent-history-grid')).toBeInTheDocument());

    // Tiles sort newest-first; the verified Pittsburgh tile carries
    // result_payload.goal_id which the click handler depends on.
    const verifiedTile = screen
      .getAllByTestId('agent-tile')
      .find((el) => el.getAttribute('data-dispatch-status') === 'verified');
    expect(verifiedTile).toBeDefined();

    await act(async () => {
      fireEvent.click(verifiedTile!);
    });

    await waitFor(() =>
      expect(screen.getByTestId('coverage-result-panel')).toBeInTheDocument(),
    );
    expect(bridge.getCoverageGoal).toHaveBeenCalled();
  });
});
