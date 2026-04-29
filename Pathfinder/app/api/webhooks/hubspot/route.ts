// POST /api/webhooks/hubspot
//
// Receives HubSpot subscription webhooks. v3 signature is verified
// against HUBSPOT_APP_SECRET (the HubSpot Private App secret) before any
// state mutation. Each event in the batch is dispatched to
// lib/lead-actions.ts:applyHubspotStageEvent — that function handles
// idempotency (X-HubSpot eventId), unknown stages, and unknown deals.
//
// Returns 200 even on partial failure inside a batch (HubSpot retries
// non-2xx and we don't want a single bad event to block the batch); each
// event's outcome is captured in the response body and audit-logged
// individually inside lib/lead-actions.

import { NextResponse } from 'next/server';

import { applyHubspotStageEvent } from '@/lib/lead-actions';
import { verifyV3Signature } from '@/lib/hubspot/webhook-signature';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

interface HubspotChangeEvent {
  eventId?: number | string;
  subscriptionType?: string;
  objectId?: number | string;
  propertyName?: string;
  propertyValue?: string;
  occurredAt?: number;
  changeSource?: string;
}

let _admin: ReturnType<typeof supabaseAdmin> | null = null;
function admin() {
  if (!_admin) _admin = supabaseAdmin();
  return _admin;
}

async function audit(eventType: string, data: Record<string, unknown>): Promise<void> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
  };
  try {
    await sb.from('agent_log').insert({
      agent_name: 'hubspot-sync',
      event_type: eventType,
      event_data: data,
    });
  } catch {
    // best-effort
  }
}

export async function POST(req: Request) {
  const secret = process.env.HUBSPOT_APP_SECRET;
  if (!secret) {
    // No secret configured = misconfiguration. Refuse to accept anything
    // until the env is set. Better than silently accepting unsigned posts.
    return NextResponse.json({ error: 'app_secret_not_configured' }, { status: 503 });
  }

  // v3 signature is computed over the raw body string. We must read it
  // before parsing JSON so the bytes match exactly what HubSpot signed.
  const rawBody = await req.text();
  const signature = req.headers.get('x-hubspot-signature-v3') ?? '';
  const timestamp = req.headers.get('x-hubspot-request-timestamp') ?? '';

  // Reconstruct the canonical URI HubSpot signed. Behind proxies the
  // request URL may differ from what HubSpot saw; allow an env override
  // for that case.
  const uri = process.env.HUBSPOT_WEBHOOK_PUBLIC_URL ?? req.url;

  const verify = verifyV3Signature({
    method: 'POST',
    uri,
    body: rawBody,
    timestamp,
    signature,
    secret,
  });

  if (!verify.ok) {
    await audit('signature_failed', {
      message: 'webhook signature verification failed',
      reason: verify.reason,
      timestamp,
      // Body is intentionally NOT logged on signature failure — could be
      // a spoofed payload or contain customer data we don't want to keep.
    });
    return NextResponse.json({ error: 'signature_failed', reason: verify.reason }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!Array.isArray(parsed)) {
    return NextResponse.json({ error: 'expected_array' }, { status: 400 });
  }

  const events = parsed as HubspotChangeEvent[];
  await audit('webhook_received', {
    message: 'webhook batch verified',
    event_count: events.length,
  });

  type Outcome =
    | { kind: 'updated' | 'replayed' | 'unknown_stage' | 'unknown_deal' | 'skipped' | 'error'; detail?: unknown };

  const outcomes: Outcome[] = [];

  for (const ev of events) {
    // Only `dealstage`-property changes are relevant for the sync. Other
    // events are received but recorded as 'skipped' so the audit log
    // reflects total batch size.
    if (ev.subscriptionType !== 'deal.propertyChange' || ev.propertyName !== 'dealstage') {
      outcomes.push({ kind: 'skipped', detail: { reason: 'not_dealstage_event', subscriptionType: ev.subscriptionType, propertyName: ev.propertyName } });
      continue;
    }

    const dealId = ev.objectId === undefined ? null : String(ev.objectId);
    const newStageId = ev.propertyValue ?? null;
    const eventId = ev.eventId === undefined ? null : String(ev.eventId);
    const occurredAt = typeof ev.occurredAt === 'number' ? ev.occurredAt : Date.now();

    if (!dealId || !newStageId || !eventId) {
      outcomes.push({ kind: 'error', detail: { reason: 'missing_required_fields', dealId, newStageId, eventId } });
      continue;
    }

    try {
      const result = await applyHubspotStageEvent({
        dealId,
        newStageId,
        eventId,
        occurredAt,
      });
      outcomes.push({ kind: result.kind, detail: result });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      outcomes.push({ kind: 'error', detail: { reason } });
    }
  }

  return NextResponse.json({ ok: true, processed: events.length, outcomes });
}
