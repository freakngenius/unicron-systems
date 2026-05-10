import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CostDashboardView } from './CostDashboardView';

// recharts uses ResizeObserver / SVG measurement that jsdom doesn't fully
// emulate. Stub ResponsiveContainer to a div so children render synchronously.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="rc-responsive" style={{ width: 600, height: 200 }}>
        {children}
      </div>
    ),
  };
});

// Force the cost client into mock-mode regardless of test env.
beforeEach(() => {
  vi.stubEnv('VITE_PATHFINDER_DB_ENABLED', 'false');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('CostDashboardView', () => {
  it('renders skeleton then dashboard body with mocked fixture data', async () => {
    render(<CostDashboardView />);
    expect(screen.getByTestId('cost-dashboard-skeleton')).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByTestId('cost-dashboard-body')).toBeInTheDocument(),
    );

    expect(screen.getByTestId('cost-kpis')).toBeInTheDocument();
    expect(screen.getByTestId('cost-trend-card')).toBeInTheDocument();
    expect(screen.getByTestId('cost-by-agent-card')).toBeInTheDocument();
    expect(screen.getByTestId('cost-by-customer-card')).toBeInTheDocument();
    expect(screen.getByTestId('cost-by-model-card')).toBeInTheDocument();
    expect(screen.getByTestId('cost-by-provider-card')).toBeInTheDocument();
  });

  it('default window is 7d', async () => {
    render(<CostDashboardView />);
    await waitFor(() =>
      expect(screen.getByTestId('cost-dashboard-body')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('cost-window-7d')).toHaveAttribute('aria-checked', 'true');
  });

  it('changing window re-renders and toggles the aria-checked state', async () => {
    render(<CostDashboardView />);
    await waitFor(() =>
      expect(screen.getByTestId('cost-dashboard-body')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId('cost-window-30d'));
    await waitFor(() =>
      expect(screen.getByTestId('cost-window-30d')).toHaveAttribute('aria-checked', 'true'),
    );
    expect(screen.getByTestId('cost-window-7d')).toHaveAttribute('aria-checked', 'false');
  });

  it('renders the per-customer breakdown showing the mocked Zedcor row', async () => {
    render(<CostDashboardView />);
    await waitFor(() =>
      expect(screen.getByTestId('cost-by-customer-card')).toBeInTheDocument(),
    );
    const card = screen.getByTestId('cost-by-customer-card');
    expect(card.textContent ?? '').toContain('zedcor');
  });
});
