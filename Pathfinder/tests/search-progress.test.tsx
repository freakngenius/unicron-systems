// @vitest-environment jsdom
//
// Unit tests for components/search/SearchProgress (ICP Saved Search, S4).
// Spec: Pathfinder/docs/SPEC-ICP-Search.md § Stream slices · S4.
//
// The component reads GET /api/searches/:id over HTTP. These tests inject a
// mocked fetcher via the `fetcher` prop so the suite never touches the
// network and stays decoupled from S1.

import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import {
  SearchProgress,
  type SearchProgressPayload,
} from '@/components/search/SearchProgress';

const PHASE_KEYS = ['interpret', 'geo', 'sources', 'wire', 'scrape', 'score'] as const;

function makePayload(over: Partial<SearchProgressPayload> = {}): SearchProgressPayload {
  return {
    saved_search: {
      id: 'ss_test_1',
      name: 'Mid-market construction security ops',
      icp_text: 'Construction GCs running multi-month jobsites',
      region: 'Greater Houston',
      radius_mi: 75,
      status: 'running',
      source_plan: {
        tier1: [{ source_id: 'sam.gov' }, { source_id: 'usaspending' }],
        tier2: [{ source_id: 'harris-county' }],
        tier3: [],
      },
      ...over.saved_search,
    },
    latest_run: {
      status: 'running',
      phase: 'wire',
      progress: {
        phases: [
          { key: 'interpret', label: 'Interpret ICP', status: 'done', detail: 'Architect parsed ICP.' },
          { key: 'geo', label: 'Resolve geography', status: 'done', detail: 'Harris + Fort Bend + Montgomery.' },
          { key: 'sources', label: 'Plan sources', status: 'done', detail: '3 sources wired.' },
          { key: 'wire', label: 'Wire and scrape', status: 'running', detail: 'sam.gov backfill (page 4 of 12).' },
          { key: 'scrape', label: 'Ingest companies', status: 'pending', detail: null },
          { key: 'score', label: 'Score and verify', status: 'pending', detail: null },
        ],
      },
      stats: { sources_found: 3, companies_ingested: 117, scored: 0, verified: 0 },
      ...over.latest_run,
    },
  };
}

afterEach(() => {
  cleanup();
});

describe('SearchProgress', () => {
  it('renders all six phases in canonical order', async () => {
    const payload = makePayload();
    const fetcher = vi.fn().mockResolvedValue(payload);

    render(<SearchProgress searchId="ss_test_1" fetcher={fetcher} />);

    await waitFor(() => expect(fetcher).toHaveBeenCalledWith('ss_test_1'));

    const ol = await screen.findByTestId('search-progress-phases');
    const rows = ol.querySelectorAll('li');
    expect(rows).toHaveLength(PHASE_KEYS.length);
    PHASE_KEYS.forEach((key, i) => {
      expect(rows[i].getAttribute('data-testid')).toBe(`search-progress-phase-${key}`);
    });

    // The identity header is suppressed by default to avoid duplicating the
    // page header in SearchDetailView (SPEC-Fix-Search-Header-Dup).
    expect(screen.queryByTestId('search-progress-name')).not.toBeInTheDocument();
  });

  it('renders the optional identity header when showHeader is true', async () => {
    const fetcher = vi.fn().mockResolvedValue(makePayload());
    render(<SearchProgress searchId="ss_test_1" fetcher={fetcher} showHeader />);

    await waitFor(() =>
      expect(screen.getByTestId('search-progress-name')).toHaveTextContent(
        'Mid-market construction security ops',
      ),
    );
  });

  it('renders running and pending phase statuses correctly', async () => {
    const fetcher = vi.fn().mockResolvedValue(makePayload());
    render(<SearchProgress searchId="ss_test_1" fetcher={fetcher} />);

    // findByTestId resolves as soon as the testid exists (default pending state),
    // which races the fetcher resolution under loaded CI. waitFor polls until
    // the status text actually updates.
    await waitFor(() =>
      expect(screen.getByTestId('search-progress-phase-wire-status')).toHaveTextContent('RUNNING'),
    );
    expect(screen.getByTestId('search-progress-phase-scrape-status')).toHaveTextContent('PENDING');
    expect(screen.getByTestId('search-progress-phase-interpret-status')).toHaveTextContent('DONE');
  });

  it('renders run stats with localized numbers and em-dash for missing values', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      makePayload({
        latest_run: {
          status: 'running',
          phase: 'scrape',
          progress: { phases: [] },
          stats: { sources_found: 4, companies_ingested: 1234, scored: null, verified: undefined },
        },
      }),
    );

    render(<SearchProgress searchId="ss_test_1" fetcher={fetcher} />);

    expect(await screen.findByTestId('stat-sources-found')).toHaveTextContent('4');
    expect(screen.getByTestId('stat-companies-ingested')).toHaveTextContent('1,234');
    expect(screen.getByTestId('stat-scored')).toHaveTextContent('—');
    expect(screen.getByTestId('stat-verified')).toHaveTextContent('—');
  });

  it('shows the "limited sources" advisory when the source plan is thin', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      makePayload({
        saved_search: {
          id: 'ss_test_1',
          name: 'Thin profile',
          icp_text: 'Niche private SMB with no public footprint',
          region: 'Boise',
          radius_mi: 25,
          status: 'running',
          source_plan: { tier1: [], tier2: [], tier3: [{ candidate: 'unknown' }] },
        },
      }),
    );

    render(<SearchProgress searchId="ss_test_1" fetcher={fetcher} />);

    expect(await screen.findByTestId('search-progress-limited-note')).toBeInTheDocument();
  });

  it('shows the "limited sources" advisory when any phase failed', async () => {
    const payload = makePayload();
    payload.latest_run!.progress!.phases![3] = {
      key: 'wire',
      label: 'Wire and scrape',
      status: 'failed',
      detail: 'sam.gov returned 503 after three retries.',
    };
    const fetcher = vi.fn().mockResolvedValue(payload);

    render(<SearchProgress searchId="ss_test_1" fetcher={fetcher} />);

    expect(await screen.findByTestId('search-progress-phase-wire-status')).toHaveTextContent('FAILED');
    expect(screen.getByTestId('search-progress-limited-note')).toBeInTheDocument();
  });

  it('does NOT show the advisory when the plan is healthy and no phase failed', async () => {
    const fetcher = vi.fn().mockResolvedValue(makePayload());
    render(<SearchProgress searchId="ss_test_1" fetcher={fetcher} />);
    await screen.findByTestId('search-progress-phase-wire-status');
    expect(screen.queryByTestId('search-progress-limited-note')).not.toBeInTheDocument();
  });

  it('renders the done state with a results link when the run is complete', async () => {
    const payload = makePayload({
      latest_run: {
        status: 'complete',
        phase: 'score',
        progress: {
          phases: PHASE_KEYS.map(key => ({ key, label: key, status: 'done', detail: null })),
        },
        stats: { sources_found: 4, companies_ingested: 211, scored: 38, verified: 22 },
      },
    });
    const fetcher = vi.fn().mockResolvedValue(payload);

    render(<SearchProgress searchId="ss_done" fetcher={fetcher} />);

    const link = await screen.findByTestId('search-progress-results-link');
    expect(link).toHaveAttribute('href', '/pathfinder/internal/searches/ss_done/leads');
    expect(screen.getByTestId('search-progress-done')).toHaveTextContent('38 scored, 22 verified');
  });

  it('uses a custom resultsHref when provided', async () => {
    const payload = makePayload({
      latest_run: {
        status: 'complete',
        phase: 'score',
        progress: { phases: [] },
        stats: { sources_found: 1, companies_ingested: 1, scored: 1, verified: 1 },
      },
    });
    const fetcher = vi.fn().mockResolvedValue(payload);

    render(
      <SearchProgress
        searchId="ss_custom"
        fetcher={fetcher}
        resultsHref={id => `/custom/${id}`}
      />,
    );

    const link = await screen.findByTestId('search-progress-results-link');
    expect(link).toHaveAttribute('href', '/custom/ss_custom');
  });

  it('calls onComplete once when the run reaches a terminal status', async () => {
    const onComplete = vi.fn();
    const payload = makePayload({
      latest_run: {
        status: 'complete',
        phase: 'score',
        progress: { phases: [] },
        stats: { sources_found: 1, companies_ingested: 1, scored: 1, verified: 1 },
      },
    });
    const fetcher = vi.fn().mockResolvedValue(payload);

    render(
      <SearchProgress searchId="ss_oc" fetcher={fetcher} onComplete={onComplete} />,
    );

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith(payload);
  });

  it('polls on the configured interval until status is terminal', async () => {
    const running = makePayload();
    const complete = makePayload({
      latest_run: {
        status: 'complete',
        phase: 'score',
        progress: { phases: [] },
        stats: { sources_found: 2, companies_ingested: 5, scored: 5, verified: 4 },
      },
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(running)
      .mockResolvedValue(complete);

    render(<SearchProgress searchId="ss_poll" fetcher={fetcher} pollMs={50} />);

    await waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(3), {
      timeout: 2000,
    });

    await waitFor(
      () => expect(screen.getByTestId('search-progress-done')).toBeInTheDocument(),
      { timeout: 2000 },
    );

    const callsAfterTerminal = fetcher.mock.calls.length;
    await new Promise(r => setTimeout(r, 250));
    expect(fetcher.mock.calls.length).toBe(callsAfterTerminal);
  });

  it('shows the error state on first failed fetch and keeps retrying', async () => {
    const ok = makePayload();
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(ok);

    render(<SearchProgress searchId="ss_err" fetcher={fetcher} pollMs={50} />);

    expect(await screen.findByTestId('search-progress-error')).toHaveTextContent('boom');

    await waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2), {
      timeout: 2000,
    });
    await waitFor(() => expect(screen.queryByTestId('search-progress-error')).not.toBeInTheDocument(), {
      timeout: 2000,
    });
  });

  it('paints from initialPayload before the first fetch resolves', async () => {
    const seed = makePayload();
    let resolveFetch: (v: SearchProgressPayload) => void = () => {};
    const fetcher = vi.fn(
      () =>
        new Promise<SearchProgressPayload>(resolve => {
          resolveFetch = resolve;
        }),
    );

    render(
      <SearchProgress
        searchId="ss_seed"
        fetcher={fetcher}
        initialPayload={seed}
      />,
    );

    expect(screen.getByTestId('search-progress-phase-wire-status')).toHaveTextContent('RUNNING');
    expect(screen.getByTestId('stat-companies-ingested')).toHaveTextContent('117');
    resolveFetch(seed);
  });
});
