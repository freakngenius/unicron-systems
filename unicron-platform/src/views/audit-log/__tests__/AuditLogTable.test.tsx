import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditLogTable } from '../AuditLogTable';
import type { AgentDispatch } from '../../../lib/contracts/agentConsole';

const baseRow: AgentDispatch = {
  id: '11111111-2222-3333-4444-555555555555',
  agent_name: 'coverage-expansion',
  customer_org_id: 'zedcor',
  dispatched_by_user_id: null,
  input_payload: { prompt: 'Find adjacent contractors' },
  status: 'verified',
  result_payload: { summary: 'Found 12 prospects' },
  rejection_reason: null,
  verified_by_user_id: 'kyle@demystified.ai',
  verified_at: '2026-05-02T18:00:00Z',
  cost_usd: null,
  duration_ms: null,
  agent_run_id: null,
  parent_dispatch_id: null,
  created_at: '2026-05-02T17:55:00Z',
  updated_at: '2026-05-02T18:00:00Z',
};

describe('AuditLogTable', () => {
  it('renders empty state when no rows', () => {
    render(<AuditLogTable rows={[]} />);
    expect(screen.getByTestId('audit-log-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('audit-log-table')).not.toBeInTheDocument();
  });

  it('renders one row per dispatch with key columns', () => {
    render(<AuditLogTable rows={[baseRow]} />);
    expect(screen.getByTestId('audit-log-table')).toBeInTheDocument();
    const rows = screen.getAllByTestId('audit-log-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute('data-dispatch-id', baseRow.id);
    expect(screen.getByText('kyle@demystified.ai')).toBeInTheDocument();
    expect(screen.getByText('coverage-expansion')).toBeInTheDocument();
    expect(screen.getByText('zedcor')).toBeInTheDocument();
    expect(screen.getByText('Found 12 prospects')).toBeInTheDocument();
  });

  it('links the dispatch ID short form to /agents?dispatch=<id>', () => {
    render(<AuditLogTable rows={[baseRow]} />);
    const link = screen.getByTestId('audit-log-row-link');
    expect(link).toHaveAttribute('href', `/agents?dispatch=${baseRow.id}`);
    expect(link.textContent).toBe(baseRow.id.slice(0, 8));
  });

  it('renders an em-dash when verified_by is null', () => {
    const row = { ...baseRow, verified_by_user_id: null };
    render(<AuditLogTable rows={[row]} />);
    // First TD of the row should be em-dash
    const cell = screen.getByTestId('audit-log-row').querySelector('td');
    expect(cell?.textContent).toBe('—');
  });
});
