// __tests__/source-onboarder/session.test.ts
//
// Phase 2 reconciliation regression test (migration 0082 + session.ts patch).
//
// Asserts createSession populates Stream D's NOT NULL / CHECK-constrained
// columns (session_type='discovery', trigger in Stream D vocab,
// input_payload jsonb) AND Stream E's additive columns (agent_role, goal,
// input, status='running', created_by_user_email). Asserts finalizeSession
// writes status values that match the widened CHECK constraint.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lastInsert: { value: Record<string, unknown> | null } = { value: null };
const lastUpdate: { value: Record<string, unknown> | null } = { value: null };

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from: (_t: string) => ({
      insert: (rows: Record<string, unknown>[]) => {
        lastInsert.value = rows[0];
        return {
          select: () => ({
            single: async () => ({ data: { id: 'sess-stream-e-1' }, error: null }),
          }),
        };
      },
      update: (cols: Record<string, unknown>) => {
        lastUpdate.value = cols;
        return {
          eq: async () => ({ error: null }),
        };
      },
    }),
  }),
}));

import { createSession, finalizeSession } from '@/services/source-onboarder/session';

const STREAM_D_SESSION_TYPES = ['decomposition', 'tuning', 'discovery'] as const;
const STREAM_D_TRIGGERS = ['manual', 'cron', 'adjacency_threshold', 'operator_action', 'periodic'] as const;
const UNION_STATUSES = [
  'in_progress',
  'running',
  'completed',
  'succeeded',
  'failed',
  'timed_out',
  'needs_assist',
] as const;

beforeEach(() => {
  lastInsert.value = null;
  lastUpdate.value = null;
});

afterEach(() => vi.restoreAllMocks());

describe('createSession (Stream D coexistence)', () => {
  it('populates Stream D NOT NULL columns + Stream E additive columns', async () => {
    const session = await createSession({
      goal: 'https://data.cityofchicago.org/resource/4ijn-s7e5.json',
      input: { url: 'https://data.cityofchicago.org/resource/4ijn-s7e5.json', hint: 'socrata' },
      agentRole: 'source-onboarder',
      createdByUserEmail: 'kyle@demystified.ai',
    });
    expect(session.id).toBe('sess-stream-e-1');
    const row = lastInsert.value;
    expect(row).not.toBeNull();
    if (!row) throw new Error('insert never captured');

    // Stream D required columns
    expect(STREAM_D_SESSION_TYPES).toContain(row.session_type);
    expect(STREAM_D_TRIGGERS).toContain(row.trigger);
    expect(row.input_payload).toEqual({
      url: 'https://data.cityofchicago.org/resource/4ijn-s7e5.json',
      hint: 'socrata',
    });

    // Stream E additive columns
    expect(row.agent_role).toBe('source-onboarder');
    expect(row.goal).toBe('https://data.cityofchicago.org/resource/4ijn-s7e5.json');
    expect(row.input).toEqual(row.input_payload);
    expect(row.status).toBe('running');
    expect(UNION_STATUSES).toContain(row.status);
    expect(row.created_by_user_email).toBe('kyle@demystified.ai');
    expect(row.reasoning_log).toEqual([]);
  });

  it('defaults trigger to operator_action when not provided', async () => {
    await createSession({
      goal: 'g',
      input: {},
      agentRole: 'coverage-expansion',
    });
    expect(lastInsert.value?.trigger).toBe('operator_action');
  });

  it('honors caller-provided trigger if it is a Stream D vocabulary value', async () => {
    await createSession({
      goal: 'g',
      input: {},
      agentRole: 'source-onboarder',
      trigger: 'cron',
    });
    expect(lastInsert.value?.trigger).toBe('cron');
  });
});

describe('finalizeSession (status CHECK union)', () => {
  it.each(['succeeded', 'failed', 'needs_assist', 'timed_out'] as const)(
    'writes status=%s which is in the widened CHECK union',
    async (status) => {
      await finalizeSession({
        session: {
          id: 'sess-stream-e-1',
          startedAt: Date.now(),
          steps: [],
          costUsd: 0.01,
          llmCalls: 1,
          toolCalls: 2,
          log: () => undefined,
        },
        status,
        outcome: { outcome: status },
      });
      expect(lastUpdate.value?.status).toBe(status);
      expect(UNION_STATUSES).toContain(lastUpdate.value?.status as string);
    },
  );
});
