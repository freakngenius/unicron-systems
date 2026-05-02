import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentModalShell } from './AgentModalShell';
import type { AgentDefinition } from '../../lib/agentRegistry';

const TEST_AGENT: AgentDefinition = {
  name: 'test-agent',
  displayName: 'Test Agent',
  role: 'Verifies the shell renders',
  icon: '◇',
};

describe('AgentModalShell', () => {
  it('renders agent identity and idle status by default', () => {
    render(<AgentModalShell agent={TEST_AGENT} onClose={() => {}} />);
    expect(screen.getByText('Test Agent')).toBeInTheDocument();
    expect(screen.getByText('Verifies the shell renders')).toBeInTheDocument();
    expect(screen.getByTestId('agent-status-pill')).toHaveTextContent('IDLE');
  });

  it('reflects supplied status, cost, and recent runs count', () => {
    render(
      <AgentModalShell
        agent={TEST_AGENT}
        status="running"
        costUsd={0.4321}
        recentRunsCount={7}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('agent-status-pill')).toHaveTextContent('RUNNING');
    expect(screen.getByText(/\$0\.432/)).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('invokes onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(<AgentModalShell agent={TEST_AGENT} onClose={onClose} />);
    screen.getByLabelText('Close').click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('formats null cost as $0.000', () => {
    render(<AgentModalShell agent={TEST_AGENT} costUsd={null} onClose={() => {}} />);
    expect(screen.getByText('$0.000')).toBeInTheDocument();
  });
});
