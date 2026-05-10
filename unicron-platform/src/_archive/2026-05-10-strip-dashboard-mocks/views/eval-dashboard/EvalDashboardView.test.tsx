import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EvalDashboardView } from './EvalDashboardView';
import type { EvalRun } from '../../lib/evalDashboardClient';

const fixture: EvalRun[] = [
  {
    id: 1,
    agent_name: 'ranker',
    started_at: '2026-05-01T10:00:00Z',
    completed_at: '2026-05-01T10:00:30Z',
    status: 'success',
    error_message: null,
  },
  {
    id: 2,
    agent_name: 'ranker',
    started_at: '2026-05-02T10:00:00Z',
    completed_at: '2026-05-02T10:00:30Z',
    status: 'failed',
    error_message: 'rate_limited: openai 429',
  },
  {
    id: 3,
    agent_name: 'eval',
    started_at: '2026-05-03T10:00:00Z',
    completed_at: '2026-05-03T10:00:30Z',
    status: 'success',
    error_message: null,
  },
];

vi.mock('../../lib/evalDashboardClient', async () => {
  const actual = await vi.importActual<typeof import('../../lib/evalDashboardClient')>(
    '../../lib/evalDashboardClient',
  );
  return {
    ...actual,
    fetchEvalRuns: vi.fn(async () => fixture),
  };
});

describe('EvalDashboardView', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PATHFINDER_DB_ENABLED', 'false');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the skeleton on first paint and KPI cards once data lands', async () => {
    render(<EvalDashboardView />);
    expect(screen.getByTestId('eval-dashboard-skeleton')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('eval-dashboard-kpis')).toBeInTheDocument(),
    );
    // 3 fixture runs, all in window 'all' → total 3.
    // We stay loose on default-window filtering by switching to 'all'.
    fireEvent.click(screen.getByTestId('eval-dashboard-window-all'));
    await waitFor(() => expect(screen.getByTestId('eval-dashboard-kpis')).toHaveTextContent('3'));
    expect(screen.getByTestId('eval-dashboard-kpi-pass-rate')).toHaveTextContent('66.7%');
  });

  it('renders the chart and at least one series when data is present', async () => {
    render(<EvalDashboardView />);
    fireEvent.click(screen.getByTestId('eval-dashboard-window-all'));
    await waitFor(() =>
      expect(screen.getByTestId('eval-dashboard-chart')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('eval-dashboard-chart-series-ranker')).toBeInTheDocument();
  });

  it('lists the failure row for the failed ranker run', async () => {
    render(<EvalDashboardView />);
    fireEvent.click(screen.getByTestId('eval-dashboard-window-all'));
    await waitFor(() =>
      expect(screen.getAllByTestId('eval-dashboard-failure-row')).toHaveLength(1),
    );
    expect(screen.getByTestId('eval-dashboard-failure-row')).toHaveTextContent(
      'rate_limited: openai 429',
    );
  });

  it('filters by selected agent', async () => {
    render(<EvalDashboardView />);
    fireEvent.click(screen.getByTestId('eval-dashboard-window-all'));
    await waitFor(() => expect(screen.getByTestId('eval-dashboard-kpis')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('eval-dashboard-agent-eval'));
    // Only the eval success run remains: 1 total, 1 passed, 0 failed.
    await waitFor(() =>
      expect(screen.getByTestId('eval-dashboard-failures-empty')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('eval-dashboard-kpi-pass-rate')).toHaveTextContent('100.0%');
  });
});
