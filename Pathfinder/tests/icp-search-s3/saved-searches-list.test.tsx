// @vitest-environment jsdom
//
// Unit tests for components/search/SavedSearchesList. Verifies the list
// fetches from GET /api/searches on mount, renders each row with the
// region + radius + status pill, and shows an honest empty state when no
// searches have been started yet.

import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { SavedSearchesList } from '@/components/search/SavedSearchesList';

const originalFetch = global.fetch;

beforeEach(() => {});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('SavedSearchesList', () => {
  it('renders rows from GET /api/searches with status pill and region', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          searches: [
            {
              id: 'srch_1',
              name: 'Houston GCs',
              icp_text: 'construction GCs',
              region: 'Houston, TX',
              radius_mi: 50,
              status: 'running',
              created_at: '2026-05-30T00:00:00Z',
            },
            {
              id: 'srch_2',
              name: 'Phoenix dealerships',
              icp_text: 'auto dealerships',
              region: 'Phoenix, AZ',
              radius_mi: 25,
              status: 'complete',
              created_at: '2026-05-28T00:00:00Z',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<SavedSearchesList slug="internal" />);

    await waitFor(() => expect(screen.getByTestId('saved-searches-rows')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/searches', expect.objectContaining({ cache: 'no-store' }));
    expect(screen.getByTestId('saved-search-row-srch_1')).toHaveTextContent('Houston GCs');
    expect(screen.getByTestId('saved-search-row-srch_1')).toHaveTextContent('Houston, TX');
    expect(screen.getByTestId('saved-search-row-srch_1')).toHaveTextContent('50 mi');
    expect(screen.getByTestId('saved-search-row-srch_1').getAttribute('href')).toBe(
      '/internal/searches/srch_1',
    );
    expect(screen.getByTestId('saved-search-status-running')).toHaveTextContent(/Running/i);
    expect(screen.getByTestId('saved-search-status-complete')).toHaveTextContent(/Complete/i);
  });

  it('shows the honest empty state when the API returns no searches', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ searches: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<SavedSearchesList slug="internal" />);
    await waitFor(() => expect(screen.getByTestId('saved-searches-empty')).toBeInTheDocument());
    expect(screen.getByTestId('saved-searches-empty')).toHaveTextContent(/no searches yet/i);
  });

  it('surfaces an error pill when the API errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<SavedSearchesList slug="internal" />);
    await waitFor(() => expect(screen.getByTestId('saved-searches-error')).toBeInTheDocument());
    expect(screen.getByTestId('saved-searches-error')).toHaveTextContent(/500/);
  });
});
