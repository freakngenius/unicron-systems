// src/__tests__/api-skills-run.test.ts
// Integration tests for POST /api/atrium/skills/run.
//
// The skills/run handler uses:
//   - checkAuth() — reads UNICRON_INTERNAL_API_KEY env var
//   - makeSupabase() — reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//   - Various skill runners that call sb.rpc(...)
//
// We mock @supabase/supabase-js and control all RPC responses.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockRpc = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: mockRpc }),
}));

const { default: skillsRunHandler } = await import(
  '../../api/atrium/skills/run.ts' as string
);

// ─── Request / Response stubs ─────────────────────────────────────────────────

function makeReq(
  method: string,
  opts: {
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  return {
    method,
    query: {},
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

// ─── Environment setup ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  // No UNICRON_INTERNAL_API_KEY → auth passes in non-production env
  delete process.env.UNICRON_INTERNAL_API_KEY;
  delete process.env.VERCEL_ENV;
  delete process.env.SLACK_BOT_TOKEN;
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe('POST /api/atrium/skills/run — auth', () => {
  it('returns 401 when api key is required but missing', async () => {
    process.env.UNICRON_INTERNAL_API_KEY = 'secret-key';
    process.env.VERCEL_ENV = 'production';

    const req = makeReq('POST', { body: { skill_slug: 'morning-brief' } });
    const res = makeRes();
    await skillsRunHandler(req as never, res as never);

    expect(res._status).toBe(401);
    expect((res._body as Record<string, string>).ok).toBe(false);
  });

  it('passes auth when correct api key is provided', async () => {
    process.env.UNICRON_INTERNAL_API_KEY = 'secret-key';

    // morning-brief calls two RPCs: ns_morning_brief_ledger + ns_morning_brief_action_items
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    // audit RPC call
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const req = makeReq('POST', {
      body: { skill_slug: 'morning-brief' },
      headers: { 'x-unicron-api-key': 'secret-key' },
    });
    const res = makeRes();
    await skillsRunHandler(req as never, res as never);

    expect(res._status).toBe(200);
  });
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe('POST /api/atrium/skills/run — validation', () => {
  it('returns 400 when skill_slug is missing', async () => {
    const req = makeReq('POST', { body: {} });
    const res = makeRes();
    await skillsRunHandler(req as never, res as never);

    expect(res._status).toBe(400);
    expect((res._body as Record<string, string>).error).toMatch(/skill_slug is required/i);
  });

  it('returns 400 when skill_slug is not a string', async () => {
    const req = makeReq('POST', { body: { skill_slug: 42 } });
    const res = makeRes();
    await skillsRunHandler(req as never, res as never);

    expect(res._status).toBe(400);
  });

  it('returns 405 for non-POST methods', async () => {
    const req = makeReq('GET');
    const res = makeRes();
    await skillsRunHandler(req as never, res as never);

    expect(res._status).toBe(405);
  });

  it('returns 500 when Supabase env vars are missing', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const req = makeReq('POST', { body: { skill_slug: 'morning-brief' } });
    const res = makeRes();
    await skillsRunHandler(req as never, res as never);

    expect(res._status).toBe(500);
    expect((res._body as Record<string, string>).error).toMatch(/supabase env/i);
  });
});

// ─── morning-brief ────────────────────────────────────────────────────────────

describe('POST /api/atrium/skills/run — morning-brief', () => {
  it('returns 200 with structured message and delivered_via_slack=false when no Slack token', async () => {
    // ns_morning_brief_ledger
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'sig-1',
          source_type: 'slack',
          content_summary: 'Team standup completed',
          strength: 0.8,
          created_at: new Date().toISOString(),
          status: null,
        },
      ],
      error: null,
    });
    // ns_morning_brief_action_items
    mockRpc.mockResolvedValueOnce({
      data: [{ id: 'ai-1', title: 'Review Zedcor proposal', priority: 'high', status: 'open', break_off_signal_id: null, total_count: 1 }],
      error: null,
    });
    // audit log
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const req = makeReq('POST', {
      body: { skill_slug: 'morning-brief', team_member_id: 'tm-123' },
    });
    const res = makeRes();
    await skillsRunHandler(req as never, res as never);

    expect(res._status).toBe(200);
    const body = res._body as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.skill_slug).toBe('morning-brief');
    expect(typeof body.message).toBe('string');
    expect(body.message).toContain('Morning Brief');
    expect(body.delivered_via_slack).toBe(false);
  });

  it('returns 200 even without team_member_id', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const req = makeReq('POST', { body: { skill_slug: 'morning-brief' } });
    const res = makeRes();
    await skillsRunHandler(req as never, res as never);

    expect(res._status).toBe(200);
    expect((res._body as Record<string, unknown>).delivered_via_slack).toBe(false);
  });
});

// ─── Unknown skill → 404 ──────────────────────────────────────────────────────

describe('POST /api/atrium/skills/run — unknown skill', () => {
  it('returns 404 for a completely unknown skill slug', async () => {
    const req = makeReq('POST', { body: { skill_slug: 'nonexistent-skill-xyz' } });
    const res = makeRes();
    await skillsRunHandler(req as never, res as never);

    expect(res._status).toBe(404);
    expect((res._body as Record<string, unknown>).ok).toBe(false);
    expect((res._body as Record<string, string>).error).toContain('nonexistent-skill-xyz');
  });
});

// ─── Scaffolded skill → 202 ───────────────────────────────────────────────────

describe('POST /api/atrium/skills/run — scaffolded skills', () => {
  it('returns 202 with scaffolded status for light-rag-query', async () => {
    // auditSkillRun is fire-and-forget — mock it so it doesn't throw
    mockRpc.mockResolvedValue({ data: null, error: null });

    const req = makeReq('POST', { body: { skill_slug: 'light-rag-query' } });
    const res = makeRes();
    await skillsRunHandler(req as never, res as never);

    expect(res._status).toBe(202);
    const body = res._body as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.status).toBe('scaffolded');
  });

  it('returns 202 for morning-trend-scan (scaffolded)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const req = makeReq('POST', { body: { skill_slug: 'morning-trend-scan' } });
    const res = makeRes();
    await skillsRunHandler(req as never, res as never);

    expect(res._status).toBe(202);
  });
});

// ─── track-pipeline-stage: missing required params ───────────────────────────

describe('POST /api/atrium/skills/run — track-pipeline-stage validation', () => {
  it('returns 400 when customer_id is missing', async () => {
    const req = makeReq('POST', {
      body: { skill_slug: 'track-pipeline-stage', new_stage: 'qualified' },
    });
    const res = makeRes();
    await skillsRunHandler(req as never, res as never);

    expect(res._status).toBe(400);
    expect((res._body as Record<string, string>).error).toMatch(/customer_id is required/i);
  });

  it('returns 400 when new_stage is missing', async () => {
    const req = makeReq('POST', {
      body: { skill_slug: 'track-pipeline-stage', customer_id: 'cust-1' },
    });
    const res = makeRes();
    await skillsRunHandler(req as never, res as never);

    expect(res._status).toBe(400);
    expect((res._body as Record<string, string>).error).toMatch(/new_stage is required/i);
  });

  it('returns 500 when invalid pipeline stage is supplied', async () => {
    const req = makeReq('POST', {
      body: {
        skill_slug: 'track-pipeline-stage',
        customer_id: 'cust-1',
        new_stage: 'INVALID_STAGE',
      },
    });
    const res = makeRes();
    await skillsRunHandler(req as never, res as never);

    // Invalid stage throws inside the skill runner → caught → 500
    expect(res._status).toBe(500);
    expect((res._body as Record<string, string>).error).toMatch(/invalid pipeline stage/i);
  });
});
