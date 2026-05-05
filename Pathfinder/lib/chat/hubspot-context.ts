// lib/chat/hubspot-context.ts — Gate 22.
//
// Pure helpers that turn a user-scoped HubSpot snapshot into the block of
// text the chat agent reads alongside its existing PATHFINDER CONTEXT.
//
// Multi-tenant safety: callers MUST pass a snapshot already filtered by
// userId. The shape carries no field that could leak another tenant; the
// connection record never includes `oauth_token_enc` /
// `oauth_refresh_token_enc` columns by design (the loader specifies an
// explicit column list).

export interface HubSpotConnectionSnapshot {
  provider: 'hubspot';
  /** active | expired | revoked. Other values pass through verbatim. */
  status: string;
  portal_id: string | null;
  portal_name: string | null;
  connected_at: string | null;
  expires_at: string | null;
}

export interface HubSpotDealRowSnapshot {
  project_id: string;
  hubspot_deal_id: string;
  hubspot_deal_url: string | null;
  pushed_at: string;
  last_synced_at: string | null;
  current_stage: string | null;
  current_stage_label: string | null;
  current_amount: number | null;
  current_owner_name: string | null;
  last_activity_at: string | null;
  status: string;
}

export interface HubSpotChatContext {
  connection: HubSpotConnectionSnapshot | null;
  totalDeals: number;
  byStage: Record<string, number>;
  recent: HubSpotDealRowSnapshot[];
  /** Deals with no last_activity_at OR last_activity_at older than the
   *  stalled-window threshold (default 14 days). Bucketed at load time
   *  so the chat doesn't have to do date math. */
  stalledCount: number;
  /** ISO threshold the loader used to compute stalledCount. */
  stalledOlderThan: string | null;
}

const NO_CONNECTION_LINE =
  'HUBSPOT: not connected. When the user asks about HubSpot, respond plainly: "You haven\'t connected HubSpot yet. Connect at /pathfinder/settings/connectors." Do not invent deal counts.';

/** Compose the text block injected into the Sonar system prompt. Returns a
 *  multi-line string. Never throws. */
export function summarizeHubSpotForChat(ctx: HubSpotChatContext): string {
  if (!ctx.connection) return NO_CONNECTION_LINE;

  const lines: string[] = [];
  const portalLabel = ctx.connection.portal_name
    ? `${ctx.connection.portal_name} (portal ${ctx.connection.portal_id ?? 'unknown'})`
    : ctx.connection.portal_id
      ? `portal ${ctx.connection.portal_id}`
      : 'unknown portal';
  lines.push(
    `HUBSPOT CONNECTION: status=${ctx.connection.status}, ${portalLabel}, connected_at=${ctx.connection.connected_at ?? 'unknown'}.`,
  );
  if (ctx.connection.status !== 'active') {
    lines.push(
      `HUBSPOT WARNING: connection is ${ctx.connection.status}. Ask the user to reconnect at /pathfinder/settings/connectors before relying on counts.`,
    );
  }
  lines.push(`HUBSPOT TOTAL DEALS PUSHED: ${ctx.totalDeals}.`);
  if (ctx.totalDeals === 0) {
    lines.push('HUBSPOT BY STAGE: (none yet — no leads pushed to this portal).');
  } else {
    const byStageEntries = Object.entries(ctx.byStage)
      .map(([k, v]) => `${k || 'unknown'}=${v}`)
      .join(', ');
    lines.push(`HUBSPOT BY STAGE: ${byStageEntries || '(unknown)'}`);
  }
  if (ctx.stalledCount > 0 && ctx.stalledOlderThan) {
    lines.push(
      `HUBSPOT STALLED DEALS (no activity since ${ctx.stalledOlderThan}): ${ctx.stalledCount}.`,
    );
  }
  if (ctx.recent.length > 0) {
    const compact = ctx.recent.map((d) => ({
      project_id: d.project_id,
      stage: d.current_stage_label ?? d.current_stage,
      amount: d.current_amount,
      owner: d.current_owner_name,
      pushed_at: d.pushed_at,
      last_activity_at: d.last_activity_at,
      status: d.status,
      url: d.hubspot_deal_url,
    }));
    lines.push(`HUBSPOT RECENT DEALS: ${JSON.stringify(compact)}`);
  }
  lines.push(
    'HUBSPOT GUIDANCE: when the user asks about HubSpot leads, sync state, or deal stages, answer using the snapshot above. Use the deal URLs as links. Cite the table name "lead_hubspot_deals" in the TABLES footer.',
  );
  return lines.join('\n');
}
