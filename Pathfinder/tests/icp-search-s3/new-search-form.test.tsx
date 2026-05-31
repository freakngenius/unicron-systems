// @vitest-environment jsdom
//
// Unit tests for components/search/NewSearchForm. Verifies the form POSTs
// the correct body to /api/searches and pushes the user to the per-search
// results route on success. Both fetch and next/navigation are mocked so
// the test is isolated from S1's API and the Next router.

import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
  }),
}));

import { NewSearchForm } from '@/components/search/NewSearchForm';

const originalFetch = global.fetch;

beforeEach(() => {
  mockPush.mockReset();
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('NewSearchForm', () => {
  it('renders the four fields and the submit button', () => {
    render(<NewSearchForm slug="internal" />);
    expect(screen.getByTestId('new-search-icp')).toBeInTheDocument();
    expect(screen.getByTestId('new-search-region')).toBeInTheDocument();
    expect(screen.getByTestId('new-search-radius')).toBeInTheDocument();
    expect(screen.getByTestId('new-search-name')).toBeInTheDocument();
    expect(screen.getByTestId('new-search-fit-notes')).toBeInTheDocument();
    expect(screen.getByTestId('new-search-submit')).toBeInTheDocument();
  });

  it('blocks submit and surfaces an error when ICP is empty', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<NewSearchForm slug="internal" />);
    fireEvent.change(screen.getByTestId('new-search-region'), { target: { value: 'Houston, TX' } });
    fireEvent.click(screen.getByTestId('new-search-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('new-search-error')).toHaveTextContent(/who you target/i);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the contract body to /api/searches and navigates to the new search', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'srch_abc' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<NewSearchForm slug="internal" />);

    fireEvent.change(screen.getByTestId('new-search-icp'), {
      target: { value: 'construction GCs running mobile job sites' },
    });
    fireEvent.change(screen.getByTestId('new-search-region'), { target: { value: 'Houston, TX' } });
    fireEvent.change(screen.getByTestId('new-search-radius'), { target: { value: '75' } });
    fireEvent.change(screen.getByTestId('new-search-name'), { target: { value: 'Houston GC hunt' } });
    fireEvent.change(screen.getByTestId('new-search-fit-notes'), {
      target: { value: 'prefer firms with 50+ employees' },
    });
    fireEvent.click(screen.getByTestId('new-search-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/pathfinder/api/searches');
    expect((init as RequestInit)?.method).toBe('POST');
    const body = JSON.parse((init as RequestInit)?.body as string);
    expect(body).toEqual({
      name: 'Houston GC hunt',
      icp_text: 'construction GCs running mobile job sites',
      region: 'Houston, TX',
      radius_mi: 75,
      fit_notes: 'prefer firms with 50+ employees',
    });

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/internal/searches/srch_abc'));
  });

  it('surfaces an error when the API returns non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('boom', { status: 500 }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<NewSearchForm slug="internal" />);
    fireEvent.change(screen.getByTestId('new-search-icp'), { target: { value: 'GCs' } });
    fireEvent.change(screen.getByTestId('new-search-region'), { target: { value: 'TX' } });
    fireEvent.click(screen.getByTestId('new-search-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('new-search-error')).toHaveTextContent(/500/);
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
