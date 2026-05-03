import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ArchitectModal, type ArchitectBridge } from './ArchitectModal';
import {
  architectDecompositionMock,
  architectTuningMock,
  architectDiscoveryMock,
} from '../../data/mocks';
import type { AgentDispatch } from '../../lib/contracts/agentConsole';

function makeDispatch(overrides: Partial<AgentDispatch> = {}): AgentDispatch {
  return {
    id: 'disp-test',
    agent_name: 'architect',
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

function makeBridge(): ArchitectBridge {
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
    postArchitectDecompose: vi.fn().mockResolvedValue(architectDecompositionMock),
    postArchitectTune: vi.fn().mockResolvedValue(architectTuningMock),
    postArchitectDiscover: vi.fn().mockResolvedValue(architectDiscoveryMock),
  };
}

describe('ArchitectModal', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_ARCHITECT_API_ENABLED', 'true'); // bridge-injected path
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('mounts with three mode tabs', () => {
    const bridge = makeBridge();
    render(<ArchitectModal onClose={() => {}} bridge={bridge} />);
    expect(screen.getByTestId('architect-mode-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('architect-mode-decomposition')).toBeInTheDocument();
    expect(screen.getByTestId('architect-mode-tuning')).toBeInTheDocument();
    expect(screen.getByTestId('architect-mode-discovery')).toBeInTheDocument();
  });

  it('Decomposition mode validates prompt length', async () => {
    const bridge = makeBridge();
    render(<ArchitectModal onClose={() => {}} bridge={bridge} />);
    fireEvent.change(screen.getByTestId('architect-decomposition-prompt'), {
      target: { value: 'short' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('architect-dispatch-button'));
    });
    expect(screen.getByTestId('architect-form-error')).toHaveTextContent(/at least 10/i);
    expect(bridge.postArchitectDecompose).not.toHaveBeenCalled();
  });

  it('Decomposition mode dispatches and renders the architecture result', async () => {
    const bridge = makeBridge();
    render(<ArchitectModal onClose={() => {}} bridge={bridge} />);
    fireEvent.change(screen.getByTestId('architect-decomposition-prompt'), {
      target: { value: 'distributors of construction-site security want new commercial builds' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('architect-dispatch-button'));
    });
    await act(async () => {
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(bridge.postArchitectDecompose).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('architect-decomposition-result')).toBeInTheDocument(),
    );
  });

  it('Tuning mode dispatches with feedback_window_days', async () => {
    const bridge = makeBridge();
    render(<ArchitectModal onClose={() => {}} bridge={bridge} />);
    fireEvent.click(screen.getByTestId('architect-mode-tuning'));
    fireEvent.change(screen.getByTestId('architect-tuning-window'), {
      target: { value: '30' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('architect-dispatch-button'));
    });
    await act(async () => {
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(bridge.postArchitectTune).toHaveBeenCalledTimes(1));
    expect((bridge.postArchitectTune as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({
      vertical_id: 'pathfinder-default',
      feedback_window_days: 30,
    });
    await waitFor(() => expect(screen.getByTestId('architect-tuning-result')).toBeInTheDocument());
    expect(screen.getAllByTestId('architect-tuning-row').length).toBeGreaterThan(0);
  });

  it('Discovery mode dispatches with optional geographic_focus context', async () => {
    const bridge = makeBridge();
    render(<ArchitectModal onClose={() => {}} bridge={bridge} />);
    fireEvent.click(screen.getByTestId('architect-mode-discovery'));
    fireEvent.change(screen.getByTestId('architect-discovery-geo'), {
      target: { value: 'Pittsburgh metro' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('architect-dispatch-button'));
    });
    await act(async () => {
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(bridge.postArchitectDiscover).toHaveBeenCalledTimes(1));
    expect(
      (bridge.postArchitectDiscover as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
        .context,
    ).toEqual({
      geographic_focus: 'Pittsburgh metro',
    });
    await waitFor(() =>
      expect(screen.getByTestId('architect-discovery-result')).toBeInTheDocument(),
    );
    expect(screen.getAllByTestId('architect-discovery-row').length).toBeGreaterThan(0);
  });
});
