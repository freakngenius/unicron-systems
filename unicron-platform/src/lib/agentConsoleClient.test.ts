import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDispatch,
  listDispatches,
  verifyDispatch,
  rejectDispatch,
  appendEvent,
} from './agentConsoleClient';
import type { AgentDispatch, AgentDispatchEvent } from './contracts/agentConsole';
import { __resetSupabaseForTests } from './supabase';

// Mock the Supabase client surface. We assert on the chained call shape
// (schema → from → insert/update/select/eq → single) since that's what the
// client wraps. Strict-but-readable: each mock returns the next chain object
// or the final { data, error } payload.

type Builder = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  gt: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: ReturnType<typeof vi.fn>;
};

let lastBuilder: Builder | null = null;

function makeBuilder(final: { data: unknown; error: unknown }): Builder {
  const builder: Partial<Builder> = {};
  const fluent = vi.fn(() => builder as Builder);
  builder.select = fluent;
  builder.insert = fluent;
  builder.update = fluent;
  builder.eq = fluent;
  builder.gte = fluent;
  builder.gt = fluent;
  builder.order = fluent;
  builder.limit = fluent;
  builder.single = vi.fn(async () => final);
  builder.maybeSingle = vi.fn(async () => final);
  // Implement thenable so `await query` resolves directly when callers don't
  // call .single()/.maybeSingle() (e.g. listDispatches / listEvents).
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
  return {
    schema,
    from,
  };
}

vi.mock('./supabase', async () => {
  const actual = await vi.importActual<typeof import('./supabase')>('./supabase');
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

const FIXTURE_DISPATCH: AgentDispatch = {
  id: '11111111-1111-1111-1111-111111111111',
  agent_name: 'test-agent',
  customer_org_id: 'zedcor',
  dispatched_by_user_id: null,
  input_payload: { foo: 'bar' },
  status: 'queued',
  result_payload: null,
  rejection_reason: null,
  verified_by_user_id: null,
  verified_at: null,
  cost_usd: null,
  duration_ms: null,
  agent_run_id: null,
  parent_dispatch_id: null,
  created_at: '2026-05-02T18:00:00Z',
  updated_at: '2026-05-02T18:00:00Z',
};

describe('agentConsoleClient', () => {
  it('createDispatch inserts with status=queued + the supplied payload', async () => {
    const supa = mockSupabase({ data: FIXTURE_DISPATCH, error: null });
    const { getSupabase } = await import('./supabase');
    (getSupabase as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(supa);

    const out = await createDispatch({
      agent_name: 'test-agent',
      customer_org_id: 'zedcor',
      input_payload: { foo: 'bar' },
    });

    expect(supa.schema).toHaveBeenCalledWith('unicron');
    expect(lastBuilder?.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_name: 'test-agent',
        customer_org_id: 'zedcor',
        status: 'queued',
        input_payload: { foo: 'bar' },
      }),
    );
    expect(out).toEqual(FIXTURE_DISPATCH);
  });

  it('listDispatches applies agent_name + customer_org_id + status filters', async () => {
    const supa = mockSupabase({ data: [FIXTURE_DISPATCH], error: null });
    const { getSupabase } = await import('./supabase');
    (getSupabase as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(supa);

    const rows = await listDispatches({
      agent_name: 'test-agent',
      customer_org_id: 'zedcor',
      status: 'awaiting_review',
      limit: 10,
    });

    expect(rows).toEqual([FIXTURE_DISPATCH]);
    expect(lastBuilder?.eq).toHaveBeenCalledWith('agent_name', 'test-agent');
    expect(lastBuilder?.eq).toHaveBeenCalledWith('customer_org_id', 'zedcor');
    expect(lastBuilder?.eq).toHaveBeenCalledWith('status', 'awaiting_review');
    expect(lastBuilder?.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(lastBuilder?.limit).toHaveBeenCalledWith(10);
  });

  it('verifyDispatch sets status=verified, verified_by_user_id, verified_at', async () => {
    const verified = { ...FIXTURE_DISPATCH, status: 'verified' as const };
    const supa = mockSupabase({ data: verified, error: null });
    const { getSupabase } = await import('./supabase');
    (getSupabase as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(supa);

    await verifyDispatch({
      id: FIXTURE_DISPATCH.id,
      verified_by_user_id: 'op-123',
    });

    const updateArg = (lastBuilder?.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateArg.status).toBe('verified');
    expect(updateArg.verified_by_user_id).toBe('op-123');
    expect(typeof updateArg.verified_at).toBe('string');
    expect(lastBuilder?.eq).toHaveBeenCalledWith('id', FIXTURE_DISPATCH.id);
  });

  it('rejectDispatch sets status=rejected and writes the rejection_reason', async () => {
    const rejected = {
      ...FIXTURE_DISPATCH,
      status: 'rejected' as const,
      rejection_reason: 'because',
    };
    const supa = mockSupabase({ data: rejected, error: null });
    const { getSupabase } = await import('./supabase');
    (getSupabase as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(supa);

    await rejectDispatch({
      id: FIXTURE_DISPATCH.id,
      verified_by_user_id: 'op-123',
      rejection_reason: 'because',
    });

    const updateArg = (lastBuilder?.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateArg.status).toBe('rejected');
    expect(updateArg.rejection_reason).toBe('because');
    expect(updateArg.verified_by_user_id).toBe('op-123');
  });

  it('appendEvent inserts an event tied to the dispatch', async () => {
    const event: AgentDispatchEvent = {
      id: '22222222-2222-2222-2222-222222222222',
      dispatch_id: FIXTURE_DISPATCH.id,
      event_type: 'reasoning',
      payload: { text: 'thinking' },
      created_at: '2026-05-02T18:01:00Z',
    };
    const supa = mockSupabase({ data: event, error: null });
    const { getSupabase } = await import('./supabase');
    (getSupabase as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(supa);

    const out = await appendEvent({
      dispatch_id: FIXTURE_DISPATCH.id,
      event_type: 'reasoning',
      payload: { text: 'thinking' },
    });

    expect(out).toEqual(event);
    expect(lastBuilder?.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatch_id: FIXTURE_DISPATCH.id,
        event_type: 'reasoning',
      }),
    );
  });
});
