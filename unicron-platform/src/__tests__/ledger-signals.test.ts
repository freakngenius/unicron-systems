// src/__tests__/ledger-signals.test.ts
// Tests that ns_append_ledger_signal is called with correct params in three scenarios:
//   1. Customer is created (POST /api/atrium/customers)
//   2. Customer stage is updated (PATCH /api/atrium/customers/[id])
//   3. Skill is run (POST /api/atrium/skills/run — track-pipeline-stage)

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

// ─── Stubs ────────────────────────────────────────────────────────────────────

function makeReq(
  method: string,
  opts: { query?: Record<string, string>; body?: unknown; headers?: Record<string, string> } = {},
) {
  return {
    method,
    query: opts.query ?? {},
    body: opts.body ?? undefined,
    headers: opts.headers ?? {},
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

// ─── Scenario 1: Customer created ─────────────────────────────────────────────

describe('ledger signal — customer created', () => {
  it('calls ns_append_ledger_signal after ns_create_customer succeeds', async () => {
    const createdCustomer = {
      id: 'cust-ledger-001',
      name: 'LedgerCo',
      status: 'Cold',
      created_at: '2026-05-10T00:00:00Z',
      primary_contact_team_member_id: null,
      notes: null,
      metadata: null,
      last_touched: null,
      ttl_days: 90,
    };

    // ns_create_customer
    mockRpc.mockResolvedValueOnce({ data: [createdCustomer], error: null });
    // ns_append_ledger_signal (writeAuditLog)
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const req = makeReq('POST', { body: { name: 'LedgerCo' } });
    const res = makeRes();
    await customersIndexHandler(req as never, res as never);

    expect(res._status).toBe(201);

    // Verify ledger signal was sent
    const ledgerCall = mockRpc.mock.calls.find((c) => c[0] === 'ns_append_ledger_signal');
    expect(ledgerCall).toBeDefined();
    expect(ledgerCall![1]).toMatchObject({
      p_source_type: 'atrium_ui',
      p_source_id: 'cust-ledger-001',
      p_summary: 'create_customer',
      p_insights: { after_state: expect.objectContaining({ id: 'cust-ledger-001', name: 'LedgerCo' }) },
    });
  });

  it('does NOT call ns_append_ledger_signal when create fails', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'insert failed' } });

    const req = makeReq('POST', { body: { name: 'FailCo' } });
    const res = makeRes();
    await customersIndexHandler(req as never, res as never);

    expect(res._status).toBe(500);

    const ledgerCall = mockRpc.mock.calls.find((c) => c[0] === 'ns_append_ledger_signal');
    expect(ledgerCall).toBeUndefined();
  });
});

// ─── Scenario 2: Customer stage updated ──────────────────────────────────────

describe('ledger signal — customer stage updated', () => {
  it('calls ns_append_ledger_signal after ns_update_customer succeeds', async () => {
    const customerId = 'cust-ledger-002';
    const beforeState = {
      id: customerId,
      name: 'StageCo',
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
      .mockResolvedValueOnce({ data: [afterState], error: null }) // ns_update_customer
      .mockResolvedValueOnce({ data: null, error: null }); // ns_append_ledger_signal

    const req = makeReq('PATCH', {
      query: { id: customerId },
      body: { status: 'Qualified' },
    });
    const res = makeRes();
    await customerIdHandler(req as never, res as never);

    expect(res._status).toBe(200);

    // Allow fire-and-forget IIFE to settle
    await new Promise((r) => setTimeout(r, 10));

    const ledgerCall = mockRpc.mock.calls.find((c) => c[0] === 'ns_append_ledger_signal');
    expect(ledgerCall).toBeDefined();
    expect(ledgerCall![1]).toMatchObject({
      p_source_type: 'atrium_ui',
      p_source_id: customerId,
      p_summary: 'update_customer',
      p_insights: {
        before_state: expect.objectContaining({ status: 'Cold' }),
        after_state: expect.objectContaining({ status: 'Qualified' }),
      },
    });
  });
});

// ─── Scenario 3: Skill is run (track-pipeline-stage) ─────────────────────────

describe('ledger signal — skill run (track-pipeline-stage)', () => {
  it('calls ns_append_ledger_signal with pipeline stage data', async () => {
    const customerId = 'cust-ledger-003';

    // ns_update_customer_stage
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    // ns_append_ledger_signal (inside runTrackPipelineStage)
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    // auditSkillRun → ns_append_ledger_signal
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const req = makeReq('POST', {
      body: {
        skill_slug: 'track-pipeline-stage',
        customer_id: customerId,
        new_stage: 'qualified',
        note: 'Spoke with buyer',
      },
    });
    const res = makeRes();
    await skillsRunHandler(req as never, res as never);

    expect(res._status).toBe(200);

    // First ledger call is from inside the skill runner
    const ledgerCalls = mockRpc.mock.calls.filter((c) => c[0] === 'ns_append_ledger_signal');
    expect(ledgerCalls.length).toBeGreaterThanOrEqual(1);

    const pipelineLedgerCall = ledgerCalls[0];
    expect(pipelineLedgerCall[1]).toMatchObject({
      p_source_type: 'manual',
      p_source_id: `customers/${customerId}`,
      p_insights: expect.objectContaining({
        customer_id: customerId,
        new_stage: 'qualified',
      }),
    });
    expect(pipelineLedgerCall[1].p_summary).toContain('qualified');
  });

  it('calls ns_append_ledger_signal via auditSkillRun after successful skill run', async () => {
    const customerId = 'cust-ledger-004';

    mockRpc.mockResolvedValue({ data: null, error: null });

    const req = makeReq('POST', {
      body: {
        skill_slug: 'track-pipeline-stage',
        customer_id: customerId,
        new_stage: 'proposal',
      },
    });
    const res = makeRes();
    await skillsRunHandler(req as never, res as never);

    expect(res._status).toBe(200);

    // auditSkillRun fires with outcome='success'
    const auditCall = mockRpc.mock.calls.find(
      (c) =>
        c[0] === 'ns_append_ledger_signal' &&
        typeof c[1].p_source_id === 'string' &&
        (c[1].p_source_id as string).startsWith('skill_run/'),
    );
    expect(auditCall).toBeDefined();
    expect(auditCall![1]).toMatchObject({
      p_source_type: 'audit',
      p_source_id: 'skill_run/track-pipeline-stage',
      p_summary: 'skill_run:track-pipeline-stage:success',
    });
  });
});

// ─── Ledger signal params contract ────────────────────────────────────────────

describe('ledger signal params — structural contract', () => {
  it('ns_append_ledger_signal always receives the four required params', async () => {
    const created = {
      id: 'cust-contract-001',
      name: 'ContractCo',
      status: 'Cold',
      created_at: '2026-05-10T00:00:00Z',
    };

    mockRpc.mockResolvedValueOnce({ data: [created], error: null });
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const req = makeReq('POST', { body: { name: 'ContractCo' } });
    const res = makeRes();
    await customersIndexHandler(req as never, res as never);

    const ledgerCall = mockRpc.mock.calls.find((c) => c[0] === 'ns_append_ledger_signal');
    expect(ledgerCall).toBeDefined();
    const params = ledgerCall![1];

    // All four required params must be present
    expect(params).toHaveProperty('p_source_type');
    expect(params).toHaveProperty('p_source_id');
    expect(params).toHaveProperty('p_summary');
    expect(params).toHaveProperty('p_insights');

    // Types
    expect(typeof params.p_source_type).toBe('string');
    expect(typeof params.p_source_id).toBe('string');
    expect(typeof params.p_summary).toBe('string');
    expect(typeof params.p_insights).toBe('object');
  });
});
