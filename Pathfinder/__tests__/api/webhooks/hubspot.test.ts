// __tests__/api/webhooks/hubspot.test.ts — integration test for
// POST /api/webhooks/hubspot. Signs a synthetic payload with a known
// HUBSPOT_APP_SECRET, asserts that valid signatures flip
// lead_actions.status and that replays + bad signatures are rejected.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as dotenvConfig } from 'dotenv';

import { signV3 } from '@/lib/hubspot/webhook-signature';

dotenvConfig({ path: '.env.local' });
dotenvConfig();

const TEST_APP_SECRET = 'test-webhook-app-secret';
const TEST_STAGE_MEETING = 'stage_meeting_test';
const TEST_STAGE_WON = 'stage_won_test';

process.env.HUBSPOT_APP_SECRET = TEST_APP_SECRET;
process.env.HUBSPOT_STAGE_MEETING_ID = TEST_STAGE_MEETING;
process.env.HUBSPOT_STAGE_WON_ID = TEST_STAGE_WON;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const haveCreds = Boolean(url && serviceKey);

const RUN_TAG = `_hubspot_webhook_test_${Date.now()}`;
const PROJECT_ID = `${RUN_TAG}_proj`;
const ACTOR_EMAIL = `${RUN_TAG}@example.test`;
const HUBSPOT_DEAL_ID = `${RUN_TAG}_deal`;

const PUBLIC_URL = 'https://app.example.test/api/webhooks/hubspot';
process.env.HUBSPOT_WEBHOOK_PUBLIC_URL = PUBLIC_URL;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let admin: SupabaseClient<any, 'pathfinder', any>;

function buildSignedRequest(events: unknown[], opts: { tamperBody?: boolean } = {}) {
  const body = JSON.stringify(events);
  const ts = String(Date.now());
  const sig = signV3({
    method: 'POST',
    uri: PUBLIC_URL,
    body,
    timestamp: ts,
    secret: TEST_APP_SECRET,
  });
  const sentBody = opts.tamperBody ? body.replace(/(\d+)/, (m) => String(Number(m) + 1)) : body;
  return new Request(PUBLIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hubspot-signature-v3': sig,
      'x-hubspot-request-timestamp': ts,
    },
    body: sentBody,
  });
}

describe.runIf(haveCreds)('POST /api/webhooks/hubspot', () => {
  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    admin = createClient<any, 'pathfinder', any>(url!, serviceKey!, {
      db: { schema: 'pathfinder' },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Synthetic project + lead_action with the known HubSpot deal id.
    // Zedcor's organization_id is required on every projects /
    // lead_actions insert since the Phase 2A completion migration made
    // organization_id NOT NULL on both tables.
    const ZEDCOR_ORG_ID = '6cd87740-7c72-4337-ac79-316a54242eef';
    await admin.from('projects').insert({
      id: PROJECT_ID,
      source: 'usaspending',
      source_id: PROJECT_ID,
      title: `Webhook test project ${RUN_TAG}`,
      summary: 'webhook integration test row',
      lat: 29.76,
      lon: -95.37,
      project_value: 100_000,
      project_stage: 'awarded',
      posted_date: '2026-04-15',
      raw_payload: {},
      rationale: 'webhook test rationale',
      score: 70,
      organization_id: ZEDCOR_ORG_ID,
    });

    await admin.from('lead_actions').insert({
      project_id: PROJECT_ID,
      actor_email: ACTOR_EMAIL,
      status: 'accepted',
      hubspot_deal_id: HUBSPOT_DEAL_ID,
      attested_pipeline_value: 50_000,
    });
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from('lead_actions').delete().eq('actor_email', ACTOR_EMAIL);
    await admin.from('projects').delete().eq('id', PROJECT_ID);
    await admin.from('agent_log').delete().like('event_data->>hubspot_deal_id', `${RUN_TAG}%`);
  });

  it('flips lead_actions.status when a valid stage event arrives', async () => {
    const { POST } = await import('@/app/api/webhooks/hubspot/route');
    const events = [
      {
        eventId: `${RUN_TAG}_evt_1`,
        subscriptionType: 'deal.propertyChange',
        objectId: HUBSPOT_DEAL_ID,
        propertyName: 'dealstage',
        propertyValue: TEST_STAGE_MEETING,
        occurredAt: Date.now(),
      },
    ];
    const req = buildSignedRequest(events);
    const res = await POST(req);
    expect(res.status).toBe(200);

    const row = await admin.from('lead_actions').select('*').eq('hubspot_deal_id', HUBSPOT_DEAL_ID).maybeSingle();
    const r = row.data as unknown as Record<string, unknown>;
    expect(r.status).toBe('meeting_booked');
    expect(r.hubspot_last_event_id).toBe(`${RUN_TAG}_evt_1`);
  });

  it('treats a replayed event as a no-op', async () => {
    const { POST } = await import('@/app/api/webhooks/hubspot/route');
    const events = [
      {
        eventId: `${RUN_TAG}_evt_1`, // same id as the first test
        subscriptionType: 'deal.propertyChange',
        objectId: HUBSPOT_DEAL_ID,
        propertyName: 'dealstage',
        propertyValue: TEST_STAGE_WON,
        occurredAt: Date.now(),
      },
    ];
    const req = buildSignedRequest(events);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { outcomes: Array<{ kind: string }> };
    expect(body.outcomes[0].kind).toBe('replayed');

    // Status should NOT have advanced to closed_won.
    const row = await admin.from('lead_actions').select('*').eq('hubspot_deal_id', HUBSPOT_DEAL_ID).maybeSingle();
    const r = row.data as unknown as Record<string, unknown>;
    expect(r.status).toBe('meeting_booked');
  });

  it('stamps closed_won_amount on a closed_won transition', async () => {
    const { POST } = await import('@/app/api/webhooks/hubspot/route');
    const events = [
      {
        eventId: `${RUN_TAG}_evt_won`,
        subscriptionType: 'deal.propertyChange',
        objectId: HUBSPOT_DEAL_ID,
        propertyName: 'dealstage',
        propertyValue: TEST_STAGE_WON,
        occurredAt: Date.now(),
      },
    ];
    const req = buildSignedRequest(events);
    const res = await POST(req);
    expect(res.status).toBe(200);

    const row = await admin.from('lead_actions').select('*').eq('hubspot_deal_id', HUBSPOT_DEAL_ID).maybeSingle();
    const r = row.data as unknown as Record<string, unknown>;
    expect(r.status).toBe('closed_won');
    // No HubSpot-side amount in the test event, so closed_won_amount falls back to attested.
    expect(Number(r.closed_won_amount)).toBe(50_000);
    expect(r.closed_won_at).not.toBeNull();
  });

  it('rejects a payload with a tampered body', async () => {
    const { POST } = await import('@/app/api/webhooks/hubspot/route');
    const events = [
      {
        eventId: `${RUN_TAG}_evt_bad`,
        subscriptionType: 'deal.propertyChange',
        objectId: HUBSPOT_DEAL_ID,
        propertyName: 'dealstage',
        propertyValue: TEST_STAGE_MEETING,
        occurredAt: Date.now(),
      },
    ];
    const req = buildSignedRequest(events, { tamperBody: true });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
