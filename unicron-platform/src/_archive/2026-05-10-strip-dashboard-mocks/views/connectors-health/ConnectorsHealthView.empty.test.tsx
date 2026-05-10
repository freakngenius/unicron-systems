import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Mock the client module BEFORE the SUT imports it. Vitest hoists vi.mock,
// so the SUT picks up the empty-rollup version on its static import.
vi.mock('../../../lib/agents/connectorsHealthClient', () => ({
  fetchConnectorsHealth: async () => ({
    generated_at: new Date().toISOString(),
    totals: { connectors: 0, customers: 0 },
    byType: { slack: 0, teams: 0, hubspot: 0, other: 0 },
    byStatus: {
      active: 0,
      pending: 0,
      expired: 0,
      error: 0,
      disconnected: 0,
      revoked: 0,
      unknown: 0,
    },
    errorRate24h: { total_events: 0, failed_events: 0, rate: 0 },
    mostRecentSuccessByConnector: [],
  }),
}));

import { ConnectorsHealthView } from '../ConnectorsHealthView';

describe('<ConnectorsHealthView /> — empty state', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PATHFINDER_DB_ENABLED', 'false');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders without crashing when no connectors are returned', async () => {
    render(<ConnectorsHealthView />);
    await waitFor(() => {
      expect(screen.getByTestId('connectors-recent-success-empty')).toBeInTheDocument();
    });
    expect(screen.getByTestId('connectors-error-rate-empty')).toBeInTheDocument();
    expect(screen.getByTestId('connectors-totals')).toBeInTheDocument();
  });
});
