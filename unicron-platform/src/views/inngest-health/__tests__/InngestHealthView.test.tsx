import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { InngestHealthView } from '../InngestHealthView';

// Default to mock-mode (the client falls back to inngestHealthMock()).
beforeEach(() => {
  vi.stubEnv('VITE_INNGEST_HEALTH_LIVE', 'false');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('<InngestHealthView />', () => {
  it('renders skeleton then dashboard from the mock fixture', async () => {
    render(<InngestHealthView />);
    expect(screen.getByTestId('inngest-health-skeleton')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('inngest-totals')).toBeInTheDocument();
    });

    expect(screen.getByTestId('inngest-functions')).toBeInTheDocument();

    // The mock has the architect-proposal-evaluator failing 3/4 in last 24h.
    const rows = screen.getAllByTestId('inngest-function-row');
    expect(rows.length).toBeGreaterThan(0);
    const redRow = rows.find((r) => r.getAttribute('data-tone') === 'red');
    expect(redRow).toBeTruthy();
    expect(redRow?.getAttribute('data-function-id')).toBe(
      'metacron/architect-proposal-evaluator',
    );
  });

  it('renders refresh button', async () => {
    render(<InngestHealthView />);
    const btn = await screen.findByTestId('inngest-health-refresh');
    expect(btn).toBeInTheDocument();
  });
});
