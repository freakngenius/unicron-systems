// POST /api/connectors/[type]/webhook
//
// Inbound event normalizer. C-1A scope: validate the provider's request
// signature (slack/teams: HMAC; hubspot: JWT — placeholder until Phase 3),
// normalize to InboundEvent, record audit, return 200. Routing to the
// chat agent / sync engine ships in C-1B (slack-side) and Phase 3
// (hubspot-side).
//
// SECURITY: signature verification is mandatory for slack and teams.
// Reject with 401 on missing or mismatched signature so a public URL
// can't be flooded with fake events.

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/connectors/audit';
import { isConnectorType } from '@/lib/connectors/providers';
import {
  groupHubspotEvents,
  parseHubspotWebhook,
  summariseEvent,
} from '@/lib/connectors/hubspot/inbound';
import type { ConnectorType, InboundEvent } from '@/lib/connectors/types';
import { verifyV3Signature } from '@/lib/hubspot/webhook-signature';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 15;

export async function POST(req: Request, { params }: { params: { type: string } }) {
  const typeParam = params.type.toLowerCase();
  if (!isConnectorType(typeParam)) {
    return NextResponse.json(
      { error: 'unknown_connector_type', allowed: ['slack', 'teams', 'hubspot'] },
      { status: 400 },
    );
  }
  const type: ConnectorType = typeParam;

  const rawBody = await req.text();

  // Signature gate.
  if (!(await verifySignature(type, req, rawBody))) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  // Slack URL verification challenge — must echo `challenge` back as
  // plaintext. Only Slack does this; teams/hubspot have different ack
  // semantics handled by their respective phases.
  if (type === 'slack') {
    try {
      const parsed = JSON.parse(rawBody) as { type?: string; challenge?: string };
      if (parsed.type === 'url_verification' && parsed.challenge) {
        return new NextResponse(parsed.challenge, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    } catch {
      // not JSON; let it fall through to the normalizer
    }
  }

  // HubSpot dispatch: parse the event array, group by family, audit each
  // event individually. Schema mutations (deals upsert, contacts upsert)
  // land in Gate 4B-2/3; this gate ships the inbound bridge so the
  // dashboard can surface webhook activity in connector_audit_log and
  // the operator can verify HMAC end-to-end with HubSpot.
  if (type === 'hubspot') {
    const events = parseHubspotWebhook(rawBody);
    if (events == null) {
      return NextResponse.json({ ok: true, ignored: 'malformed_payload' });
    }
    const grouped = groupHubspotEvents(events);
    const first = events[0];
    if (!first) {
      return NextResponse.json({ ok: true, ignored: 'empty_events' });
    }
    const connectorId = await resolveHubspotConnectorByPortal(String(first.portalId));
    if (!connectorId) {
      return NextResponse.json({ ok: true, ignored: 'unknown_portal' });
    }
    const orgId = await lookupOrgForConnector(connectorId);

    for (const ev of events) {
      await recordAudit({
        connector_id: connectorId,
        customer_org_id: orgId ?? 'unknown',
        event_type: `inbound.${ev.subscriptionType}`,
        direction: 'inbound',
        status: 'received',
        payload_summary: {
          summary: summariseEvent(ev),
          object_id: ev.objectId,
          property_name: ev.propertyName ?? null,
          attempt: ev.attemptNumber,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      received: events.length,
      groups: {
        deal: grouped.deal.length,
        contact: grouped.contact.length,
        engagement: grouped.engagement.length,
        unknown: grouped.unknown.length,
      },
    });
  }

  // Resolve the connector row from the inbound payload. For slack we
  // pull the team_id; for teams the tenantId.
  // If we can't resolve, we still 200 (so the provider doesn't retry-
  // storm us) but record a failed audit so operators see it.
  const inbound = parseInbound(type, rawBody);
  const connectorId = await resolveConnectorId(type, inbound);

  if (!connectorId) {
    // We can't audit without a connector_id (FK). Return 200 anyway so
    // we don't trigger retry loops on misconfigured tenants.
    return NextResponse.json({ ok: true, ignored: 'no_connector_for_payload' });
  }

  // Look up org for the audit row.
  const orgId = await lookupOrgForConnector(connectorId);
  await recordAudit({
    connector_id: connectorId,
    customer_org_id: orgId ?? 'unknown',
    event_type: `inbound.${inbound.type}`,
    direction: 'inbound',
    status: 'received',
    payload_summary: { user_external_id: inbound.user_external_id, channel_id: inbound.channel_id },
  });

  // C-1B + Phase 3 will dispatch to chat agent / sync engine here.
  return NextResponse.json({ ok: true });
}

async function resolveHubspotConnectorByPortal(portalId: string): Promise<string | null> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          v: string,
        ) => {
          eq: (
            col: string,
            v: string,
          ) => {
            maybeSingle: () => Promise<{
              data: { id: string } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
  const res = await sb
    .from('connectors')
    .select('id')
    .eq('connector_type', 'hubspot')
    .eq('account_external_id', portalId)
    .maybeSingle();
  if (res.error || !res.data) return null;
  return res.data.id;
}

async function verifySignature(type: ConnectorType, req: Request, raw: string): Promise<boolean> {
  if (type === 'slack') {
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      // No secret = reject. Phase-1 ops must set this before going live.
      return false;
    }
    const ts = req.headers.get('x-slack-request-timestamp');
    const sig = req.headers.get('x-slack-signature');
    if (!ts || !sig) return false;
    // Reject events older than 5 minutes (Slack's recommendation).
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) {
      return false;
    }
    const base = `v0:${ts}:${raw}`;
    const expected = `v0=${crypto.createHmac('sha256', signingSecret).update(base).digest('hex')}`;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  if (type === 'teams') {
    // Microsoft Bot Framework uses a JWT bearer token. Real validation
    // ships in C-2; for now we accept ONLY when the test header is set
    // (used by webhook-fixture tests) so we don't accidentally accept
    // arbitrary requests in production.
    return process.env.NODE_ENV !== 'production' && req.headers.get('x-pf-test') === '1';
  }
  if (type === 'hubspot') {
    // HubSpot v3 webhook signature: base64( HMAC-SHA256( method + uri +
    // body + timestamp ) ) using HUBSPOT_APP_SECRET. Tests can opt in via
    // x-pf-test=1 in non-production to bypass signing without leaking the
    // bypass to prod.
    if (process.env.NODE_ENV !== 'production' && req.headers.get('x-pf-test') === '1') {
      return true;
    }
    const secret = process.env.HUBSPOT_APP_SECRET;
    if (!secret) return false;
    const signature = req.headers.get('x-hubspot-signature-v3');
    const timestamp = req.headers.get('x-hubspot-request-timestamp');
    if (!signature || !timestamp) return false;
    const result = verifyV3Signature({
      method: req.method.toUpperCase(),
      uri: req.url,
      body: raw,
      timestamp,
      secret,
      signature,
    });
    return result.ok;
  }
  return false;
}

function parseInbound(type: ConnectorType, raw: string): InboundEvent {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {
      connector_id: '',
      type: 'unknown',
      user_external_id: null,
      channel_id: null,
      payload: {},
      raw,
    };
  }
  if (type === 'slack') {
    const event = (parsed.event ?? {}) as Record<string, unknown>;
    return {
      connector_id: '',
      type: classifySlackEventType(event),
      user_external_id: typeof event.user === 'string' ? event.user : null,
      channel_id: typeof event.channel === 'string' ? event.channel : null,
      payload: parsed,
      raw,
    };
  }
  return {
    connector_id: '',
    type: 'unknown',
    user_external_id: null,
    channel_id: null,
    payload: parsed,
    raw,
  };
}

function classifySlackEventType(event: Record<string, unknown>): InboundEvent['type'] {
  if (event.type === 'message' || event.type === 'app_mention') return 'message';
  if (event.type === 'reaction_added' || event.type === 'reaction_removed') return 'reaction';
  return 'unknown';
}

interface ConnectorIdRow {
  id: string;
}

async function resolveConnectorId(
  type: ConnectorType,
  inbound: InboundEvent,
): Promise<string | null> {
  // Slack: payload.team_id is the workspace ID; we stored it in
  // connectors.account_external_id during the OAuth callback.
  let accountExternalId: string | null = null;
  if (type === 'slack') {
    const payload = inbound.payload as { team_id?: string; team?: { id?: string } };
    accountExternalId = payload.team_id ?? payload.team?.id ?? null;
  }
  if (!accountExternalId) return null;

  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          v: string,
        ) => {
          eq: (
            col: string,
            v: string,
          ) => {
            maybeSingle: () => Promise<{
              data: ConnectorIdRow | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
  const res = await sb
    .from('connectors')
    .select('id')
    .eq('connector_type', type)
    .eq('account_external_id', accountExternalId)
    .maybeSingle();
  if (res.error || !res.data) return null;
  return res.data.id;
}

async function lookupOrgForConnector(connectorId: string): Promise<string | null> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          v: string,
        ) => {
          maybeSingle: () => Promise<{
            data: { customer_org_id: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const res = await sb.from('connectors').select('customer_org_id').eq('id', connectorId).maybeSingle();
  if (res.error || !res.data) return null;
  return res.data.customer_org_id;
}
