// Unit tests for the Wave 3 Phase B token-proxy handlers.
//
// Goal: lock the contract that
//   1. Each handler injects `Authorization: Bearer <env token>` server-side.
//   2. Method, body, and (where relevant) query string forward to upstream.
//   3. Upstream non-2xx propagates status + JSON to caller (no token leak).
//   4. Misconfigured env returns 503 (so the operator gets a real signal).
//   5. Upstream throw maps to 502 (the brief specifies 502 on errors).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

import decomposeHandler from '../architect/decompose-proxy';
import tuneHandler from '../architect/tune-proxy';
import discoverHandler from '../architect/discover-proxy';
import inboxHandler from '../architect/inbox-proxy';
import inboxResolveHandler from '../architect/inbox-resolve-proxy';
import onboardHandler from '../sources/onboard-proxy';
import sessionsHandler from '../sources/sessions-proxy';
import costSummaryHandler from '../cost-summary-proxy';

// --- Mini Vercel req/res shims --------------------------------------------

interface MockReqInit {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[]>;
}

function mockReq(init: MockReqInit = {}): VercelRequest {
  return {
    method: init.method ?? 'POST',
    body: init.body,
    query: init.query ?? {},
    headers: {},
  } as unknown as VercelRequest;
}

interface MockRes {
  res: VercelResponse;
  state: { status: number; headers: Record<string, string>; body: string };
}

function mockRes(): MockRes {
  const state = { status: 0, headers: {} as Record<string, string>, body: '' };
  const res = {
    status(code: number) {
      state.status = code;
      return this;
    },
    setHeader(key: string, value: string) {
      state.headers[key.toLowerCase()] = value;
      return this;
    },
    send(body: unknown) {
      state.body = typeof body === 'string' ? body : JSON.stringify(body);
      return this;
    },
    json(body: unknown) {
      state.headers['content-type'] = 'application/json';
      state.body = JSON.stringify(body);
      return this;
    },
  } as unknown as VercelResponse;
  return { res, state };
}

// --- Test setup ------------------------------------------------------------

const ARCH_URL = 'https://architect.test.example';
const ARCH_TOK = 'arch-token-xyz';
const ONB_URL = 'https://onboarder.test.example';
const ONB_TOK = 'onb-token-xyz';

beforeEach(() => {
  process.env.ARCHITECT_API_URL = ARCH_URL;
  process.env.ARCHITECT_API_TOKEN = ARCH_TOK;
  process.env.SOURCE_ONBOARDER_URL = ONB_URL;
  process.env.SOURCE_ONBOARDER_TOKEN = ONB_TOK;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => okJson({ ok: true })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ARCHITECT_API_URL;
  delete process.env.ARCHITECT_API_TOKEN;
  delete process.env.SOURCE_ONBOARDER_URL;
  delete process.env.SOURCE_ONBOARDER_TOKEN;
});

function okJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function lastFetchCall(): [string, RequestInit] {
  const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return call as [string, RequestInit];
}

// --- Architect: decompose --------------------------------------------------

describe('decompose-proxy', () => {
  it('forwards POST body to upstream with bearer token', async () => {
    const { res, state } = mockRes();
    await decomposeHandler(
      mockReq({ method: 'POST', body: { buyer_pain_prompt: 'painful' } }),
      res,
    );
    const [url, init] = lastFetchCall();
    expect(url).toBe(`${ARCH_URL}/api/architect/decompose`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${ARCH_TOK}`);
    expect(JSON.parse(init.body as string)).toEqual({ buyer_pain_prompt: 'painful' });
    expect(state.status).toBe(200);
  });

  it('rejects non-POST with 405', async () => {
    const { res, state } = mockRes();
    await decomposeHandler(mockReq({ method: 'GET' }), res);
    expect(state.status).toBe(405);
  });

  it('returns 503 when ARCHITECT_API_TOKEN missing', async () => {
    delete process.env.ARCHITECT_API_TOKEN;
    const { res, state } = mockRes();
    await decomposeHandler(mockReq({ method: 'POST', body: {} }), res);
    expect(state.status).toBe(503);
    expect(state.body).toContain('ARCHITECT_API_TOKEN');
  });

  it('maps upstream fetch throw to 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('econn');
      }),
    );
    const { res, state } = mockRes();
    await decomposeHandler(mockReq({ method: 'POST', body: {} }), res);
    expect(state.status).toBe(502);
  });

  it('propagates upstream non-2xx status + JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson({ ok: false, error: 'unauthorized' }, 401)),
    );
    const { res, state } = mockRes();
    await decomposeHandler(mockReq({ method: 'POST', body: {} }), res);
    expect(state.status).toBe(401);
    expect(state.body).toContain('unauthorized');
  });
});

// --- Architect: tune + discover -------------------------------------------

describe('tune-proxy', () => {
  it('forwards POST to /api/architect/tune', async () => {
    const { res } = mockRes();
    await tuneHandler(mockReq({ method: 'POST', body: { vertical_id: 'v1' } }), res);
    const [url, init] = lastFetchCall();
    expect(url).toBe(`${ARCH_URL}/api/architect/tune`);
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${ARCH_TOK}`);
  });
});

describe('discover-proxy', () => {
  it('forwards POST to /api/architect/discover', async () => {
    const { res } = mockRes();
    await discoverHandler(mockReq({ method: 'POST', body: { vertical_id: 'v1' } }), res);
    const [url, init] = lastFetchCall();
    expect(url).toBe(`${ARCH_URL}/api/architect/discover`);
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${ARCH_TOK}`);
  });
});

// --- Architect: inbox + inbox-resolve -------------------------------------

describe('inbox-proxy', () => {
  it('forwards GET with query string and bearer', async () => {
    const { res } = mockRes();
    await inboxHandler(
      mockReq({ method: 'GET', query: { category: 'source-discovery', status: 'open' } }),
      res,
    );
    const [url, init] = lastFetchCall();
    expect(url).toBe(`${ARCH_URL}/api/architect/inbox?category=source-discovery&status=open`);
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${ARCH_TOK}`);
  });

  it('rejects non-GET with 405', async () => {
    const { res, state } = mockRes();
    await inboxHandler(mockReq({ method: 'POST' }), res);
    expect(state.status).toBe(405);
  });
});

describe('inbox-resolve-proxy', () => {
  it('substitutes id from query into upstream path and drops it from forwarded query', async () => {
    const { res } = mockRes();
    await inboxResolveHandler(
      mockReq({
        method: 'POST',
        body: { resolution: 'manual' },
        query: { id: 'tkt-1', extra: 'k' },
      }),
      res,
    );
    const [url] = lastFetchCall();
    expect(url).toBe(`${ARCH_URL}/api/architect/inbox/tkt-1/resolve?extra=k`);
  });

  it('returns 400 when id missing', async () => {
    const { res, state } = mockRes();
    await inboxResolveHandler(mockReq({ method: 'POST', body: {} }), res);
    expect(state.status).toBe(400);
  });
});

// --- Sources: onboard + sessions ------------------------------------------

describe('onboard-proxy', () => {
  it('forwards POST with sync=1 default and source-onboarder bearer', async () => {
    const { res } = mockRes();
    await onboardHandler(
      mockReq({ method: 'POST', body: { url: 'https://x' } }),
      res,
    );
    const [url, init] = lastFetchCall();
    expect(url).toBe(`${ONB_URL}/api/sources/onboard?sync=1`);
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${ONB_TOK}`);
  });

  it('returns 503 when SOURCE_ONBOARDER_TOKEN missing', async () => {
    delete process.env.SOURCE_ONBOARDER_TOKEN;
    const { res, state } = mockRes();
    await onboardHandler(mockReq({ method: 'POST', body: {} }), res);
    expect(state.status).toBe(503);
  });
});

describe('sessions-proxy', () => {
  it('substitutes id from query into upstream path', async () => {
    const { res } = mockRes();
    await sessionsHandler(
      mockReq({ method: 'GET', query: { id: 'sess-9' } }),
      res,
    );
    const [url] = lastFetchCall();
    expect(url).toBe(`${ONB_URL}/api/sources/sessions/sess-9`);
  });
});

// --- Cost summary ----------------------------------------------------------

describe('cost-summary-proxy', () => {
  it('forwards GET to /pathfinder/api/cost-summary with bearer', async () => {
    const { res } = mockRes();
    await costSummaryHandler(mockReq({ method: 'GET' }), res);
    const [url, init] = lastFetchCall();
    expect(url).toBe(`${ARCH_URL}/pathfinder/api/cost-summary`);
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${ARCH_TOK}`);
  });
});
