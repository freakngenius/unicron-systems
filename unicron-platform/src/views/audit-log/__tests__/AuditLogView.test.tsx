import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuditLogView } from '../AuditLogView';
import type { AgentDispatch } from '../../../lib/contracts/agentConsole';

vi.mock('../../../lib/agents/auditLogClient', async () => {
  const actual = await vi.importActual<
    typeof import('../../../lib/agents/auditLogClient')
  >('../../../lib/agents/auditLogClient');
  return {
    ...actual,
    listAuditLog: vi.fn(),
  };
});

import { listAuditLog } from '../../../lib/agents/auditLogClient';

const mockedList = listAuditLog as unknown as ReturnType<typeof vi.fn>;

const FIXTURE: AgentDispatch = {
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

beforeEach(() => {
  mockedList.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AuditLogView', () => {
  it('renders empty state when client returns zero rows', async () => {
    mockedList.mockResolvedValue({ rows: [], hasMore: false, page: 0 });
    render(<AuditLogView />);
    await waitFor(() => expect(screen.getByTestId('audit-log-empty')).toBeInTheDocument());
    expect(mockedList).toHaveBeenCalledTimes(1);
  });

  it('renders rows in a table when client returns dispatches', async () => {
    mockedList.mockResolvedValue({ rows: [FIXTURE], hasMore: false, page: 0 });
    render(<AuditLogView />);
    await waitFor(() => expect(screen.getByTestId('audit-log-table')).toBeInTheDocument());
    expect(screen.getAllByTestId('audit-log-row')).toHaveLength(1);
  });

  it('surfaces errors from the client without crashing', async () => {
    mockedList.mockRejectedValue(new Error('boom'));
    render(<AuditLogView />);
    await waitFor(() => expect(screen.getByTestId('audit-log-error')).toBeInTheDocument());
    expect(screen.getByTestId('audit-log-error').textContent).toContain('boom');
  });

  it('refetches when filters change and resets pagination', async () => {
    mockedList.mockResolvedValue({ rows: [FIXTURE], hasMore: false, page: 0 });
    render(<AuditLogView />);
    await waitFor(() => expect(screen.getByTestId('audit-log-table')).toBeInTheDocument());
    expect(mockedList).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByTestId('audit-log-filter-window'), {
      target: { value: '24h' },
    });

    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
    const lastCallArgs = mockedList.mock.calls[1][0];
    expect(lastCallArgs.window).toBe('24h');
    expect(lastCallArgs.page).toBe(0);
  });

  it('Next page button is enabled only when hasMore is true', async () => {
    mockedList.mockResolvedValue({ rows: [FIXTURE], hasMore: true, page: 0 });
    render(<AuditLogView />);
    await waitFor(() => expect(screen.getByTestId('audit-log-table')).toBeInTheDocument());
    const next = screen.getByTestId('audit-log-next-page') as HTMLButtonElement;
    expect(next.disabled).toBe(false);

    fireEvent.click(next);
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
    expect(mockedList.mock.calls[1][0].page).toBe(1);
  });

  it('Prev page button is disabled on first page', async () => {
    mockedList.mockResolvedValue({ rows: [FIXTURE], hasMore: true, page: 0 });
    render(<AuditLogView />);
    await waitFor(() => expect(screen.getByTestId('audit-log-table')).toBeInTheDocument());
    const prev = screen.getByTestId('audit-log-prev-page') as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
  });

  it('passes verified_by + agent_name filters to the client', async () => {
    mockedList.mockResolvedValue({ rows: [], hasMore: false, page: 0 });
    render(<AuditLogView />);
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId('audit-log-filter-verified-by'), {
      target: { value: 'kyle' },
    });
    fireEvent.change(screen.getByTestId('audit-log-filter-agent'), {
      target: { value: 'coverage-expansion' },
    });

    await waitFor(() => expect(mockedList.mock.calls.length).toBeGreaterThan(1));
    const last = mockedList.mock.calls[mockedList.mock.calls.length - 1][0];
    expect(last.verified_by).toBe('kyle');
    expect(last.agent_name).toBe('coverage-expansion');
  });
});
