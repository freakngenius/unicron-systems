// __tests__/api/escalations.test.ts — integration test for
// /api/agents/escalations. Asserts the route returns only projects whose
// `verifier_pass_count >= 2` (i.e. projects the Verifier escalated to a
// human after two failed re-checks).
//
// Runs against the live Supabase project (anfihcusvekpovcchpoh) — same
// pattern as __tests__/schema/verifier.test.ts. Skips if the env vars
// aren't present (CI without secrets just no-ops).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as dotenvConfig } from 'dotenv';

// Load env BEFORE importing the route — `lib/supabase.ts` reads
// process.env at module-init time and throws if NEXT_PUBLIC_SUPABASE_URL
// is missing. Using a dynamic import inside the suite keeps that init
// from running until after dotenv has populated the env.
dotenvConfig({ path: '.env.local' });
dotenvConfig();

import type { Project } from '@/lib/types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const haveCreds = Boolean(url && serviceKey);

const RUN_TAG = `_escalation_test_${Date.now()}`;
const ESCALATED_ID = `${RUN_TAG}_escalated`;
const PASS_ONCE_ID = `${RUN_TAG}_pass_once`;
const PRISTINE_ID = `${RUN_TAG}_pristine`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let admin: SupabaseClient<any, 'pathfinder', any>;

describe.runIf(haveCreds)('/api/agents/escalations', () => {
  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    admin = createClient<any, 'pathfinder', any>(url!, serviceKey!, {
      db: { schema: 'pathfinder' },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Seed three rows: one above threshold (escalated), one at the gate
    // boundary (one pass — should NOT escalate), and a pristine row.
    // Zedcor's organization_id is required on every projects insert since
    // the Phase 2A completion migration made organization_id NOT NULL.
    const ZEDCOR_ORG_ID = '6cd87740-7c72-4337-ac79-316a54242eef';
    const seed = [
      {
        id: ESCALATED_ID,
        source: 'usaspending',
        source_id: ESCALATED_ID,
        title: 'escalation test · should escalate',
        verified: false,
        verifier_notes: 'failed branch attribution twice',
        verifier_pass_count: 2,
        organization_id: ZEDCOR_ORG_ID,
      },
      {
        id: PASS_ONCE_ID,
        source: 'sam.gov',
        source_id: PASS_ONCE_ID,
        title: 'escalation test · single fail · should NOT escalate',
        verified: false,
        verifier_notes: 'one pass count',
        verifier_pass_count: 1,
        organization_id: ZEDCOR_ORG_ID,
      },
      {
        id: PRISTINE_ID,
        source: 'news',
        source_id: PRISTINE_ID,
        title: 'escalation test · pristine',
        verifier_pass_count: 0,
        organization_id: ZEDCOR_ORG_ID,
      },
    ];
    const { error } = await admin.from('projects').insert(seed);
    expect(error).toBeNull();
  });

  afterAll(async () => {
    if (!admin) return;
    await admin
      .from('projects')
      .delete()
      .in('id', [ESCALATED_ID, PASS_ONCE_ID, PRISTINE_ID]);
  });

  it('returns only projects with verifier_pass_count >= 2', async () => {
    const { GET } = await import('@/app/api/agents/escalations/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Project[];
    expect(Array.isArray(body)).toBe(true);

    // Our escalated row should be in there.
    const ids = new Set(body.map((p) => p.id));
    expect(ids.has(ESCALATED_ID)).toBe(true);

    // Our non-escalated rows should NOT be in there.
    expect(ids.has(PASS_ONCE_ID)).toBe(false);
    expect(ids.has(PRISTINE_ID)).toBe(false);

    // Every returned row honors the threshold — the route is the only
    // contract here, so verify it independently for any other rows the
    // live DB happens to hold.
    for (const p of body) {
      expect(p.verifier_pass_count ?? 0).toBeGreaterThanOrEqual(2);
    }
  });
});
