// POST /api/connectors/teams/webhook
//
// Microsoft Bot Framework messaging endpoint. PUBLIC; JWT-verified.
// middleware.ts must exempt this path (existing connector exemption
// covers the entire /api/connectors/* tree).
//
// Bot Framework sends Activity payloads as JSON with an
// `Authorization: Bearer <jwt>` header signed by Microsoft. We verify
// the JWT in lib/connectors/teams/signature.ts before any handler runs.
//
// Activity types handled in C-2A:
//   message              → @-mention or DM. Parse command, post reply.
//   conversationUpdate   → membersAdded with the bot in the list ⇒ stash
//                          conversation reference for outbound proactive
//                          messaging (SPEC § 4.2 install gotcha).
//   invoke               → Adaptive Card Action.Submit feedback button
//                          → write to lead_feedback (source='teams_card')
//
// We always 200 quickly; heavy lifting is sync because each handler's
// DB query is small. If a handler grows expensive we'll switch to the
// "ack 200, post async" pattern.

import { NextResponse } from 'next/server';

import { recordAudit } from '@/lib/connectors/audit';
import { recordTeamsCardFeedback } from '@/lib/connectors/feedback';
import { getConnectorByExternalId } from '@/lib/connectors/registry';
import {
  formatHelp,
  formatLead,
  formatPlainText,
  formatRejection,
  TEAMS_ACTION_IDS,
  type AdaptiveCard,
} from '@/lib/connectors/teams/adaptive-cards';
import { clipReply, routeChatMessage } from '@/lib/connectors/teams/chat-bridge';
import { parseCommand } from '@/lib/connectors/teams/commands';
import {
  upsertConversationRef,
  type TeamsConversationRef,
} from '@/lib/connectors/teams/conversations';
import { postActivityWithOverride } from '@/lib/connectors/teams/sender';
import { verifyTeamsRequest } from '@/lib/connectors/teams/signature';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

interface TeamsActivity {
  type: string;
  id?: string;
  serviceUrl?: string;
  channelId?: string; // 'msteams'
  text?: string;
  from?: { id?: string; name?: string; aadObjectId?: string };
  recipient?: { id?: string; name?: string };
  conversation?: {
    id?: string;
    conversationType?: 'personal' | 'channel' | 'groupChat';
    tenantId?: string;
  };
  channelData?: {
    tenant?: { id?: string };
    teamsChannelId?: string;
    channel?: { id?: string };
  };
  membersAdded?: Array<{ id?: string }>;
  value?: Record<string, unknown>;
  replyToId?: string;
  entities?: Array<{ type?: string; mentioned?: { id?: string; name?: string } }>;
}

export async function POST(req: Request) {
  // 1. JWT signature verification.
  const authHeader = req.headers.get('authorization');
  const verify = await verifyTeamsRequest(authHeader);
  if (!verify.ok) {
    return new NextResponse(`Bad signature: ${verify.reason}`, { status: 401 });
  }

  // 2. Parse Activity payload.
  let activity: TeamsActivity;
  try {
    activity = (await req.json()) as TeamsActivity;
  } catch {
    return new NextResponse('Bad JSON', { status: 400 });
  }

  // 3. Resolve the connector row from tenantId.
  const tenantId =
    activity.conversation?.tenantId ?? activity.channelData?.tenant?.id ?? null;
  if (!tenantId) {
    return NextResponse.json({ ok: true, ignored: 'no_tenant_id' });
  }

  const connector = await getConnectorByExternalId('teams', tenantId);
  if (!connector) {
    // Tenant hasn't completed OAuth → ack 200 so Bot Framework doesn't
    // retry, but log it so an operator can see the gap.
    return NextResponse.json({ ok: true, ignored: 'no_connector_for_tenant' });
  }

  const orgId = connector.customerOrgId;
  const botName = (connector.metadata as { teams?: { bot_name?: string } }).teams?.bot_name ?? null;

  try {
    if (activity.type === 'conversationUpdate') {
      await handleConversationUpdate(connector.id, orgId, activity);
    } else if (activity.type === 'message') {
      // Distinguish @-mention (channel) vs DM (personal) based on conversationType.
      const convType = activity.conversation?.conversationType;
      if (convType === 'personal') {
        await handleDM(connector.id, orgId, botName, activity);
      } else {
        await handleMention(connector.id, orgId, botName, activity);
      }
    } else if (activity.type === 'invoke' || activity.type === 'messageBack') {
      await handleAdaptiveAction(connector.id, orgId, activity);
    } else {
      await recordAudit({
        connector_id: connector.id,
        customer_org_id: orgId,
        event_type: `event.${activity.type}.ignored`,
        direction: 'inbound',
        status: 'received',
        payload_summary: { type: activity.type },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordAudit({
      connector_id: connector.id,
      customer_org_id: orgId,
      event_type: `event.${activity.type}.error`,
      direction: 'inbound',
      status: 'failed',
      payload_summary: { activity_type: activity.type },
      error_message: message,
    });
    // Always 200; Bot Framework retries non-2xx aggressively.
  }

  return NextResponse.json({ ok: true });
}

// ────────────────────────────────────────────────────────────────────────
// Handlers
// ────────────────────────────────────────────────────────────────────────

async function handleConversationUpdate(
  connectorId: string,
  orgId: string,
  activity: TeamsActivity,
): Promise<void> {
  const botRecipientId = activity.recipient?.id ?? null;
  const membersAdded = activity.membersAdded ?? [];
  const botAdded = botRecipientId !== null && membersAdded.some((m) => m.id === botRecipientId);
  if (!botAdded) {
    return; // user joined the chat, not the bot — ignore
  }

  const conversationId = activity.conversation?.id;
  const serviceUrl = activity.serviceUrl;
  const conversationType = activity.conversation?.conversationType ?? 'channel';
  const tenantId = activity.conversation?.tenantId ?? activity.channelData?.tenant?.id ?? '';
  if (!conversationId || !serviceUrl) return;

  const ref: TeamsConversationRef = {
    id: conversationId,
    serviceUrl,
    tenantId,
    conversationType,
    channelId: activity.channelData?.teamsChannelId ?? activity.channelData?.channel?.id,
    user_aad_id: activity.from?.aadObjectId,
    updated_at: new Date().toISOString(),
  };
  await upsertConversationRef(connectorId, ref);

  await recordAudit({
    connector_id: connectorId,
    customer_org_id: orgId,
    event_type: 'event.conversationUpdate.bot_added',
    direction: 'inbound',
    status: 'received',
    payload_summary: { conversation_id: conversationId, conversation_type: conversationType },
  });
}

async function handleMention(
  connectorId: string,
  orgId: string,
  botName: string | null,
  activity: TeamsActivity,
): Promise<void> {
  const conversationId = activity.conversation?.id;
  const serviceUrl = activity.serviceUrl;
  if (!conversationId || !serviceUrl) return;

  // Stash conversation ref opportunistically (not all bots see
  // conversationUpdate before the first @mention if they were sideloaded
  // in a way that suppresses the install event).
  await upsertConversationRef(connectorId, {
    id: conversationId,
    serviceUrl,
    tenantId: activity.conversation?.tenantId ?? '',
    conversationType: activity.conversation?.conversationType ?? 'channel',
    channelId: activity.channelData?.teamsChannelId ?? activity.channelData?.channel?.id,
    updated_at: new Date().toISOString(),
  });

  // Try parsing as a structured command first (leads / rejected / feedback / help).
  const parsed = parseCommand(activity.text ?? null, botName);

  if (parsed.kind === 'leads') {
    const leads = await loadTopLeads(orgId, parsed.limit);
    if (leads.length === 0) {
      await postReply(serviceUrl, conversationId, formatPlainText('No leads to show right now.'), activity.id);
    } else {
      // Post one card per lead so the user can interact with each.
      for (const lead of leads) {
        await postReply(
          serviceUrl,
          conversationId,
          formatLead({
            id: lead.id,
            title: lead.title,
            score: lead.score,
            rationale: lead.rationale,
            projectValue: lead.project_value,
            source: lead.source,
            branchName: null,
            dashboardUrl: dashboardUrlFor(lead.id),
          }),
          activity.id,
        );
      }
    }
    await audit(connectorId, orgId, 'command.leads', { limit: parsed.limit, returned: leads.length });
    return;
  }

  if (parsed.kind === 'rejected') {
    const rejected = await loadRejectedSample(orgId, 5);
    if (rejected.length === 0) {
      await postReply(serviceUrl, conversationId, formatPlainText('No rejected leads in the recent window.'), activity.id);
    } else {
      for (const r of rejected) {
        await postReply(serviceUrl, conversationId, formatRejection({ id: r.id, title: r.title, reason: r.reason }), activity.id);
      }
    }
    await audit(connectorId, orgId, 'command.rejected', { returned: rejected.length });
    return;
  }

  if (parsed.kind === 'help' || parsed.kind === 'unknown') {
    const card = parsed.kind === 'unknown'
      ? formatPlainText(`Unknown command: \`${parsed.raw}\``)
      : formatHelp();
    await postReply(serviceUrl, conversationId, card, activity.id);
    await postReply(serviceUrl, conversationId, formatHelp(), activity.id);
    await audit(connectorId, orgId, 'command.help', { kind: parsed.kind });
    return;
  }

  if (parsed.kind === 'feedback') {
    await recordTeamsCardFeedback({
      customerOrgId: orgId,
      connectorId,
      projectId: parsed.projectId,
      thumb: parsed.thumb,
      activityId: activity.id ?? null,
      userExternalId: activity.from?.aadObjectId ?? activity.from?.id ?? null,
      reason: parsed.reason,
    });
    const verbText = parsed.thumb === 'up' ? 'thumbs up' : 'thumbs down';
    await postReply(
      serviceUrl,
      conversationId,
      formatPlainText(`Recorded ${verbText} on \`${parsed.projectId}\`. Thanks!`),
      activity.id,
    );
    await audit(connectorId, orgId, 'command.feedback', {
      project_id: parsed.projectId,
      thumb: parsed.thumb,
      has_reason: Boolean(parsed.reason),
    });
    return;
  }

  // Fall through to the chat bridge for natural-language @mentions.
  const result = await routeChatMessage({ text: activity.text ?? '', botName });
  await postReply(serviceUrl, conversationId, formatPlainText(clipReply(result.reply)), activity.id);
  await audit(connectorId, orgId, 'event.app_mention', { routed: result.routed });
}

async function handleDM(
  connectorId: string,
  orgId: string,
  botName: string | null,
  activity: TeamsActivity,
): Promise<void> {
  const conversationId = activity.conversation?.id;
  const serviceUrl = activity.serviceUrl;
  if (!conversationId || !serviceUrl) return;

  // Same routing as @mention, just ack as DM (no thread reply).
  await upsertConversationRef(connectorId, {
    id: conversationId,
    serviceUrl,
    tenantId: activity.conversation?.tenantId ?? '',
    conversationType: 'personal',
    user_aad_id: activity.from?.aadObjectId,
    updated_at: new Date().toISOString(),
  });

  const result = await routeChatMessage({ text: activity.text ?? '', botName });
  await postReply(serviceUrl, conversationId, formatPlainText(clipReply(result.reply)), null);
  await audit(connectorId, orgId, 'event.message_dm', { routed: result.routed });
}

async function handleAdaptiveAction(
  connectorId: string,
  orgId: string,
  activity: TeamsActivity,
): Promise<void> {
  const conversationId = activity.conversation?.id;
  const serviceUrl = activity.serviceUrl;
  const value = (activity.value ?? {}) as { actionId?: string; projectId?: string; reason?: string };
  if (!conversationId || !serviceUrl || !value.actionId || !value.projectId) {
    await audit(connectorId, orgId, 'event.invoke.malformed', { value });
    return;
  }

  if (
    value.actionId === TEAMS_ACTION_IDS.feedbackUp ||
    value.actionId === TEAMS_ACTION_IDS.feedbackDown
  ) {
    const thumb: 'up' | 'down' = value.actionId === TEAMS_ACTION_IDS.feedbackUp ? 'up' : 'down';
    await recordTeamsCardFeedback({
      customerOrgId: orgId,
      connectorId,
      projectId: value.projectId,
      thumb,
      activityId: activity.replyToId ?? activity.id ?? null,
      userExternalId: activity.from?.aadObjectId ?? activity.from?.id ?? null,
      reason: value.reason ?? null,
    });
    await postReply(
      serviceUrl,
      conversationId,
      formatPlainText(`Recorded ${thumb === 'up' ? 'thumbs up' : 'thumbs down'} on \`${value.projectId}\`. Thanks!`),
      activity.id,
    );
    await audit(connectorId, orgId, 'event.invoke.feedback', {
      project_id: value.projectId,
      thumb,
    });
    return;
  }

  if (value.actionId === TEAMS_ACTION_IDS.dismiss) {
    await postReply(serviceUrl, conversationId, formatPlainText(`Dismissed.`), activity.id);
    await audit(connectorId, orgId, 'event.invoke.dismiss', { project_id: value.projectId });
    return;
  }

  if (value.actionId === TEAMS_ACTION_IDS.sendOutreach) {
    // Outreach trigger lives in a downstream agent; for v1 we ack and
    // record so the click count is observable in the audit log.
    await postReply(
      serviceUrl,
      conversationId,
      formatPlainText(`Outreach queued for \`${value.projectId}\`.`),
      activity.id,
    );
    await audit(connectorId, orgId, 'event.invoke.outreach', { project_id: value.projectId });
    return;
  }

  await audit(connectorId, orgId, 'event.invoke.unknown', { value });
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

async function postReply(
  serviceUrl: string,
  conversationId: string,
  card: AdaptiveCard,
  replyToId: string | null | undefined,
): Promise<void> {
  await postActivityWithOverride({
    serviceUrl,
    conversationId,
    card,
    replyToId: replyToId ?? undefined,
  });
}

async function audit(
  connectorId: string,
  orgId: string,
  eventType: string,
  summary: Record<string, unknown>,
): Promise<void> {
  await recordAudit({
    connector_id: connectorId,
    customer_org_id: orgId,
    event_type: eventType,
    direction: 'inbound',
    status: 'received',
    payload_summary: summary,
  });
}

function dashboardUrlFor(projectId: string): string {
  const base = process.env.PATHFINDER_PUBLIC_URL ?? 'https://www.unicron.systems/pathfinder';
  return `${base}/projects/${projectId}`;
}

interface LeadRow {
  id: string;
  title: string;
  score: number | null;
  rationale: string | null;
  project_value: number | null;
  source: string | null;
}

async function loadTopLeads(_orgId: string, limit: number): Promise<LeadRow[]> {
  // Same scope as Slack commands route — projects table doesn't yet
  // have customer_org_id; v1 returns top leads globally.
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: boolean) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{
              data: Record<string, unknown>[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
  const r = await sb
    .from('projects')
    .select('id, title, score, rationale, project_value, source')
    .eq('verified', true)
    .order('score', { ascending: false })
    .limit(limit);
  if (r.error || !r.data) return [];
  return r.data as unknown as LeadRow[];
}

interface RejectedRow {
  id: string;
  title: string;
  reason: string | null;
}

async function loadRejectedSample(_orgId: string, limit: number): Promise<RejectedRow[]> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: boolean) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{
              data: Record<string, unknown>[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
  const r = await sb
    .from('projects')
    .select('id, title, rationale')
    .eq('verified', false)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (r.error || !r.data) return [];
  return (r.data as unknown as { id: string; title: string; rationale: string | null }[]).map(
    (row) => ({ id: row.id, title: row.title, reason: row.rationale }),
  );
}
