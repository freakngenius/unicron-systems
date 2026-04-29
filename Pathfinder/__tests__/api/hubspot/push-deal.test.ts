// __tests__/api/hubspot/push-deal.test.ts — integration test for the
// POST /api/hubspot/push-deal route. Runs against the live Supabase
// project (anfihcusvekpovcchpoh) — same pattern as
// __tests__/api/cron/verifier.test.ts.
//
// REQUIRES: migration 0011_hubspot_sync.sql applied to the target
// Supabase project. Without it, the lead_actions table is absent and
// the test will fail with a clear schema error.
//
// HubSpot is stubbed at lib/lead-actions:setHubspotClientForTesting so
// the suite never makes a network call to api.hubapi.com.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: '.env.local' });
dotenvConfig();

process.env.CRON_SECRET = process.env.CRON_SECRET ?? 'test-secret-for-hubspot-push';
process.env.HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY ?? 'test-bearer-token';
process.env.HUBSPOT_DEAL_PIPELINE_ID = process.env.HUBSPOT_DEAL_PIPELINE_ID ?? 'pipeline_test';
process.env.HUBSPOT_STAGE_ACCEPTED_ID = process.env.HUBSPOT_STAGE_ACCEPTED_ID ?? 'stage_accepted_test';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const haveCreds = Boolean(url && serviceKey);

const RUN_TAG = `_hubspot_push_test_${Date.now()}`;
const PROJECT_ID = `${RUN_TAG}_proj`;
const ACTOR_EMAIL = `${RUN_TAG}@example.test`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let admin: SupabaseClient<any, 'pathfinder', any>;

describe.runIf(haveCreds)('POST /api/hubspot/push-deal', () => {
  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    admin = createClient<any, 'pathfinder', any>(url!, serviceKey!, {
      db: { schema: 'pathfinder' },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Insert a synthetic project the route's lib will read.
    await admin.from('projects').insert({
      id: PROJECT_ID,
      source: 'usaspending',
      source_id: PROJECT_ID,
      title: `Synthetic project ${RUN_TAG}`,
      summary: 'integration test row',
      lat: 29.76,
      lon: -95.37,
      project_value: 1_500_000,
      project_stage: 'awarded',
      posted_date: '2026-04-15',
      raw_payload: {},
      rationale: 'Test rationale for HubSpot push integration test.',
      score: 80,
      nearest_branch_id: null,
      distance_miles: null,
      outreach_hook: 'Test outreach hook.',
      warm_for_customer_id: null,
    });
  });

  afterAll(async () => {
    if (!admin) return;
    // Clean up rows tagged with the run id.
    await admin.from('lead_actions').delete().eq('actor_email', ACTOR_EMAIL);
    await admin.from('projects').delete().eq('id', PROJECT_ID);
    await admin.from('agent_log').delete().like('event_data->>project_id', `${RUN_TAG}%`);
  });

  beforeEach(async () => {
    // Each test starts from a clean slate (no prior accept for this rep).
    await admin.from('lead_actions').delete().eq('actor_email', ACTOR_EMAIL);
  });

  afterEach(async () => {
    // Reset HubSpot stub between tests.
    const { setHubspotClientForTesting } = await import('@/lib/lead-actions');
    setHubspotClientForTesting(null);
  });

  it('returns 401 without the bearer token', async () => {
    const { POST } = await import('@/app/api/hubspot/push-deal/route');
    const req = new Request('http://localhost/api/hubspot/push-deal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project_id: PROJECT_ID, actor_email: ACTOR_EMAIL }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('records an accept and stamps hubspot_deal_id when push succeeds', async () => {
    const { POST } = await import('@/app/api/hubspot/push-deal/route');
    const { setHubspotClientForTesting } = await import('@/lib/lead-actions');
    setHubspotClientForTesting({
      createDeal: async () => ({ id: 'deal_test_001' }),
      attachNote: async () => ({ id: 'note_test_001' }),
      ensureCustomProperty: async () => ({ created: false }),
    });

    const req = new Request('http://localhost/api/hubspot/push-deal', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
      body: JSON.stringify({
        project_id: PROJECT_ID,
        actor_email: ACTOR_EMAIL,
        attested_pipeline_value: 250_000,
        first_action_date: '2026-05-01',
        note: 'integration test note',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; lead_action_id: number; hubspot_deal_id: string; pushed: boolean };
    expect(body.ok).toBe(true);
    expect(body.pushed).toBe(true);
    expect(body.hubspot_deal_id).toBe('deal_test_001');

    const row = await admin
      .from('lead_actions')
      .select('*')
      .eq('id', body.lead_action_id)
      .maybeSingle();
    expect(row.data).toBeTruthy();
    const r = row.data as unknown as Record<string, unknown>;
    expect(r.status).toBe('accepted');
    expect(r.hubspot_deal_id).toBe('deal_test_001');
    expect(r.attested_pipeline_value).not.toBeNull();
    expect(r.note).toBe('integration test note');
  });

  it('records the accept even if HubSpot push fails', async () => {
    const { POST } = await import('@/app/api/hubspot/push-deal/route');
    const { setHubspotClientForTesting } = await import('@/lib/lead-actions');
    const { HubspotError } = await import('@/lib/hubspot/client');

    setHubspotClientForTesting({
      createDeal: async () => {
        throw new HubspotError('simulated hubspot 500', 500, '{"err":"boom"}');
      },
      attachNote: async () => ({ id: 'note_test' }),
      ensureCustomProperty: async () => ({ created: false }),
    });

    const req = new Request('http://localhost/api/hubspot/push-deal', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
      body: JSON.stringify({ project_id: PROJECT_ID, actor_email: ACTOR_EMAIL }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; pushed: boolean; lead_action_id: number; hubspot_deal_id: string | null; push_error: string | null };
    expect(body.ok).toBe(true);
    expect(body.pushed).toBe(false);
    expect(body.hubspot_deal_id).toBeNull();
    expect(body.push_error).toContain('hubspot 500');

    // Lead action row exists with status 'accepted' but no hubspot_deal_id.
    const row = await admin.from('lead_actions').select('*').eq('id', body.lead_action_id).maybeSingle();
    const r = row.data as unknown as Record<string, unknown>;
    expect(r.status).toBe('accepted');
    expect(r.hubspot_deal_id).toBeNull();
  });
});
