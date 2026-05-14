import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSkillsSearch } from '../skillsApi';
import { makeSearchResult } from './fixtures';

vi.mock('../../../../lib/supabase', () => ({
  getSupabase: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  }),
}));

describe('useSkillsSearch', () => {
  const originalFetch = global.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns empty results and stays idle for empty query', async () => {
    const { result } = renderHook(() => useSkillsSearch('   '));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips the network call when enabled is false', async () => {
    const { result } = renderHook(() =>
      useSkillsSearch('zedcor digest', { enabled: false }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
  });

  it('posts to /api/skills/search with the query and returns parsed results', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        query: 'zedcor digest',
        results: [
          makeSearchResult({ id: 's1', name: 'run_zedcor_weekly_digest' }, 0.93),
          makeSearchResult({ id: 's2', name: 'draft_briefing_for_bd_rep' }, 0.81),
        ],
      }),
    });

    const { result } = renderHook(() => useSkillsSearch('zedcor digest'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/skills/search');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.query).toBe('zedcor digest');
    expect(body.top_k).toBe(3);
    expect(body.lifecycle_status).toBe('approved');

    expect(result.current.results).toHaveLength(2);
    expect(result.current.results[0].skill.name).toBe('run_zedcor_weekly_digest');
  });

  it('surfaces fetch errors on the error field', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({}),
    });
    const { result } = renderHook(() => useSkillsSearch('zedcor'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/502/);
    expect(result.current.results).toEqual([]);
  });

  it('tolerates a malformed response shape (no results key)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ query: 'zedcor' }),
    });
    const { result } = renderHook(() => useSkillsSearch('zedcor'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.results).toEqual([]);
  });
});
