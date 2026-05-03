import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIT_LOG_PAGE_SIZE,
  listAuditLog,
  summarizeDispatch,
  timeWindowToSinceIso,
} from './auditLogClient';
import type { AgentDispatch } from '../contracts/agentConsole';
import { __resetSupabaseForTests } from '../supabase';

type Builder = {
  select: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  then: ReturnType<typeof vi.fn>;
};

let lastBuilder: Builder | null = null;

function makeBuilder(final: { data: unknown; error: unknown }): Builder {
  const builder: Partial<Builder> = {};
  // Each method gets its own spy so per-method call assertions are precise.
  const ret = () => builder as Builder;
  builder.select = vi.fn(ret);
  builder.not = vi.fn(ret);
  builder.eq = vi.fn(ret);
  builder.gte = vi.fn(ret);
  builder.ilike = vi.fn(ret);
  builder.order = vi.fn(ret);
  builder.range = vi.fn(ret);
  builder.then = vi.fn((onFulfilled: (v: typeof final) => unknown) =>
    Promise.resolve(final).then(onFulfilled),
  );
  return builder as Builder;
}

function mockSupabase(final: { data: unknown; error: unknown }) {
  const builder = makeBuilder(final);
  lastBuilder = builder;
  const from = vi.fn(() => builder);
  const schema = vi.fn(() => ({ from }));
  return { schema, from };
}

vi.mock('../supabase', async () => {
  const actual = await vi.importActual<typeof import('../supabase')>('../supabase');
  return {
    ...actual,
    getSupabase: vi.fn(),
  };
});

beforeEach(() => {
  __resetSupabaseForTests();
});

afterEach(() => {
  vi.clearAllMocks();
  lastBuilder = null;
});

const FIXTURE: AgentDispatch = {
  id: 'd1',
  agent_name: 'coverage-expansion',
  customer_org_id: 'zedcor',
  dispatched_by_user_id: 'op-a',
  input_payload: { prompt: 'Find adjacent contractors' },
  status: 'verified',
  result_payload: { summary: 'Found 12 prospects' },
  rejection_reason: null,
  verified_by_user_id: 'kyle@demystified.ai',
  verified_at: '2026-05-02T18:00:00Z',
  cost_usd: 0.12,
  duration_ms: 4800,
  agent_run_id: null,
  parent_dispatch_id: null,
  created_at: '2026-05-02T17:55:00Z',
  updated_at: '2026-05-02T18:00:00Z',
};

describe('auditLogClient.listAuditLog', () => {
  it('filters to verified rows only and orders by verified_at desc', async () => {
    const supa = mockSupabase({ data: [FIXTURE], error: null });
    const { getSupabase } = await import('../supabase');
    (getSupabase as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(supa);

    const out = await listAuditLog();

    expect(supa.schema).toHaveBeenCalledWith('unicron');
    expect(lastBuilder?.not).toHaveBeenCalledWith('verified_at', 'is', null);
    expect(lastBuilder?.order).toHaveBeenCalledWith('verified_at', { ascending: false });
    expect(out.rows).toEqual([FIXTURE]);
    expect(out.page).toBe(0);
    expect(out.hasMore).toBe(false);
  });

  it('caps page size at AUDIT_LOG_PAGE_SIZE via .range()', async () => {
    const supa = mockSupabase({ data: [], error: null });
    const { getSupabase } = await import('../supabase');
    (getSupabase as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(supa);

    await listAuditLog({ page: 2 });

    expect(lastBuilder?.range).toHaveBeenCalledWith(
      2 * AUDIT_LOG_PAGE_SIZE,
      2 * AUDIT_LOG_PAGE_SIZE + AUDIT_LOG_PAGE_SIZE - 1,
    );
  });

  it('applies agent_name + verified_by + window filters', async () => {
    const supa = mockSupabase({ data: [], error: null });
    const { getSupabase } = await import('../supabase');
    (getSupabase as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(supa);

    await listAuditLog({
      agent_name: 'coverage-expansion',
      verified_by: 'kyle',
      window: '7d',
    });

    expect(lastBuilder?.eq).toHaveBeenCalledWith('agent_name', 'coverage-expansion');
    expect(lastBuilder?.ilike).toHaveBeenCalledWith('verified_by_user_id', '%kyle%');
    // window=7d should produce a gte('verified_at', <iso>) call
    expect(lastBuilder?.gte).toHaveBeenCalled();
    const gteCall = (lastBuilder?.gte as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(gteCall[0]).toBe('verified_at');
    expect(typeof gteCall[1]).toBe('string');
  });

  it('window=all skips the verified_at gte filter', async () => {
    const supa = mockSupabase({ data: [], error: null });
    const { getSupabase } = await import('../supabase');
    (getSupabase as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(supa);

    await listAuditLog({ window: 'all' });

    expect(lastBuilder?.gte).not.toHaveBeenCalled();
  });

  it('hasMore = true when result fills the page', async () => {
    const fullPage = Array.from({ length: AUDIT_LOG_PAGE_SIZE }, (_, i) => ({
      ...FIXTURE,
      id: `d${i}`,
    }));
    const supa = mockSupabase({ data: fullPage, error: null });
    const { getSupabase } = await import('../supabase');
    (getSupabase as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(supa);

    const out = await listAuditLog();
    expect(out.hasMore).toBe(true);
    expect(out.rows).toHaveLength(AUDIT_LOG_PAGE_SIZE);
  });

  it('throws when supabase returns an error', async () => {
    const supa = mockSupabase({ data: null, error: { message: 'boom' } });
    const { getSupabase } = await import('../supabase');
    (getSupabase as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(supa);

    await expect(listAuditLog()).rejects.toBeTruthy();
  });
});

describe('timeWindowToSinceIso', () => {
  it('returns null for "all"', () => {
    expect(timeWindowToSinceIso('all')).toBeNull();
  });

  it('returns ~24h offset for "24h"', () => {
    const now = new Date('2026-05-03T12:00:00Z');
    expect(timeWindowToSinceIso('24h', now)).toBe('2026-05-02T12:00:00.000Z');
  });

  it('returns ~7d offset for "7d"', () => {
    const now = new Date('2026-05-08T00:00:00Z');
    expect(timeWindowToSinceIso('7d', now)).toBe('2026-05-01T00:00:00.000Z');
  });
});

describe('summarizeDispatch', () => {
  it('prefers result_payload.summary', () => {
    expect(summarizeDispatch(FIXTURE)).toBe('Found 12 prospects');
  });

  it('falls back to input_payload.prompt', () => {
    const d = { ...FIXTURE, result_payload: null };
    expect(summarizeDispatch(d)).toBe('Find adjacent contractors');
  });

  it('truncates long summaries with an ellipsis', () => {
    const long = 'x'.repeat(200);
    const d = { ...FIXTURE, result_payload: { summary: long } };
    const out = summarizeDispatch(d);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(120);
  });

  it('falls back to a status-aware label when payloads are empty', () => {
    const d: AgentDispatch = {
      ...FIXTURE,
      input_payload: {},
      result_payload: null,
      status: 'rejected',
    };
    expect(summarizeDispatch(d)).toBe('Rejected dispatch');
  });
});
