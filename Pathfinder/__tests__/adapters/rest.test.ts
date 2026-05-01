// __tests__/adapters/rest.test.ts — Phase 2 Stream E.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { restAdapter } from '@/lib/adapters/rest';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('rest adapter', () => {
  it('extracts records via results_path dotted lookup', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => '',
      json: async () => ({ data: { results: [{ id: '1', timestamp: '2024-05-01' }] } }),
    }));
    // @ts-expect-error stub
    global.fetch = fetchSpy;
    const records = await restAdapter.poll({
      endpoint: 'https://api.example.com/v1/things',
      jurisdiction: 'federal',
      results_path: 'data.results',
    } as Parameters<typeof restAdapter.poll>[0]);
    expect(records).toHaveLength(1);
  });

  it('falls back to common envelope keys (results / data / items)', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => '',
      json: async () => ({ items: [{ id: 'x' }] }),
    }));
    // @ts-expect-error stub
    global.fetch = fetchSpy;
    const records = await restAdapter.poll({ endpoint: 'https://api.example.com', jurisdiction: 'federal' });
    expect(records[0].id).toBe('x');
  });

  it('appends api_key_query when configured and env present', async () => {
    process.env.MY_KEY = 'KEY-1';
    const fetchSpy = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => '',
      json: async () => [],
    }));
    // @ts-expect-error stub
    global.fetch = fetchSpy;
    await restAdapter.poll({
      endpoint: 'https://api.example.com/list',
      jurisdiction: 'federal',
      api_key_env: 'MY_KEY',
      auth_pattern: 'api_key_query',
      api_key_query_param: 'api_key',
    } as Parameters<typeof restAdapter.poll>[0]);
    const calledUrl = fetchSpy.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('api_key=KEY-1');
    delete process.env.MY_KEY;
  });

  it('normalizes timestamp from unix seconds', () => {
    const event = restAdapter.normalize({ id: '42', created_at: 1715000000 }, { endpoint: 'https://api/x', jurisdiction: 'federal' });
    expect(event.timestamp).toContain('2024');
  });
});
