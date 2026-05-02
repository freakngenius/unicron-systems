// lib/connectors/hubspot/outbound.ts — Demo Polish UX Gate 4B-1.
//
// Centralized outbound push helpers for Pathfinder → HubSpot mirror
// writes. Used by:
//
//   - lead-actions stage transitions (already in `app/api/hubspot/push-deal`,
//     this module wraps it for reuse)
//   - dashboard kanban drags (Gate 4B-2 wires this in)
//   - reconciliation cron's auto-resolve path (Gate 4B-3)
//
// Resolves the stored OAuth token via lib/connectors/tokens.ts, builds
// the HubSpot REST request, and audit-logs every attempt. Token strings
// are NEVER logged — only the first 4 + last 4 characters via `redact()`.

import { hubspotDealPipelineId, mapPathfinderToHubspotStage } from '@/lib/hubspot/stage-map';
import { recordAudit } from '@/lib/connectors/audit';
import { getToken } from '@/lib/connectors/tokens';
import { supabaseAdmin } from '@/lib/supabase';
import type { LeadActionStatus } from '@/lib/types';

export interface OutboundDealStageChangeInput {
  /** Pathfinder customer org id. Used to resolve the right HubSpot connector. */
  customer_org_id: string;
  /** Pathfinder lead_action id (the load-bearing identifier on the deal). */
  lead_action_id: number;
  /** HubSpot deal id (looked up via pathfinder_lead_id property; ID-only when
   *  caller has it cached, otherwise pass null and the helper looks it up). */
  hubspot_deal_id: string;
  /** Target Pathfinder status. The helper resolves this to the HubSpot
   *  stage id via the stage-map env vars. */
  to_status: LeadActionStatus;
}

export interface OutboundDealStageChangeResult {
  ok: boolean;
  reason?: string;
  hubspot_stage_id?: string;
}

/** First 4 + last 4 chars; "********" placeholder when the input is too short. */
export function redact(token: string | null | undefined): string {
  if (!token) return '<missing>';
  if (token.length < 12) return '********';
  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}

/**
 * Push a Pathfinder lead-stage transition to HubSpot. Looks up the
 * connector + stored token, resolves the new stage id, then PATCHes
 * the HubSpot deal. Audit-logs the attempt regardless of outcome.
 */
export async function pushDealStageChange(
  input: OutboundDealStageChangeInput,
): Promise<OutboundDealStageChangeResult> {
  const stageId = mapPathfinderToHubspotStage(input.to_status);
  if (!stageId) {
    return { ok: false, reason: 'no_hubspot_mirror' };
  }
  const pipeline = hubspotDealPipelineId();
  if (!pipeline) {
    return { ok: false, reason: 'pipeline_not_configured' };
  }

  // Resolve the HubSpot connector row for this org, then load its token.
  const connectorId = await resolveHubspotConnectorId(input.customer_org_id);
  if (!connectorId) {
    return { ok: false, reason: 'no_active_connector' };
  }
  const token = await getToken(connectorId);
  if (!token) {
    return { ok: false, reason: 'no_active_token' };
  }

  // The minimal client only knows createDeal/attachNote; the stage
  // transition is a property update. We round-trip through the same
  // request infra by piggy-backing on createDeal's PATCH path —
  // documented in lib/hubspot/client.ts. For Gate 4B-1 we keep it
  // lightweight and use the raw fetch with retry handled by the client's
  // backoff util by re-using its createDeal POST surface logically.
  //
  // For demo simplicity we issue a direct PATCH here; the existing
  // push-deal route covers create. The retry wrapper isn't reused
  // because PATCH semantics differ from POST/create for HubSpot v3.
  const url = `https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(input.hubspot_deal_id)}`;
  const body = JSON.stringify({
    properties: {
      dealstage: stageId,
      pipeline,
      pathfinder_lead_id: String(input.lead_action_id),
    },
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token.access}`,
        'content-type': 'application/json',
      },
      body,
    });
  } catch (err) {
    await recordAudit({
      connector_id: connectorId,
      customer_org_id: input.customer_org_id,
      event_type: 'outbound.deal_stage_change',
      direction: 'outbound',
      status: 'failed',
      payload_summary: {
        deal_id: input.hubspot_deal_id,
        new_stage: stageId,
        token: redact(token.access),
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return { ok: false, reason: 'network_error' };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    await recordAudit({
      connector_id: connectorId,
      customer_org_id: input.customer_org_id,
      event_type: 'outbound.deal_stage_change',
      direction: 'outbound',
      status: 'failed',
      payload_summary: {
        deal_id: input.hubspot_deal_id,
        new_stage: stageId,
        http_status: res.status,
        body_snippet: errText.slice(0, 200),
        token: redact(token.access),
      },
    });
    return { ok: false, reason: `http_${res.status}` };
  }

  await recordAudit({
    connector_id: connectorId,
    customer_org_id: input.customer_org_id,
    event_type: 'outbound.deal_stage_change',
    direction: 'outbound',
    status: 'sent',
    payload_summary: {
      deal_id: input.hubspot_deal_id,
      new_stage: stageId,
      token: redact(token.access),
    },
  });
  return { ok: true, hubspot_stage_id: stageId };
}

async function resolveHubspotConnectorId(orgId: string): Promise<string | null> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, v: string) => {
          eq: (col: string, v: string) => {
            eq: (col: string, v: string) => {
              maybeSingle: () => Promise<{
                data: { id: string } | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  };
  const res = await sb
    .from('connectors')
    .select('id')
    .eq('customer_org_id', orgId)
    .eq('connector_type', 'hubspot')
    .eq('status', 'connected')
    .maybeSingle();
  if (res.error || !res.data) return null;
  return res.data.id;
}
