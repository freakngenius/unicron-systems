// __tests__/lib/searches/api.test.ts — basePath prefix regression test.
//
// SPEC: docs/SPEC-Fix-Search-BasePath.md.
// Asserts that all four client helpers in lib/searches/api target the
// basePath-prefixed path when no baseUrl override is provided, so the
// deployed app under basePath /pathfinder does not 404 on create + list.
// Also asserts the baseUrl override still wins for server callers.

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createSearch,
  getSearch,
  getSearchLeads,
  listSearches,
} from '@/lib/searches/api';

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('lib/searches/api basePath', () => {
  it('createSearch POSTs /pathfinder/api/searches when no baseUrl is provided', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ id: 'srch_x' }));
    await createSearch(
      {
        name: 'n',
        icp_text: 'icp',
        region: 'TX',
        radius_mi: 25,
      },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/pathfinder/api/searches');
    expect((init as RequestInit | undefined)?.method).toBe('POST');
  });

  it('listSearches GETs /pathfinder/api/searches when no baseUrl is provided', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ searches: [] }));
    await listSearches({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe('/pathfinder/api/searches');
  });

  it('getSearch GETs /pathfinder/api/searches/:id when no baseUrl is provided', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ saved_search: { id: 'srch_1' } }));
    await getSearch('srch_1', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe('/pathfinder/api/searches/srch_1');
  });

  it('getSearchLeads GETs /pathfinder/api/searches/:id/leads when no baseUrl is provided', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ leads: [] }));
    await getSearchLeads('srch_1', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe('/pathfinder/api/searches/srch_1/leads');
  });

  it('baseUrl override wins so server callers do not double-prefix basePath', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ searches: [] }));
    await listSearches({
      baseUrl: 'https://internal.unicron.systems/pathfinder',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://internal.unicron.systems/pathfinder/api/searches');
  });

  it('encodes ids that contain special characters', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ saved_search: { id: 'a/b c' } }));
    await getSearch('a/b c', { fetchImpl: fetchImpl as unknown as typeof fetch });
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe('/pathfinder/api/searches/a%2Fb%20c');
  });
});
