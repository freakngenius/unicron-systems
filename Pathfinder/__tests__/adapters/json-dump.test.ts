// __tests__/adapters/json-dump.test.ts — Phase 2 Stream E.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { jsonDumpAdapter } from '@/lib/adapters/json-dump';

afterEach(() => vi.restoreAllMocks());

describe('json-dump adapter', () => {
  it('parses bare JSON array dump', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify([
        { id: '1', timestamp: '2024-05-01', description: 'A' },
        { id: '2', timestamp: '2024-05-02', description: 'B' },
      ]),
    }));
    // @ts-expect-error stub
    global.fetch = fetchSpy;
    const records = await jsonDumpAdapter.poll({ endpoint: 'https://x.gov/dump.json', jurisdiction: 'federal' });
    expect(records).toHaveLength(2);
  });

  it('parses JSONL dump line-by-line', async () => {
    const jsonl = ['{"id":"1"}', '{"id":"2"}', 'oops not-json', '{"id":"3"}'].join('\n');
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => jsonl,
    }));
    // @ts-expect-error stub
    global.fetch = fetchSpy;
    const records = await jsonDumpAdapter.poll({
      endpoint: 'https://x.gov/dump.jsonl',
      jurisdiction: 'federal',
      format: 'jsonl',
    } as Parameters<typeof jsonDumpAdapter.poll>[0]);
    expect(records.map((r) => r.id)).toEqual(['1', '2', '3']);
  });

  it('honors max_records cap', async () => {
    const arr = Array.from({ length: 10 }, (_, i) => ({ id: String(i) }));
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify(arr),
    }));
    // @ts-expect-error stub
    global.fetch = fetchSpy;
    const records = await jsonDumpAdapter.poll({
      endpoint: 'https://x.gov/dump.json',
      jurisdiction: 'federal',
      max_records: 3,
    } as Parameters<typeof jsonDumpAdapter.poll>[0]);
    expect(records).toHaveLength(3);
  });
});
