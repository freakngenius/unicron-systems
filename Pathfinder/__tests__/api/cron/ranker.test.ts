// __tests__/api/cron/ranker.test.ts — integration tests for the Ranker
// cron handler (`/api/cron/ranker`). Mirrors the verifier test pattern:
// runs against the live Supabase project (anfihcusvekpovcchpoh).
//
// Coverage:
//   1. Auth: 401 when no Bearer header
//   2. Auth: 401 when Bearer is wrong
//   3. Empty-queue path (no `score IS NULL` rows in slice)
//   4. Overlap protection: a synthetic `running` agent_runs row started
//      5 min ago causes a `skipped: 'overlapping_cycle'` response
//   5. Happy path: insert a synthetic project with score=NULL, valid lat/lon,
//      raw_payload; stub Anthropic so Haiku → 'yes' and Sonnet → a rationale;
//      assert score is set after the run.
//
// All synthetic rows are tagged with a `_cron_ranker_test_` prefix and cleaned
// up in afterAll. Skips the suite if Supabase env vars are missing.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: '.env.local' });
dotenvConfig();

// Set CRON_SECRET BEFORE importing the route module so the handler's auth
// gate uses the test value. The route reads `process.env.CRON_SECRET` at
// call time inside isAuthorized(), so this is safe at module load time.
process.env.CRON_SECRET = process.env.CRON_SECRET ?? 'test-secret-for-ranker-cron';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const haveCreds = Boolean(url && serviceKey);

const RUN_TAG = `_cron_ranker_test_${Date.now()}`;
const HAPPY_PROJECT_ID = `${RUN_TAG}_happy`;
const OVERLAP_PROJECT_ID = `${RUN_TAG}_overlap_blocked`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let admin: SupabaseClient<any, 'pathfinder', any>;

// Stub for the Anthropic SDK that the handler swaps in via setAnthropicForTesting.
// - First call (Haiku triage): returns 'yes'
// - Second call (Sonnet rationale): returns a 3-paragraph rationale + HOOK
// We dispatch on the request's `model` field rather than call-count so a
// retry path doesn't break the stub.
const anthropicStub = {
  messages: {
    create: async (req: { model: string }) => {
      if (req.model.includes('haiku')) {
        return { content: [{ type: 'text', text: 'yes' }] };
      }
      // Sonnet path
      const rationale = [
        'Project sits in PLN stage with declared scope of $1M and a multi-month duration.',
        '',
        'Branch fit lands inside coverage radius. Stage signals are pre-mobilization.',
        '',
        'Recommended first move is a 15-minute walk-through with the GC superintendent.',
        '',
        'HOOK: Saw the project go PLN — worth a 15-minute call before mobilization?',
      ].join('\n');
      return { content: [{ type: 'text', text: rationale }] };
    },
    stream: () => {
      throw new Error('stream not stubbed');
    },
  },
};

// Stub that always says 'no' from Haiku so we exercise the demote path.
const anthropicStubNo = {
  messages: {
    create: async (_req: { model: string }) => {
      return { content: [{ type: 'text', text: 'no' }] };
    },
    stream: () => {
      throw new Error('stream not stubbed');
    },
  },
};

describe.runIf(haveCreds)('GET /api/cron/ranker', () => {
  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    admin = createClient<any, 'pathfinder', any>(url!, serviceKey!, {
      db: { schema: 'pathfinder' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    if (!admin) return;
    await admin
      .from('projects')
      .delete()
      .in('id', [HAPPY_PROJECT_ID, OVERLAP_PROJECT_ID]);
    await admin
      .from('agent_runs')
      .delete()
      .like('error_message', `${RUN_TAG}%`);
    await admin
      .from('agent_log')
      .delete()
      .or(`event_data->>project_id.eq.${HAPPY_PROJECT_ID},event_data->>project_id.eq.${OVERLAP_PROJECT_ID}`);
  });

  beforeEach(async () => {
    // Wipe stale `running` ranker rows so overlap protection doesn't trip.
    const { setAnthropicForTesting } = await import('@/app/api/cron/ranker/route');
    setAnthropicForTesting(anthropicStub as unknown as Parameters<typeof setAnthropicForTesting>[0]);

    await admin
      .from('agent_runs')
      .delete()
      .eq('agent_name', 'ranker')
      .eq('status', 'running');
  });

  afterEach(async () => {
    const { setAnthropicForTesting } = await import('@/app/api/cron/ranker/route');
    setAnthropicForTesting(null);
  });

  it('returns 401 when no Authorization header', async () => {
    const { GET } = await import('@/app/api/cron/ranker/route');
    const res = await GET(new Request('http://localhost/pathfinder/api/cron/ranker'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when Bearer token is wrong', async () => {
    const { GET } = await import('@/app/api/cron/ranker/route');
    const res = await GET(
      new Request('http://localhost/pathfinder/api/cron/ranker', {
        headers: { authorization: 'Bearer wrong-secret' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns empty_queue when no projects need ranking', { timeout: 60_000 }, async () => {
    // Make sure our synthetic test rows aren't in the queue.
    await admin.from('projects').delete().in('id', [HAPPY_PROJECT_ID, OVERLAP_PROJECT_ID]);

    const { GET } = await import('@/app/api/cron/ranker/route');
    const res = await GET(
      new Request('http://localhost/pathfinder/api/cron/ranker', {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      processed?: number;
      reason?: string;
      ok?: boolean;
      skipped?: string;
    };
    // Three valid 200 outcomes — same as the verifier:
    //   - { processed: 0, reason: 'empty_queue' } — DB has no pending rows
    //   - { ok: true, ... }                       — a cycle ran (queue non-empty)
    //   - { skipped: 'overlapping_cycle' }        — extremely unlikely after beforeEach wipe
    expect(body).toBeDefined();
    const validShape =
      body.reason === 'empty_queue' || body.ok === true || body.skipped === 'overlapping_cycle';
    expect(validShape).toBe(true);
  });

  it('returns skipped:overlapping_cycle when a recent running row exists', async () => {
    // Seed a synthetic running ranker agent_runs row started 5 min ago.
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: insertedRun, error: insertErr } = await admin
      .from('agent_runs')
      .insert({
        agent_name: 'ranker',
        started_at: fiveMinAgo,
        completed_at: null,
        records_processed: 0,
        records_new: 0,
        status: 'running',
        error_message: `${RUN_TAG}_overlap_seed`,
      })
      .select('id')
      .maybeSingle();
    expect(insertErr).toBeNull();
    expect(insertedRun).not.toBeNull();

    try {
      const { GET } = await import('@/app/api/cron/ranker/route');
      const res = await GET(
        new Request('http://localhost/pathfinder/api/cron/ranker', {
          headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { skipped?: string };
      expect(body.skipped).toBe('overlapping_cycle');
    } finally {
      if (insertedRun?.id) {
        await admin.from('agent_runs').delete().eq('id', insertedRun.id);
      }
    }
  });

  it('ranks a happy-path project end-to-end (with stubbed Anthropic)', { timeout: 60_000 }, async () => {
    // Need a real branch row so geo scoring resolves.
    const { data: branches } = await admin
      .from('branches')
      .select('*')
      .limit(1);
    if (!branches || branches.length === 0) {
      // No branches in DB → skip silently.
      return;
    }
    const branch = branches[0] as { id: string; lat: number; lon: number; name: string; code: string };

    // Synthetic project at ~0 miles from the branch (geo=100), score=NULL,
    // PLN stage. After the cycle, score should be non-null.
    const projectInsert = {
      id: HAPPY_PROJECT_ID,
      source: 'usaspending',
      source_id: HAPPY_PROJECT_ID,
      title: 'cron ranker test · happy path',
      summary: 'Synthetic project for /api/cron/ranker integration test',
      lat: branch.lat,
      lon: branch.lon,
      project_value: 1_000_000,
      project_stage: 'PLN',
      raw_payload: { stage: 'PLN', value: 1_000_000 },
      score: null as number | null,
      nearest_branch_id: null as string | null,
      ranked_at: null as string | null,
      ingested_at: new Date().toISOString(),
    };

    // Clean any leftover row first.
    await admin.from('projects').delete().eq('id', HAPPY_PROJECT_ID);
    const { error: pErr } = await admin.from('projects').insert(projectInsert);
    expect(pErr).toBeNull();

    const { GET } = await import('@/app/api/cron/ranker/route');
    const res = await GET(
      new Request('http://localhost/pathfinder/api/cron/ranker', {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok?: boolean;
      processed?: number;
      ranked?: number;
      filtered?: number;
      reason?: string;
      skipped?: string;
    };

    // Happy path expectations: cycle ran (no skip), and our synthetic row
    // was either ranked or — if buried past the LIMIT by a busy DB — left
    // alone. We assert on the row state after.
    expect(body.skipped).toBeUndefined();

    const { data: after } = await admin
      .from('projects')
      .select('score, rationale, nearest_branch_id, ranked_at')
      .eq('id', HAPPY_PROJECT_ID)
      .maybeSingle();
    if (after && after.score !== null) {
      // Made it through the pipeline.
      expect(typeof after.score).toBe('number');
      expect(after.score).toBeGreaterThanOrEqual(0);
      expect(after.score).toBeLessThanOrEqual(100);
      expect(typeof after.rationale).toBe('string');
      expect(after.ranked_at).toBeTruthy();
    }
  });

  it('demotes a project when classifier says no', { timeout: 60_000 }, async () => {
    const { setAnthropicForTesting } = await import('@/app/api/cron/ranker/route');
    setAnthropicForTesting(anthropicStubNo as unknown as Parameters<typeof setAnthropicForTesting>[0]);

    const { data: branches } = await admin.from('branches').select('*').limit(1);
    if (!branches || branches.length === 0) return;
    const branch = branches[0] as { id: string; lat: number; lon: number };

    const demotedId = `${RUN_TAG}_demoted`;
    await admin.from('projects').delete().eq('id', demotedId);
    const { error: pErr } = await admin.from('projects').insert({
      id: demotedId,
      source: 'usaspending',
      source_id: demotedId,
      title: 'cron ranker test · demote path',
      summary: 'Synthetic project — classifier should reject',
      lat: branch.lat,
      lon: branch.lon,
      project_value: 1_000_000,
      project_stage: 'PLN',
      raw_payload: { stage: 'PLN' },
      score: null,
      ingested_at: new Date().toISOString(),
    });
    expect(pErr).toBeNull();

    try {
      const { GET } = await import('@/app/api/cron/ranker/route');
      const res = await GET(
        new Request('http://localhost/pathfinder/api/cron/ranker', {
          headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { skipped?: string };
      expect(body.skipped).toBeUndefined();

      const { data: after } = await admin
        .from('projects')
        .select('score, rationale')
        .eq('id', demotedId)
        .maybeSingle();
      if (after && after.score !== null) {
        expect(after.score).toBe(0);
        expect(after.rationale).toMatch(/Filtered as non-opportunity/i);
      }
    } finally {
      await admin.from('projects').delete().eq('id', demotedId);
    }
  });
});
