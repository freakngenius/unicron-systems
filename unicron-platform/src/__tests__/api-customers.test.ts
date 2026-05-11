// src/__tests__/api-customers.test.ts
// Integration tests for /api/atrium/customers routes.
//
// Strategy: mock @supabase/supabase-js at the module level so each test
// controls exactly what the RPC returns. The handlers are imported as
// plain Node functions — no HTTP server required.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Supabase mock factory ────────────────────────────────────────────────────

const mockRpc = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: mockRpc }),
}));

// After mocking, import handlers (they call createClient at runtime)
const { default: customersIndexHandler } = await import(
  '../../api/atrium/customers/index.ts' as string
);
const { default: customerIdHandler } = await import(
  '../../api/atrium/customers/[id].ts' as string
);

// ─── Request / Response stubs ─────────────────────────────────────────────────

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
    _headers: {} as Record<string, string>,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._body = body;
      return res;
    },
    end() {
      return res;
    },
    setHeader(name: string, value: string) {
      res._headers[name] = value;
      return res;
    },
  };
  return res;
}

// ─── Environment setup ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  // No GITHUB_VAULT_TOKEN → tabooCheck returns { blocked: false } immediately
  delete process.env.GITHUB_VAULT_TOKEN;
});

// ─── GET /api/atrium/customers ────────────────────────────────────────────────

describe('GET /api/atrium/customers', () => {
  it('returns 200 with customer array on success', async () => {
    const customers = [
      { id: 'cust-1', name: 'Zedcor', status: 'Active', created_at: '2026-01-01T00:00:00Z' },
      { id: 'cust-2', name: 'Acme Corp', status: 'Cold', created_at: '2026-01-02T00:00:00Z' },
    ];
    mockRpc.mockResolvedValueOnce({ data: customers, error: null });

    const req = makeReq('GET');
    const res = makeRes();
    await customersIndexHandler(req as never, res as never);

    expect(res._status).toBe(200);
    expect(res._body).toEqual(customers);
    expect(mockRpc).toHaveBeenCalledWith('ns_list_customers', {
      p_status: null,
      p_limit: 100,
    });
  });

  it('passes status filter to RPC when query param is set', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    const req = makeReq('GET', { query: { status: 'Active' } });
    const res = makeRes();
    await customersIndexHandler(req as never, res as never);

    expect(mockRpc).toHaveBeenCalledWith('ns_list_customers', {
      p_status: 'Active',
      p_limit: 100,
    });
  });

  it('returns empty array when table does not exist (42P01)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'relation "nervous_system.customers" does not exist' },
    });

    const req = makeReq('GET');
    const res = makeRes();
    await customersIndexHandler(req as never, res as never);

    expect(res._status).toBe(200);
    expect(res._body).toEqual([]);
  });

  it('returns 500 with error message on unexpected RPC failure', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'unexpected db failure' },
    });

    const req = makeReq('GET');
    const res = makeRes();
    await customersIndexHandler(req as never, res as never);

    expect(res._status).toBe(500);
    expect((res._body as Record<string, string>).error).toContain('unexpected db failure');
  });

  it('returns 405 for non-GET/POST methods', async () => {
    const req = makeReq('DELETE');
    const res = makeRes();
    await customersIndexHandler(req as never, res as never);

    expect(res._status).toBe(405);
  });
});

// ─── POST /api/atrium/customers ───────────────────────────────────────────────

describe('POST /api/atrium/customers', () => {
  it('creates a customer and returns 201 with created record', async () => {
    const created = {
      id: 'cust-new',
      name: 'NewCo',
      status: 'Cold',
      created_at: '2026-05-10T00:00:00Z',
    };
    // POST: ns_create_customer call
    mockRpc.mockResolvedValueOnce({ data: [created], error: null });
    // writeAuditLog: ns_append_ledger_signal call (non-fatal, ignored)
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const req = makeReq('POST', { body: { name: 'NewCo', status: 'Active' } });
    const res = makeRes();
    await customersIndexHandler(req as never, res as never);

    expect(res._status).toBe(201);
    expect((res._body as typeof created).name).toBe('NewCo');
    expect(mockRpc).toHaveBeenCalledWith('ns_create_customer', expect.objectContaining({
      p_name: 'NewCo',
    }));
  });

  it('returns 400 when name is missing', async () => {
    const req = makeReq('POST', { body: { status: 'Active' } });
    const res = makeRes();
    await customersIndexHandler(req as never, res as never);

    expect(res._status).toBe(400);
    expect((res._body as Record<string, string>).error).toMatch(/name is required/i);
  });

  it('returns 500 when RPC returns an error', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'RPC failed' },
    });

    const req = makeReq('POST', { body: { name: 'BadCo' } });
    const res = makeRes();
    await customersIndexHandler(req as never, res as never);

    expect(res._status).toBe(500);
    expect((res._body as Record<string, string>).error).toContain('RPC failed');
  });
});

// ─── GET /api/atrium/customers/[id] (PATCH handler checks id first) ───────────

describe('GET /api/atrium/customers/[id] — via PATCH handler', () => {
  it('returns 400 when id is missing', async () => {
    const req = makeReq('PATCH', { query: {}, body: { status: 'Active' } });
    const res = makeRes();
    await customerIdHandler(req as never, res as never);

    expect(res._status).toBe(400);
    expect((res._body as Record<string, string>).error).toMatch(/missing customer id/i);
  });
});

// ─── PATCH /api/atrium/customers/[id] ────────────────────────────────────────

describe('PATCH /api/atrium/customers/[id]', () => {
  it('updates a customer and returns 200 with updated record', async () => {
    const existing = {
      id: 'cust-1',
      name: 'Zedcor',
      status: 'Cold',
      created_at: '2026-01-01T00:00:00Z',
    };
    const updated = { ...existing, status: 'Active' };

    // ns_get_customer (before-state)
    mockRpc.mockResolvedValueOnce({ data: [existing], error: null });
    // ns_update_customer
    mockRpc.mockResolvedValueOnce({ data: [updated], error: null });
    // ns_append_ledger_signal (non-blocking, might not be awaited in test)
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const req = makeReq('PATCH', {
      query: { id: 'cust-1' },
      body: { status: 'Active' },
    });
    const res = makeRes();
    await customerIdHandler(req as never, res as never);

    expect(res._status).toBe(200);
    expect((res._body as typeof updated).status).toBe('Active');
    // The API boundary lowercases p_status (api/atrium/customers/[id].ts:140)
    // to match the customers_status_check constraint added in PR #330 — the
    // body status "Active" is normalized to "active" before the RPC fires.
    expect(mockRpc).toHaveBeenCalledWith('ns_update_customer', expect.objectContaining({
      p_id: 'cust-1',
      p_status: 'active',
    }));
  });

  it('returns 404 when customer does not exist', async () => {
    // ns_get_customer returns empty array
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    const req = makeReq('PATCH', {
      query: { id: 'nonexistent' },
      body: { status: 'Active' },
    });
    const res = makeRes();
    await customerIdHandler(req as never, res as never);

    expect(res._status).toBe(404);
  });

  it('returns 400 when no fields are provided', async () => {
    const req = makeReq('PATCH', {
      query: { id: 'cust-1' },
      body: {},
    });
    const res = makeRes();
    await customerIdHandler(req as never, res as never);

    expect(res._status).toBe(400);
    expect((res._body as Record<string, string>).error).toMatch(/at least one field/i);
  });

  it('returns 405 for non-PATCH methods', async () => {
    const req = makeReq('DELETE', {
      query: { id: 'cust-1' },
      body: {},
    });
    const res = makeRes();
    await customerIdHandler(req as never, res as never);

    expect(res._status).toBe(405);
  });

  it('returns 500 when ns_get_customer RPC fails', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'db error' } });

    const req = makeReq('PATCH', {
      query: { id: 'cust-1' },
      body: { status: 'Active' },
    });
    const res = makeRes();
    await customerIdHandler(req as never, res as never);

    expect(res._status).toBe(500);
  });
});
