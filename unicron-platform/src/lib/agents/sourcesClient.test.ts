import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { toggleBan } from './sourcesClient';
import { __resetEnvForTests } from '../env';

const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  __resetEnvForTests();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
  vi.stubEnv('VITE_SOURCE_BAN_ENABLED', 'false');
});

afterEach(() => {
  vi.unstubAllEnvs();
  global.fetch = ORIGINAL_FETCH;
});

describe('sourcesClient.toggleBan — graceful fallback (UI-only mode)', () => {
  it('returns the optimistic banned response without calling fetch when feature flag is off', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const res = await toggleBan({ source_id: 'src-1', ban_status: 'banned' });

    expect(res).toEqual({ ok: true, source_id: 'src-1', ban_status: 'banned' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns the optimistic active response when unbanning in fallback mode', async () => {
    const res = await toggleBan({ source_id: 'src-2', ban_status: 'active' });
    expect(res.ban_status).toBe('active');
    expect(res.source_id).toBe('src-2');
  });
});

describe('sourcesClient.toggleBan — real mode', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SOURCE_BAN_ENABLED', 'true');
    __resetEnvForTests();
  });

  it('POSTs to /api/sources/:id/ban-status with the ban_status body', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, source_id: 'src-9', ban_status: 'banned' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchSpy as unknown as typeof fetch;

    const res = await toggleBan({ source_id: 'src-9', ban_status: 'banned' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/internal/sources');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ source_id: 'src-9', ban_status: 'banned' });
    expect(res).toEqual({ ok: true, source_id: 'src-9', ban_status: 'banned' });
  });

  it('throws on non-2xx response', async () => {
    global.fetch = (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    await expect(toggleBan({ source_id: 'src-x', ban_status: 'banned' })).rejects.toThrow(
      /Sources API 500/,
    );
  });
});
