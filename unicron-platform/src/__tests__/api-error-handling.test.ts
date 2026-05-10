// src/__tests__/api-error-handling.test.ts
// Tests that API routes return structured error JSON (not raw throws or HTML),
// handle PGRST106-style Supabase errors gracefully, and survive missing env vars.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockRpc = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: mockRpc }),
}));

const { default: customersIndexHandler } = await import(
  '../../api/atrium/customers/index.ts' as string
);
const { default: customerIdHandler } = await import(
  '../../api/atrium/customers/[id].ts' as string
);
const { default: skillsRunHandler } = await import(
  '../../api/atrium/skills/run.ts' as string
);
const { default: skillsListHandler } = await import(
  '../../api/atrium/skills.ts' as string
);

// ─── Stubs ────────────────────────────────────────────────────────────────────

function makeReq(
  method: string,
  opts: { query?: Record<string, string>; body?: unknown } = {},
) {
  return {
    method,
    query: opts.query ?? {},
    body: opts.body ?? undefined,
    headers: {},
  } as unknown as import('@vercel/node').VercelRequest;
}

function makeRes() {
  const res = {
    _status: 0,
    _body: undefined as unknown,
    status(code: number) { res._status = code; return res; },
    json(body: unknown) { res._body = body; return res; },
    end() { return res; },
    setHeader() { return res; },
  };
  return res;
}

// ─── Environment ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  delete process.env.GITHUB_VAULT_TOKEN;
  delete process.env.UNICRON_INTERNAL_API_KEY;
  delete process.env.VERCEL_ENV;
});

// ─── Structured error JSON (all routes) ──────────────────────────────────────

describe('structured error JSON — all routes return JSON, not raw throws', () => {
  it('customers/index returns JSON object on RPC error (not a thrown exception)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc failure' } });

    const req = makeReq('GET');
    const res = makeRes();
    // If the handler threw, this would reject — verify it resolves cleanly
    await expect(customersIndexHandler(req as never, res as never)).resolves.toBeUndefined();
    expect(res._body).toBeTypeOf('object');
    expect((res._body as Record<string, unknown>).error).toBeDefined();
  });

  it('customers/[id] returns JSON object on RPC error', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'db error' } });

    const req = makeReq('PATCH', { query: { id: 'x' }, body: { status: 'Active' } });
    const res = makeRes();
    await expect(customerIdHandler(req as never, res as never)).resolves.toBeUndefined();
    expect(res._body).toBeTypeOf('object');
    expect((res._body as Record<string, unknown>).error).toBeDefined();
  });

  it('skills/run returns JSON object on unknown skill', async () => {
    const req = makeReq('POST', { body: { skill_slug: 'unknown-xyz' } });
    const res = makeRes();
    await expect(skillsRunHandler(req as never, res as never)).resolves.toBeUndefined();
    expect(res._body).toBeTypeOf('object');
    expect((res._body as Record<string, unknown>).error).toBeDefined();
  });
});

// ─── PGRST106-style errors ────────────────────────────────────────────────────

describe('PGRST106-style errors — caught and return 500 with message', () => {
  it('customers/index: PGRST106 error returns 500 with JSON error (not 200 empty array)', async () => {
    // PGRST106 = schema not in PostgREST whitelist — distinct from "does not exist"
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'PGRST106: schema "nervous_system" not exposed' },
    });

    const req = makeReq('GET');
    const res = makeRes();
    await customersIndexHandler(req as never, res as never);

    // PGRST106 doesn't match "does not exist"/"42P01" → should be 500
    expect(res._status).toBe(500);
    expect((res._body as Record<string, unknown>).error).toBeDefined();
    expect(typeof (res._body as Record<string, unknown>).error).toBe('string');
  });

  it('customers/index: 42P01 (table does not exist) returns 200 empty array', async () => {
    // 42P01 is the "does not exist" code — this is the known-safe fallback for dev
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'relation "customers" does not exist (42P01)' },
    });

    const req = makeReq('GET');
    const res = makeRes();
    await customersIndexHandler(req as never, res as never);

    expect(res._status).toBe(200);
    expect(res._body).toEqual([]);
  });

  it('customers/[id]: PGRST-style error from ns_get_customer returns structured 500', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'PGRST106: schema not exposed' },
    });

    const req = makeReq('PATCH', { query: { id: 'cust-1' }, body: { status: 'Active' } });
    const res = makeRes();
    await customerIdHandler(req as never, res as never);

    expect(res._status).toBe(500);
    expect((res._body as Record<string, unknown>).error).toContain('PGRST106');
  });
});

// ─── Missing env vars — graceful error, no crash ─────────────────────────────

describe('missing env vars — handlers return structured errors, no process crash', () => {
  it('customers/index returns 500 when SUPABASE_URL is absent', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;

    const req = makeReq('GET');
    const res = makeRes();
    await expect(customersIndexHandler(req as never, res as never)).resolves.toBeUndefined();
    // The handler catches the getServiceClient() throw and responds
    expect(res._status).toBe(500);
    expect((res._body as Record<string, unknown>).error).toBeDefined();
  });

  it('customers/index returns 500 when SUPABASE_SERVICE_ROLE_KEY is absent', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const req = makeReq('GET');
    const res = makeRes();
    await expect(customersIndexHandler(req as never, res as never)).resolves.toBeUndefined();
    expect(res._status).toBe(500);
    expect((res._body as Record<string, unknown>).error).toBeDefined();
  });

  it('skills/run returns 500 when Supabase env vars are absent', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const req = makeReq('POST', { body: { skill_slug: 'morning-brief' } });
    const res = makeRes();
    await expect(skillsRunHandler(req as never, res as never)).resolves.toBeUndefined();
    expect(res._status).toBe(500);
    expect((res._body as Record<string, unknown>).ok).toBe(false);
    expect((res._body as Record<string, unknown>).error).toBeDefined();
  });

  it('skills list returns 500 when VITE_SUPABASE_URL is absent', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const req = makeReq('GET');
    const res = makeRes();
    await expect(skillsListHandler(req as never, res as never)).resolves.toBeUndefined();
    expect(res._status).toBe(500);
    expect((res._body as Record<string, unknown>).ok).toBe(false);
  });
});

// ─── Error message is a string (not an object or undefined) ──────────────────

describe('error shape — error field is always a string', () => {
  it('POST customers with missing name returns error as string', async () => {
    const req = makeReq('POST', { body: {} });
    const res = makeRes();
    await customersIndexHandler(req as never, res as never);

    expect(typeof (res._body as Record<string, unknown>).error).toBe('string');
  });

  it('PATCH customers with no fields returns error as string', async () => {
    const req = makeReq('PATCH', { query: { id: 'x' }, body: {} });
    const res = makeRes();
    await customerIdHandler(req as never, res as never);

    expect(typeof (res._body as Record<string, unknown>).error).toBe('string');
  });

  it('skills/run with missing skill_slug returns error as string', async () => {
    const req = makeReq('POST', { body: {} });
    const res = makeRes();
    await skillsRunHandler(req as never, res as never);

    expect(typeof (res._body as Record<string, unknown>).error).toBe('string');
  });
});
