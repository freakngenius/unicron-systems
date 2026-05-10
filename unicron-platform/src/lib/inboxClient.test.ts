import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listInboxTickets, resolveInboxTicket } from './inboxClient';

// inboxClient is real-only; mock fallback was stripped. All paths exercise
// the same-origin Vercel proxy via fetch.
describe('inboxClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('listInboxTickets builds the correct query string and forwards response', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ tickets: [], category: 'source-discovery', status: 'open' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    await listInboxTickets({ category: 'source-discovery', status: 'open', limit: 5 });
    const [url] = fetchMock.mock.calls[0];
    // Wave 3 Phase B: same-origin proxy injects the bearer server-side.
    expect(url).toContain('/api/architect/inbox-proxy?');
    expect(url).toContain('category=source-discovery');
    expect(url).toContain('status=open');
    expect(url).toContain('limit=5');
  });

  it('listInboxTickets returns the response payload verbatim (including empty arrays)', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ tickets: [], category: 'source-discovery', status: 'open' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const res = await listInboxTickets({ category: 'source-discovery' });
    expect(res.tickets).toEqual([]);
    expect(res.category).toBe('source-discovery');
    expect(res.status).toBe('open');
  });

  it('resolveInboxTicket POSTs JSON body to the resolve endpoint', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: 'resolved' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await resolveInboxTicket('abc 123', {
      resolution: 'manual',
      resolution_note: 'handled',
    });
    expect(result.status).toBe('resolved');
    const [url, init] = fetchMock.mock.calls[0];
    // Wave 3 Phase B: ticket id flows as a query param to the proxy, which
    // re-inserts it into the upstream path before forwarding.
    expect(url).toBe('/api/architect/inbox-resolve-proxy?id=abc+123');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      resolution: 'manual',
      resolution_note: 'handled',
    });
  });

  it('throws a descriptive error when the api returns non-2xx', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response('boom', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      }),
    );
    await expect(resolveInboxTicket('x', { resolution: 'manual' })).rejects.toThrow(
      /inbox api 500/,
    );
  });
});
