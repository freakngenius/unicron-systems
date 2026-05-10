import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ConnectorsHealthView } from '../ConnectorsHealthView';

// Use mock-mode (the default branch reads from connectorsHealthMock).
beforeEach(() => {
  vi.stubEnv('VITE_PATHFINDER_DB_ENABLED', 'false');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('<ConnectorsHealthView />', () => {
  it('renders skeleton then dashboard cards from the mock fixture', async () => {
    render(<ConnectorsHealthView />);
    expect(screen.getByTestId('connectors-health-skeleton')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('connectors-totals')).toBeInTheDocument();
    });
    expect(screen.getByTestId('connectors-by-type')).toBeInTheDocument();
    expect(screen.getByTestId('connectors-by-status')).toBeInTheDocument();
    expect(screen.getByTestId('connectors-error-rate')).toBeInTheDocument();
    expect(screen.getByTestId('connectors-recent-success')).toBeInTheDocument();
  });

  it('refresh button is present and clickable', async () => {
    render(<ConnectorsHealthView />);
    const btn = await screen.findByTestId('connectors-health-refresh');
    expect(btn).toBeInTheDocument();
  });
});

