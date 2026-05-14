// api/skills/search.test.ts — Sprint 9 Stream B
//
// Integration test for the hybrid FTS+vector search endpoint. We mock the
// Supabase client and the embedQuery helper at the module boundary.
//
// Coverage:
//   - FTS-only path returns the seeded Zedcor Skill on the exact-phrase query.
//   - Vector-only path returns the seeded Zedcor Skill on the semantic query.
//   - Both paths together fuse via RRF and return the shared id at rank 1.
//   - OPENAI_API_KEY missing → embedding_degraded=true, FTS still runs.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Hoisted mock state controlled per test.
const state = {
  ftsRows: [] as Array<{ id: string }>,
  vectorRows: [] as Array<{ id: string }>,
  hydratedRows: [] as Array<Record<string, unknown>>,
  embedQueryImpl: undefined as ((q: string) => Promise<number[]>) | undefined,
};

vi.mock('../../lib/agents/vault-embeddings.js', () => ({
  embedQuery: vi.fn(async (q: string) => {
    const s = (globalThis as { __searchTestState__?: typeof state }).__searchTestState__;
    if (s?.embedQueryImpl) return s.embedQueryImpl(q);
    return new Array(1536).fill(0);
  }),
}));

vi.mock('../../lib/skills/supabase.js', async () => {
  // Local lazy ref — vi.mock factory is hoisted, so we cannot close over
  // the `state` const directly here. We use a getter into globalThis where
  // the test sets `__searchTestState__` at runtime.
  function getState() {
    return (globalThis as { __searchTestState__?: typeof state }).__searchTestState__!;
  }
  function makeBuilder() {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = vi.fn(chain);
    builder.eq = vi.fn(chain);
    builder.neq = vi.fn(chain);
    builder.in = vi.fn(chain);
    builder.is = vi.fn(chain);
    builder.or = vi.fn(chain);
    builder.limit = vi.fn(chain);
    builder.order = vi.fn(chain);
    builder.maybeSingle = vi.fn(async () => ({ data: getState().hydratedRows[0] ?? null, error: null }));
    builder.single = vi.fn(async () => ({ data: getState().hydratedRows[0] ?? null, error: null }));
    builder.then = (resolve: (v: { data: Record<string, unknown>[]; error: null }) => unknown) =>
      resolve({ data: getState().hydratedRows, error: null });
    return builder;
  }
  const sb = {
    rpc: vi.fn(async (fn: string) => {
      const s = getState();
      if (fn === 'ns_skills_search_by_fts') {
        return { data: s.ftsRows, error: null };
      }
      if (fn === 'ns_skills_search_by_vector') {
        return { data: s.vectorRows, error: null };
      }
      return { data: null, error: { message: `unmocked rpc: ${fn}` } };
    }),
    schema: vi.fn(() => ({ from: vi.fn(() => makeBuilder()) })),
  };
  return {
    getSkillsServiceClient: vi.fn(() => sb),
    skillsTable: vi.fn(() => makeBuilder()),
    proposedSkillsTable: vi.fn(),
    skillInvocationsTable: vi.fn(),
  };
});

vi.mock('../../lib/skills/auth.js', () => ({
  checkSkillsAuth: vi.fn(async () => ({ ok: true, mode: 'internal' })),
}));

// Import AFTER mocks.
import handler from './search';

interface CapturedRes {
  status: number;
  body: unknown;
}

function mockReq(body: unknown): VercelRequest {
  return { method: 'POST', body, headers: {}, query: {} } as unknown as VercelRequest;
}

function mockRes(): { res: VercelResponse; captured: CapturedRes } {
  const captured: CapturedRes = { status: 200, body: null };
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    setHeader() { return this; },
    json(body: unknown) {
      captured.body = body;
      return this;
    },
    end() { return this; },
  } as unknown as VercelResponse;
  return { res, captured };
}

const ZEDCOR_SKILL = {
  id: 'sk_zedcor_weekly',
  name: 'run_zedcor_weekly_digest',
  description: 'Weekly summary digest for Zedcor surveillance pilot',
  lifecycle_status: 'approved',
  status: 'active',
  customer_id: null,
  decay_at: null,
};

beforeEach(() => {
  state.ftsRows = [];
  state.vectorRows = [];
  state.hydratedRows = [];
  state.embedQueryImpl = undefined;
  (globalThis as { __searchTestState__?: typeof state }).__searchTestState__ = state;
  process.env.OPENAI_API_KEY = 'test-openai-key';
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.OPENAI_API_KEY;
});

describe('POST /api/skills/search', () => {
  it('returns 400 when query is missing', async () => {
    const { res, captured } = mockRes();
    await handler(mockReq({}), res);
    expect(captured.status).toBe(400);
    expect((captured.body as { error: string }).error).toMatch(/query is required/);
  });

  it('FTS path: returns seeded Zedcor Skill on "weekly summary for Zedcor"', async () => {
    state.ftsRows = [{ id: ZEDCOR_SKILL.id }];
    state.vectorRows = [];
    state.hydratedRows = [ZEDCOR_SKILL];

    const { res, captured } = mockRes();
    await handler(mockReq({ query: 'weekly summary for Zedcor' }), res);

    expect(captured.status).toBe(200);
    const body = captured.body as {
      ok: boolean;
      results: Array<{ skill: { id: string }; fts_rank: number | null }>;
    };
    expect(body.ok).toBe(true);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].skill.id).toBe(ZEDCOR_SKILL.id);
    expect(body.results[0].fts_rank).toBe(1);
  });

  it('vector path: returns seeded Zedcor Skill on "Zedcor digest"', async () => {
    state.ftsRows = [];
    state.vectorRows = [{ id: ZEDCOR_SKILL.id }];
    state.hydratedRows = [ZEDCOR_SKILL];

    const { res, captured } = mockRes();
    await handler(mockReq({ query: 'Zedcor digest' }), res);

    expect(captured.status).toBe(200);
    const body = captured.body as {
      results: Array<{ skill: { id: string }; vector_rank: number | null }>;
    };
    expect(body.results).toHaveLength(1);
    expect(body.results[0].skill.id).toBe(ZEDCOR_SKILL.id);
    expect(body.results[0].vector_rank).toBe(1);
  });

  it('hybrid path: RRF fuses both lists, shared id ranks #1', async () => {
    state.ftsRows = [
      { id: 'sk_a' },
      { id: ZEDCOR_SKILL.id },
    ];
    state.vectorRows = [{ id: ZEDCOR_SKILL.id }, { id: 'sk_b' }];
    state.hydratedRows = [
      ZEDCOR_SKILL,
      { ...ZEDCOR_SKILL, id: 'sk_a', name: 'other_a' },
      { ...ZEDCOR_SKILL, id: 'sk_b', name: 'other_b' },
    ];

    const { res, captured } = mockRes();
    await handler(mockReq({ query: 'Zedcor weekly summary' }), res);

    const body = captured.body as {
      results: Array<{ skill: { id: string }; rrf_score: number }>;
    };
    expect(body.results[0].skill.id).toBe(ZEDCOR_SKILL.id);
    // Score for shared id: 1/(60+2) + 1/(60+1)
    expect(body.results[0].rrf_score).toBeCloseTo(1 / 62 + 1 / 61, 8);
  });

  it('embedding degraded path: OPENAI_API_KEY missing → FTS-only with debug flag', async () => {
    delete process.env.OPENAI_API_KEY;
    state.ftsRows = [{ id: ZEDCOR_SKILL.id }];
    state.vectorRows = [];
    state.hydratedRows = [ZEDCOR_SKILL];

    const { res, captured } = mockRes();
    await handler(mockReq({ query: 'Zedcor digest' }), res);

    expect(captured.status).toBe(200);
    const body = captured.body as {
      results: Array<{ skill: { id: string } }>;
      debug: { embedding_degraded: boolean; embedding_degraded_reason?: string };
    };
    expect(body.results[0].skill.id).toBe(ZEDCOR_SKILL.id);
    expect(body.debug.embedding_degraded).toBe(true);
    expect(body.debug.embedding_degraded_reason).toMatch(/OPENAI_API_KEY/);
  });
});
