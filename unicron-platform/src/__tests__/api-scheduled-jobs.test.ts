// src/__tests__/api-scheduled-jobs.test.ts
// Tests for /api/atrium/scheduled-jobs — Stream C (Sprint 7).
//
// NOTE: The scheduled-jobs route has not yet shipped (Stream C is not complete
// as of Sprint 7 integration test run on 2026-05-10). Tests are written against
// the expected contract and marked as todo until Stream C ships.
//
// To activate: remove `.todo` from each test once the route file exists at
// api/atrium/scheduled-jobs.ts and exports a default Vercel handler.
//
// Expected contract:
//   GET  /api/atrium/scheduled-jobs     → 200, ScheduledJob[]
//   PATCH /api/atrium/scheduled-jobs    → 200, updated job (toggle active)
//   POST  /api/atrium/scheduled-jobs    → 200, trigger result + audit entry

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Supabase mock (ready for when the route ships) ───────────────────────────

const mockRpc = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: mockRpc }),
}));

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
  };
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

// ─── Stream C pending — all tests marked todo ─────────────────────────────────
//
// When Stream C ships, replace it.todo('...') with it('...') and add the
// import for the handler at the top of the file:
//
//   import scheduledJobsHandler from '../../api/atrium/scheduled-jobs.ts';

describe('GET /api/atrium/scheduled-jobs', () => {
  it.todo('returns 200 with job list array when handler ships (Stream C pending)');
  it.todo('returns 200 with empty array when no jobs configured');
  it.todo('returns 500 with structured error on RPC failure');
});

describe('PATCH /api/atrium/scheduled-jobs — toggle active state', () => {
  it.todo('returns 200 with updated job when active toggled off');
  it.todo('returns 200 with updated job when active toggled on');
  it.todo('returns 404 when job id does not exist');
});

describe('POST /api/atrium/scheduled-jobs — manual trigger', () => {
  it.todo('returns 200 and records ns_append_ledger_signal audit entry');
  it.todo('returns 404 when job id does not exist');
  it.todo('returns 400 when id param is missing');
});

// ─── Placeholder to confirm test file is loaded ───────────────────────────────

describe('scheduled-jobs — Stream C status', () => {
  it('documents Stream C as pending (tests will auto-activate on ship)', () => {
    // This passes immediately. Its purpose is to confirm this test file is
    // picked up by vitest so we know the todo tests will surface on activation.
    expect(true).toBe(true);
    console.log(
      '[INFO] api-scheduled-jobs.test.ts loaded. Stream C pending — ' +
      '9 tests marked todo. Remove .todo() when api/atrium/scheduled-jobs.ts ships.',
    );
  });
});

// ─── Contract shape reference (for Stream C implementor) ─────────────────────

describe('scheduled-jobs — contract reference', () => {
  it('documents the expected ScheduledJob shape', () => {
    // This test exists to give the Stream C implementor a clear target.
    const exampleJob = {
      id: 'job-1',
      name: 'morning-brief',
      cron: '0 8 * * 1-5',
      active: true,
      last_run: '2026-05-09T08:00:00Z',
      next_run: '2026-05-10T08:00:00Z',
    };

    // Required fields
    expect(exampleJob).toHaveProperty('id');
    expect(exampleJob).toHaveProperty('name');
    expect(exampleJob).toHaveProperty('cron');
    expect(exampleJob).toHaveProperty('active');

    // Types
    expect(typeof exampleJob.id).toBe('string');
    expect(typeof exampleJob.name).toBe('string');
    expect(typeof exampleJob.cron).toBe('string');
    expect(typeof exampleJob.active).toBe('boolean');
  });

  it('documents the expected audit call params on manual trigger', () => {
    // When the trigger endpoint ships, ns_append_ledger_signal must be called with:
    const _expectedAuditParams = {
      p_source_type: 'atrium_ui',
      p_source_id: 'job/<job-id>',
      p_summary: 'scheduled_job_manual_trigger:<job-name>',
      p_insights: { job_id: '<id>', triggered_by: 'manual' },
    };
    // Structural assertion — ensure the shape is well-formed before Stream C ships
    expect(_expectedAuditParams.p_source_type).toBe('atrium_ui');
    expect(_expectedAuditParams.p_summary).toContain('scheduled_job_manual_trigger');
    expect(_expectedAuditParams.p_insights).toHaveProperty('triggered_by');
  });

  it('documents that makeReq and makeRes stubs are correct shape for when handler ships', () => {
    const req = makeReq('GET', { query: { id: 'job-1' } });
    const res = makeRes();

    expect(req.method).toBe('GET');
    expect(req.query).toEqual({ id: 'job-1' });
    expect(typeof res.status).toBe('function');
    expect(typeof res.json).toBe('function');
  });
});
