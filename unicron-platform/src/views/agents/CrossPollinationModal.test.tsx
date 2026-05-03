import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import {
  CrossPollinationModal,
  type CrossPollinationBridge,
} from './CrossPollinationModal';
import { crossPollinationMatchesMock } from '../../data/mocks';
import type { AgentDispatch } from '../../lib/contracts/agentConsole';

function makeDispatch(): AgentDispatch {
  return {
    id: 'disp-test',
    agent_name: 'cross-pollination',
    customer_org_id: 'zedcor',
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
  };
}

function makeBridge(): CrossPollinationBridge {
  return {
    createDispatch: vi.fn().mockResolvedValue(makeDispatch()),
    verifyDispatch: vi.fn().mockResolvedValue(makeDispatch()),
    listMatches: vi.fn().mockResolvedValue([...crossPollinationMatchesMock]),
  };
}

describe('CrossPollinationModal', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_CROSS_POLL_API_ENABLED', 'true'); // bridge-injected path
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('mounts to the input form', () => {
    const bridge = makeBridge();
    render(<CrossPollinationModal onClose={() => {}} bridge={bridge} />);
    expect(screen.getByTestId('cross-pollination-input-form')).toBeInTheDocument();
  });

  it('search dispatches and renders matches with bucket-coded rows', async () => {
    const bridge = makeBridge();
    render(<CrossPollinationModal onClose={() => {}} bridge={bridge} />);

    fireEvent.change(screen.getByTestId('cross-pollination-lead-input'), {
      target: { value: 'lead-pgh-3401, lead-hou-2207' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('cross-pollination-dispatch-button'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('cross-pollination-review')).toBeInTheDocument(),
    );

    const rows = screen.getAllByTestId('cross-pollination-row');
    expect(rows.length).toBe(crossPollinationMatchesMock.length);

    // Bucket distribution check
    const buckets = rows.map((r) => r.getAttribute('data-bucket'));
    expect(buckets).toContain('high');
    expect(buckets).toContain('ambiguous');
    expect(buckets).toContain('low');
  });

  it('high-confidence matches auto-verify on load', async () => {
    const bridge = makeBridge();
    render(<CrossPollinationModal onClose={() => {}} bridge={bridge} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('cross-pollination-dispatch-button'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('cross-pollination-review')).toBeInTheDocument(),
    );
    // High-bucket rows should carry the verified badge.
    const verified = screen.queryAllByTestId('cross-pollination-verified-badge');
    expect(verified.length).toBeGreaterThan(0);
  });

  it('Verify on an ambiguous match invokes bridge.verifyDispatch', async () => {
    const bridge = makeBridge();
    render(<CrossPollinationModal onClose={() => {}} bridge={bridge} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('cross-pollination-dispatch-button'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('cross-pollination-review')).toBeInTheDocument(),
    );

    const verifyButtons = screen.queryAllByTestId('cross-pollination-verify');
    expect(verifyButtons.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(verifyButtons[0]);
    });
    expect(bridge.verifyDispatch).toHaveBeenCalledTimes(1);
  });

  it('manual-match button is disabled with the schema-pending tooltip', async () => {
    const bridge = makeBridge();
    render(<CrossPollinationModal onClose={() => {}} bridge={bridge} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('cross-pollination-dispatch-button'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('cross-pollination-manual-match')).toBeInTheDocument(),
    );
    const btn = screen
      .getByTestId('cross-pollination-manual-match')
      .querySelector('button')!;
    expect(btn.hasAttribute('disabled')).toBe(true);
    expect(btn.getAttribute('title')).toMatch(/Pathfinder schema/);
  });

  it('failed listMatches surfaces the error', async () => {
    const bridge = makeBridge();
    bridge.listMatches = vi.fn().mockRejectedValue(new Error('rls denied'));
    render(<CrossPollinationModal onClose={() => {}} bridge={bridge} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('cross-pollination-dispatch-button'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('cross-pollination-error')).toHaveTextContent(/rls denied/),
    );
  });
});
