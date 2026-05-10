// src/__tests__/agent-edit-flow.test.ts
// Tests the agent edit → Taboo check → audit log flow.
//
// The PATCH /api/atrium/customers/[id] handler implements this flow:
//   1. Validate request fields
//   2. Taboo check (vault fetch — skipped when GITHUB_VAULT_TOKEN is absent)
//   3. Load before-state via ns_get_customer RPC
//   4. Apply update via ns_update_customer RPC
//   5. Write audit entry via ns_append_ledger_signal RPC
//
// These tests verify the RPC call sequence and params — not the HTTP layer.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockRpc = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: mockRpc }),
}));

const { default: customerIdHandler } = await import(
  '../../api/atrium/customers/[id].ts' as string
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
});

// ─── Full flow: PATCH agent field → ns_update_customer → audit log ────────────

describe('agent edit flow: PATCH → RPC update → audit log', () => {
  it('calls ns_update_customer with correct params after successful before-state fetch', async () => {
    const customerId = 'agent-cust-001';
    const beforeState = {
      id: customerId,
      name: 'ZedcorBranch1',
      status: 'Cold',
      notes: null,
      primary_contact_team_member_id: null,
      created_at: '2026-01-01T00:00:00Z',
      last_touched: null,
      ttl_days: 90,
      metadata: null,
    };
    const afterState = { ...beforeState, status: 'Qualified' };

    mockRpc
      .mockResolvedValueOnce({ data: [beforeState], error: null }) // ns_get_customer
      .mockResolvedValueOnce({ data: [afterState], error: null }); // ns_update_customer

    // audit call is fire-and-forget (not awaited by handler), resolve silently
    mockRpc.mockResolvedValue({ data: null, error: null });

    const req = makeReq('PATCH', {
      query: { id: customerId },
      body: { status: 'Qualified' },
    });
    const res = makeRes();
    await customerIdHandler(req as never, res as never);

    expect(res._status).toBe(200);

    // Verify ns_get_customer was called first
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'ns_get_customer', { p_id: customerId });

    // Verify ns_update_customer was called with correct params
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'ns_update_customer', {
      p_id: customerId,
      p_status: 'Qualified',
    });
  });

  it('calls ns_append_ledger_signal with audit data after successful update', async () => {
    const customerId = 'agent-cust-002';
    const beforeState = {
      id: customerId,
      name: 'AcmeSurveillance',
      status: 'Lead',
      notes: null,
      primary_contact_team_member_id: null,
      created_at: '2026-01-01T00:00:00Z',
      last_touched: null,
      ttl_days: 90,
      metadata: null,
    };
    const afterState = { ...beforeState, notes: 'Follow up on Tuesday' };

    mockRpc
      .mockResolvedValueOnce({ data: [beforeState], error: null }) // ns_get_customer
      .mockResolvedValueOnce({ data: [afterState], error: null }) // ns_update_customer
      .mockResolvedValueOnce({ data: null, error: null }); // ns_append_ledger_signal

    const req = makeReq('PATCH', {
      query: { id: customerId },
      body: { notes: 'Follow up on Tuesday' },
    });
    const res = makeRes();
    await customerIdHandler(req as never, res as never);

    expect(res._status).toBe(200);

    // Wait a tick for the fire-and-forget audit log IIFE to settle
    await new Promise((r) => setTimeout(r, 10));

    // Verify audit log was called with correct params
    const auditCall = mockRpc.mock.calls.find((c) => c[0] === 'ns_append_ledger_signal');
    expect(auditCall).toBeDefined();
    expect(auditCall![1]).toMatchObject({
      p_source_type: 'atrium_ui',
      p_source_id: customerId,
      p_summary: 'update_customer',
      p_insights: {
        before_state: expect.objectContaining({ id: customerId, status: 'Lead' }),
        after_state: expect.objectContaining({ notes: 'Follow up on Tuesday' }),
      },
    });
  });

  it('does NOT call ns_update_customer when before-state fetch fails', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'connection timeout' } });

    const req = makeReq('PATCH', {
      query: { id: 'agent-cust-003' },
      body: { status: 'Active' },
    });
    const res = makeRes();
    await customerIdHandler(req as never, res as never);

    expect(res._status).toBe(500);
    // Only ns_get_customer was called — update was never reached
    const updateCalls = mockRpc.mock.calls.filter((c) => c[0] === 'ns_update_customer');
    expect(updateCalls).toHaveLength(0);
  });

  it('returns 404 (not 500) when before-state returns empty array', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null }); // ns_get_customer empty

    const req = makeReq('PATCH', {
      query: { id: 'ghost-id' },
      body: { status: 'Active' },
    });
    const res = makeRes();
    await customerIdHandler(req as never, res as never);

    expect(res._status).toBe(404);
    expect((res._body as Record<string, string>).error).toMatch(/not found/i);
  });

  it('clears notes when null is explicitly passed', async () => {
    const customerId = 'agent-cust-004';
    const beforeState = {
      id: customerId,
      name: 'XYZ Corp',
      status: 'Cold',
      notes: 'Old notes',
      primary_contact_team_member_id: null,
      created_at: '2026-01-01T00:00:00Z',
      last_touched: null,
      ttl_days: 90,
      metadata: null,
    };
    const afterState = { ...beforeState, notes: null };

    mockRpc
      .mockResolvedValueOnce({ data: [beforeState], error: null })
      .mockResolvedValueOnce({ data: [afterState], error: null })
      .mockResolvedValue({ data: null, error: null });

    const req = makeReq('PATCH', {
      query: { id: customerId },
      body: { notes: null },
    });
    const res = makeRes();
    await customerIdHandler(req as never, res as never);

    expect(res._status).toBe(200);
    // ns_update_customer should have p_clear_notes: true
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'ns_update_customer', {
      p_id: customerId,
      p_clear_notes: true,
    });
  });
});
