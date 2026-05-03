import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listInboxTickets, resolveInboxTicket } from './inboxClient';

describe('inboxClient (mock-mode)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_ARCHITECT_API_ENABLED', 'false');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('listInboxTickets returns the source-discovery fixture set', async () => {
    const res = await listInboxTickets({ category: 'source-discovery' });
    expect(res.category).toBe('source-discovery');
    expect(res.status).toBe('open');
    expect(res.tickets.length).toBeGreaterThan(0);
    res.tickets.forEach((t) => expect(t.category).toBe('source-discovery'));
  });

  it('resolveInboxTicket returns dismissed for dismiss mode', async () => {
    const res = await resolveInboxTicket('ticket-pgh-rss-1', { resolution: 'dismiss' });
    expect(res.status).toBe('dismissed');
  });

  it('resolveInboxTicket returns resolved for manual mode', async () => {
    const res = await resolveInboxTicket('ticket-pgh-rss-1', { resolution: 'manual' });
    expect(res.status).toBe('resolved');
  });

  it('resolveInboxTicket returns queued + request_id for resume mode', async () => {
    const res = await resolveInboxTicket('ticket-austin-auth', {
      resolution: 'resume',
      resume_url: 'https://services.austintexas.gov/permits.json',
      resume_api_key_env: 'AUSTIN_OPEN_DATA_TOKEN',
    });
    expect(res.status).toBe('queued');
    expect(res.request_id).toMatch(/^mock-resume-/);
  });
});

describe('inboxClient (real-mode)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_ARCHITECT_API_ENABLED', 'true');
    vi.stubEnv('VITE_ARCHITECT_API_URL', 'https://example.test');
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllEnvs();
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
    expect(url).toContain('/api/architect/inbox?');
    expect(url).toContain('category=source-discovery');
    expect(url).toContain('status=open');
    expect(url).toContain('limit=5');
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
    expect(url).toBe('https://example.test/api/architect/inbox/abc%20123/resolve');
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
