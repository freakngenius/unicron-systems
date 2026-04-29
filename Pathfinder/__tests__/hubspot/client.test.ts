// __tests__/hubspot/client.test.ts — retry-on-429 + signed-fetch
// behavior for the HubSpot REST wrapper. No live HubSpot. The fetch
// implementation is injected via the factory so we can assert call
// counts and timing.
//
// Spec rule: "All API calls retry with exponential backoff on rate-limit
// (HTTP 429)". Retry-After is HubSpot's preferred backoff signal and we
// must honor it. Terminal failures throw HubspotError carrying the
// status + body so the route can audit-log a useful reason.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createHubspotClient, HubspotError } from '@/lib/hubspot/client';

interface RecordedCall {
  url: string;
  init: RequestInit;
}

function makeStubFetch(responses: Array<Response | (() => Response)>) {
  const calls: RecordedCall[] = [];
  let i = 0;
  const fn = vi.fn(async (input: URL | RequestInfo, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    const slot = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return typeof slot === 'function' ? slot() : slot;
  });
  return Object.assign(fn as unknown as typeof fetch, { calls });
}

function rateLimited(retryAfter = '1'): Response {
  return new Response(JSON.stringify({ status: 'error', errorType: 'RATE_LIMIT' }), {
    status: 429,
    headers: { 'Retry-After': retryAfter, 'content-type': 'application/json' },
  });
}

function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function serverError(status = 500): Response {
  return new Response(JSON.stringify({ status: 'error', message: 'boom' }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createHubspotClient', () => {
  let originalSetTimeout: typeof setTimeout;

  beforeEach(() => {
    // Stub setTimeout so retries don't burn real wall-clock time.
    originalSetTimeout = global.setTimeout;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.setTimeout = ((fn: () => void) => {
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
  });

  afterEach(() => {
    global.setTimeout = originalSetTimeout;
  });

  it('sends Bearer token + JSON content-type on the request', async () => {
    const fetchImpl = makeStubFetch([ok({ id: 'deal_001' })]);
    const client = createHubspotClient({ token: 'tok_test', fetchImpl });
    await client.createDeal({ properties: { dealname: 'x' } });
    expect(fetchImpl.calls).toHaveLength(1);
    const headers = new Headers(fetchImpl.calls[0].init.headers as HeadersInit);
    expect(headers.get('authorization')).toBe('Bearer tok_test');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('retries once on 429 and returns the eventual 200', async () => {
    const fetchImpl = makeStubFetch([rateLimited('0'), ok({ id: 'deal_001' })]);
    const client = createHubspotClient({ token: 'tok_test', fetchImpl });

    const result = await client.createDeal({ properties: { dealname: 'x' } });
    expect(result.id).toBe('deal_001');
    expect(fetchImpl.calls).toHaveLength(2);
  });

  it('honors Retry-After by emitting it to the audit log', async () => {
    const auditEvents: Array<{ eventType: string; data: Record<string, unknown> }> = [];
    const fetchImpl = makeStubFetch([rateLimited('7'), ok({ id: 'deal_002' })]);
    const client = createHubspotClient({
      token: 'tok_test',
      fetchImpl,
      log: async (eventType, data) => {
        auditEvents.push({ eventType, data });
      },
    });

    await client.createDeal({ properties: { dealname: 'y' } });

    const limited = auditEvents.find((e) => e.eventType === 'rate_limited');
    expect(limited).toBeTruthy();
    expect(limited?.data.retry_after_seconds).toBe(7);
  });

  it('throws HubspotError after 5 attempts on terminal 5xx', async () => {
    const fetchImpl = makeStubFetch([serverError(), serverError(), serverError(), serverError(), serverError()]);
    const client = createHubspotClient({ token: 'tok_test', fetchImpl });

    await expect(client.createDeal({ properties: { dealname: 'z' } })).rejects.toBeInstanceOf(HubspotError);
    expect(fetchImpl.calls.length).toBe(5);
  });

  it('does not retry 4xx responses other than 429', async () => {
    const fetchImpl = makeStubFetch([
      new Response(JSON.stringify({ message: 'invalid property' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    ]);
    const client = createHubspotClient({ token: 'tok_test', fetchImpl });

    await expect(client.createDeal({ properties: { dealname: 'z' } })).rejects.toBeInstanceOf(HubspotError);
    expect(fetchImpl.calls.length).toBe(1);
  });
});
