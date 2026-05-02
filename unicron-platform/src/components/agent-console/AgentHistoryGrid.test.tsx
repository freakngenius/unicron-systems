import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentHistoryGrid } from './AgentHistoryGrid';
import type { AgentDispatch } from '../../lib/contracts/agentConsole';

function fixture(overrides: Partial<AgentDispatch> = {}): AgentDispatch {
  return {
    id: crypto.randomUUID(),
    agent_name: 'test-agent',
    customer_org_id: 'zedcor',
    dispatched_by_user_id: null,
    input_payload: { summary: 'demo' },
    status: 'verified',
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

describe('AgentHistoryGrid', () => {
  it('shows the empty state when no dispatches are returned', () => {
    render(<AgentHistoryGrid agentName="test-agent" initialDispatches={[]} />);
    expect(screen.getByText(/NO RUNS YET/)).toBeInTheDocument();
  });

  it('renders one tile per dispatch when initialDispatches provided', () => {
    const dispatches = [
      fixture({ status: 'verified', cost_usd: 0.05 }),
      fixture({ status: 'rejected', cost_usd: 0.1 }),
      fixture({ status: 'failed', cost_usd: 0.2 }),
    ];
    render(<AgentHistoryGrid agentName="test-agent" initialDispatches={dispatches} />);
    expect(screen.getAllByTestId('agent-tile')).toHaveLength(3);
  });

  it('filters by status when the status filter changes', () => {
    const dispatches = [
      fixture({ status: 'verified' }),
      fixture({ status: 'rejected' }),
      fixture({ status: 'failed' }),
    ];
    render(<AgentHistoryGrid agentName="test-agent" initialDispatches={dispatches} />);
    expect(screen.getAllByTestId('agent-tile')).toHaveLength(3);
    const statusSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(statusSelect, { target: { value: 'verified' } });
    expect(screen.getAllByTestId('agent-tile')).toHaveLength(1);
    expect(screen.getByTestId('agent-tile')).toHaveAttribute(
      'data-dispatch-status',
      'verified',
    );
  });

  it('sorts by cost descending when the sort key is cost', () => {
    const cheap = fixture({ cost_usd: 0.01 });
    const mid = fixture({ cost_usd: 0.5 });
    const expensive = fixture({ cost_usd: 1.5 });
    render(
      <AgentHistoryGrid
        agentName="test-agent"
        initialDispatches={[cheap, mid, expensive]}
      />,
    );
    const sortSelect = screen.getAllByRole('combobox')[1];
    fireEvent.change(sortSelect, { target: { value: 'cost' } });
    const tiles = screen.getAllByTestId('agent-tile');
    expect(tiles[0]).toHaveAttribute('data-dispatch-id', expensive.id);
    expect(tiles[1]).toHaveAttribute('data-dispatch-id', mid.id);
    expect(tiles[2]).toHaveAttribute('data-dispatch-id', cheap.id);
  });
});
