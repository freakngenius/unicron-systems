import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentTile } from '../AgentTile';
import { AgentHistoryGrid } from '../AgentHistoryGrid';
import type { AgentDispatch, AgentDispatchStatus } from '../../../lib/contracts/agentConsole';

function fixture(overrides: Partial<AgentDispatch> = {}): AgentDispatch {
  return {
    id: crypto.randomUUID(),
    agent_name: 'test-agent',
    customer_org_id: 'zedcor',
    dispatched_by_user_id: null,
    input_payload: { summary: 'demo' },
    status: 'failed' as AgentDispatchStatus,
    result_payload: null,
    rejection_reason: null,
    verified_by_user_id: null,
    verified_at: null,
    cost_usd: 0.05,
    duration_ms: 1234,
    agent_run_id: null,
    parent_dispatch_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('AgentTile re-run button', () => {
  it('renders a Re-run button when status === failed and onRerun is provided', () => {
    const dispatch = fixture({ status: 'failed' });
    render(<AgentTile dispatch={dispatch} onRerun={() => {}} />);
    expect(screen.getByTestId('rerun-button')).toBeInTheDocument();
    expect(screen.getByTestId('rerun-button')).toHaveTextContent(/RE-RUN/i);
  });

  it('does NOT render the Re-run button for non-failed statuses', () => {
    const statuses: AgentDispatchStatus[] = [
      'queued',
      'running',
      'awaiting_review',
      'verified',
      'rejected',
    ];
    for (const status of statuses) {
      const { unmount } = render(
        <AgentTile dispatch={fixture({ status })} onRerun={() => {}} />,
      );
      expect(screen.queryByTestId('rerun-button')).toBeNull();
      unmount();
    }
  });

  it('does NOT render the Re-run button when no onRerun handler is supplied', () => {
    render(<AgentTile dispatch={fixture({ status: 'failed' })} />);
    expect(screen.queryByTestId('rerun-button')).toBeNull();
  });

  it('invokes onRerun with the dispatch when clicked, and does NOT bubble to onClick', () => {
    const onRerun = vi.fn();
    const onClick = vi.fn();
    const dispatch = fixture({ status: 'failed' });
    render(<AgentTile dispatch={dispatch} onClick={onClick} onRerun={onRerun} />);
    fireEvent.click(screen.getByTestId('rerun-button'));
    expect(onRerun).toHaveBeenCalledTimes(1);
    expect(onRerun).toHaveBeenCalledWith(dispatch);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('AgentHistoryGrid re-run wiring + filter chip', () => {
  it('exposes a "Failed only" filter chip that toggles the status filter', () => {
    const dispatches = [
      fixture({ status: 'verified' }),
      fixture({ status: 'failed' }),
      fixture({ status: 'failed' }),
    ];
    render(<AgentHistoryGrid agentName="test-agent" initialDispatches={dispatches} />);
    expect(screen.getAllByTestId('agent-tile')).toHaveLength(3);
    const chip = screen.getByTestId('failed-filter-chip');
    fireEvent.click(chip);
    const visible = screen.getAllByTestId('agent-tile');
    expect(visible).toHaveLength(2);
    visible.forEach((t) =>
      expect(t).toHaveAttribute('data-dispatch-status', 'failed'),
    );
  });

  it('the "Failed only" chip toggles back to "all" on a second click', () => {
    const dispatches = [
      fixture({ status: 'verified' }),
      fixture({ status: 'failed' }),
    ];
    render(<AgentHistoryGrid agentName="test-agent" initialDispatches={dispatches} />);
    const chip = screen.getByTestId('failed-filter-chip');
    fireEvent.click(chip);
    expect(screen.getAllByTestId('agent-tile')).toHaveLength(1);
    fireEvent.click(chip);
    expect(screen.getAllByTestId('agent-tile')).toHaveLength(2);
  });

  it('forwards onRerun to each tile so failed dispatches can be re-queued from the grid', () => {
    const onRerun = vi.fn();
    const failed = fixture({ status: 'failed' });
    render(
      <AgentHistoryGrid
        agentName="test-agent"
        initialDispatches={[failed, fixture({ status: 'verified' })]}
        onRerun={onRerun}
      />,
    );
    // Only the failed tile should have a re-run button.
    const buttons = screen.getAllByTestId('rerun-button');
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onRerun).toHaveBeenCalledWith(failed);
  });
});
