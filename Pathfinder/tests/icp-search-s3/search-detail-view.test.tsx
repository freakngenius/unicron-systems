// @vitest-environment jsdom
//
// Unit tests for app/[slug]/searches/[id]/SearchDetailView. The S4 seam
// (components/search/SearchProgress) is mocked so the test does not
// depend on the live SearchProgress polling logic. Fetch is also mocked
// to return canned saved-search + leads responses.

import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('@/components/search/SearchProgress', () => ({
  __esModule: true,
  SearchProgress: ({ searchId }: { searchId: string }) => (
    <div data-testid="mocked-search-progress" data-search-id={searchId}>
      mocked-progress
    </div>
  ),
  default: ({ searchId }: { searchId: string }) => (
    <div data-testid="mocked-search-progress" data-search-id={searchId}>
      mocked-progress
    </div>
  ),
}));

// CompanyLeadCard depends on Next Link which is fine under jsdom; no mock
// needed. ProjectToCompanyLeadView is pure and tolerates partials.

import { SearchDetailView } from '@/app/[slug]/searches/[id]/SearchDetailView';

const originalFetch = global.fetch;

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function makeFetchMock(detail: unknown, leads: unknown) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : (input as Request).url ?? String(input);
    if (url.endsWith('/leads')) {
      return new Response(JSON.stringify(leads), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(detail), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

describe('SearchDetailView', () => {
  it('mounts the mocked SearchProgress and renders scoped leads', async () => {
    const detail = {
      saved_search: {
        id: 'srch_1',
        name: 'Houston GCs',
        icp_text: 'construction GCs',
        region: 'Houston, TX',
        radius_mi: 50,
        status: 'complete',
        created_at: '2026-05-30T00:00:00Z',
      },
      latest_run: {
        status: 'complete',
        phase: 'score',
        progress: null,
        stats: { scored: 5, verified: 3 },
      },
    };
    const leads = {
      leads: [
        { id: 'p1', title: 'Acme Builders', score: 84, raw_payload: {} },
        { id: 'p2', title: 'Lone Star GC', score: 78, raw_payload: {} },
        { id: 'p3', title: 'Bayou Construction', score: 71, raw_payload: {} },
        { id: 'p4', title: 'Gulf Coast Builders', score: 66, raw_payload: {} },
      ],
    };
    global.fetch = makeFetchMock(detail, leads) as unknown as typeof fetch;

    render(<SearchDetailView slug="internal" id="srch_1" />);

    await waitFor(() => expect(screen.getByTestId('mocked-search-progress')).toBeInTheDocument());
    expect(screen.getByTestId('mocked-search-progress').getAttribute('data-search-id')).toBe('srch_1');

    await waitFor(() => expect(screen.getByTestId('search-detail-leads-grid')).toBeInTheDocument());
    expect(screen.getByTestId('search-detail-summary')).toHaveTextContent('Houston, TX');
    expect(screen.getByTestId('search-detail-summary')).toHaveTextContent('50 mi');
    expect(screen.getByTestId('search-detail-leads-grid')).toHaveTextContent('Acme Builders');
    expect(screen.getByTestId('search-detail-leads-grid')).toHaveTextContent('Lone Star GC');

    // Deep links into the existing catalog surfaces preserve saved_search_id.
    const companiesLink = screen.getByTestId('search-detail-link-companies');
    expect(companiesLink.getAttribute('href')).toBe('/internal/leads?saved_search_id=srch_1');
    const pipelineLink = screen.getByTestId('search-detail-link-pipeline');
    expect(pipelineLink.getAttribute('href')).toBe('/internal/pipeline?saved_search_id=srch_1');
  });

  it('shows the honest limited-sources note when complete with few leads', async () => {
    const detail = {
      saved_search: {
        id: 'srch_thin',
        name: 'Niche ICP',
        icp_text: 'rare profile',
        region: 'Boise, ID',
        radius_mi: 100,
        status: 'complete',
        created_at: '2026-05-30T00:00:00Z',
      },
      latest_run: { status: 'complete', phase: 'score', progress: null, stats: { scored: 1 } },
    };
    const leads = { leads: [{ id: 'p1', title: 'Lone Result', score: 55, raw_payload: {} }] };
    global.fetch = makeFetchMock(detail, leads) as unknown as typeof fetch;

    render(<SearchDetailView slug="internal" id="srch_thin" />);
    await waitFor(() => expect(screen.getByTestId('search-detail-leads-limited')).toBeInTheDocument());
    expect(screen.getByTestId('search-detail-leads-limited')).toHaveTextContent(/limited sources/i);
  });

  it('shows the still-running cue when the run has not completed', async () => {
    const detail = {
      saved_search: {
        id: 'srch_2',
        name: 'In progress',
        icp_text: 'icp',
        region: 'TX',
        radius_mi: 25,
        status: 'running',
        created_at: '2026-05-30T00:00:00Z',
      },
      latest_run: { status: 'running', phase: 'scrape', progress: null, stats: null },
    };
    const leads = { leads: [{ id: 'p1', title: 'Early lead', score: 72, raw_payload: {} }] };
    global.fetch = makeFetchMock(detail, leads) as unknown as typeof fetch;

    render(<SearchDetailView slug="internal" id="srch_2" />);
    await waitFor(() => expect(screen.getByTestId('search-detail-still-running')).toBeInTheDocument());
  });

  it('shows the honest empty state when the run is complete with zero leads', async () => {
    const detail = {
      saved_search: {
        id: 'srch_empty',
        name: 'No matches',
        icp_text: 'icp',
        region: 'AK',
        radius_mi: 1000,
        status: 'complete',
        created_at: '2026-05-30T00:00:00Z',
      },
      latest_run: { status: 'complete', phase: 'score', progress: null, stats: { scored: 0 } },
    };
    const leads = { leads: [] };
    global.fetch = makeFetchMock(detail, leads) as unknown as typeof fetch;

    render(<SearchDetailView slug="internal" id="srch_empty" />);
    await waitFor(() => expect(screen.getByTestId('search-detail-leads-empty')).toBeInTheDocument());
    expect(screen.getByTestId('search-detail-leads-empty')).toHaveTextContent(/limited sources/i);
  });
});
