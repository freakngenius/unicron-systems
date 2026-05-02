// POST /api/connectors/slack/events
//
// Slack Events API webhook for the connector framework. PUBLIC;
// signature-verified. middleware.ts exempts this path. Slack sends JSON
// payloads.
//
// Event types handled in v1:
//   url_verification → echo challenge (Events API setup handshake)
//   app_mention      → route to chat bridge, post reply in thread
//   message.im       → DM bot, same routing
//   reaction_added   → on bot's own message ts, capture as lead_feedback
//                      (only +1 / -1 reactions; only on bot messages)
//
// We respond 200 quickly. Heavy work (LLM calls, etc.) happens before we
// post the reply via chat.postMessage; 3-second ack risk is mitigated by
// the chat-bridge keeping its v1 reply pure (no LLM call inside the
// handler). When we wire Sonar through, the handler will respond 200
// immediately and post the reply asynchronously via response_url or a
// queued worker.

import { NextResponse } from 'next/server';

import { recordAudit } from '@/lib/connectors/audit';
import { recordReactionFeedback } from '@/lib/connectors/feedback';
import { getConnectorByExternalId } from '@/lib/connectors/registry';
import { clipReply, routeChatMessage } from '@/lib/connectors/slack/chat-bridge';
import { verifySlackRequest } from '@/lib/connectors/slack/signature';
import { getToken } from '@/lib/connectors/tokens';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

interface UrlVerificationPayload {
  type: 'url_verification';
  challenge: string;
}

interface EventCallbackPayload {
  type: 'event_callback';
  team_id?: string;
  api_app_id?: string;
  event: SlackEvent;
}

type SlackEvent =
  | { type: 'app_mention'; user?: string; text?: string; channel?: string; ts?: string; thread_ts?: string }
  | { type: 'message'; channel_type?: string; user?: string; text?: string; channel?: string; ts?: string; thread_ts?: string; bot_id?: string; subtype?: string }
  | {
      type: 'reaction_added';
      user?: string;
      reaction?: string;
      item?: { type: string; channel?: string; ts?: string };
      item_user?: string;
    }
  | { type: string; [key: string]: unknown };

type SlackPayload = UrlVerificationPayload | EventCallbackPayload;

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-slack-signature');
  const timestamp = req.headers.get('x-slack-request-timestamp');

  const verify = verifySlackRequest({ signature, timestamp, body: rawBody });
  if (!verify.ok) {
    return new NextResponse(`Bad signature: ${verify.reason}`, { status: 401 });
  }

  let payload: SlackPayload;
  try {
    payload = JSON.parse(rawBody) as SlackPayload;
  } catch {
    return new NextResponse('Bad JSON', { status: 400 });
  }

  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (payload.type !== 'event_callback') {
    return NextResponse.json({ ok: true });
  }

  const teamId = payload.team_id;
  if (!teamId) return NextResponse.json({ ok: true });

  const connector = await getConnectorByExternalId('slack', teamId);
  if (!connector) {
    // Workspace not connected via the new framework — could still be
    // connected via the legacy slack_workspaces install path. We just
    // ack the event so Slack doesn't retry.
    return NextResponse.json({ ok: true });
  }

  const ev = payload.event;
  const orgId = connector.customerOrgId;
  const botUserId = (connector.metadata.bot_user_id as string | null | undefined) ?? null;

  try {
    if (ev.type === 'app_mention') {
      await handleAppMention(connector.id, orgId, botUserId, ev as Extract<SlackEvent, { type: 'app_mention' }>);
    } else if (ev.type === 'message') {
      const m = ev as Extract<SlackEvent, { type: 'message' }>;
      // Only `message.im` (DMs to the bot). Ignore bot's own messages,
      // edits, and channel messages — those flow through app_mention.
      if (m.channel_type === 'im' && !m.bot_id && !m.subtype && m.user && m.user !== botUserId) {
        await handleDM(connector.id, orgId, botUserId, m);
      }
    } else if (ev.type === 'reaction_added') {
      await handleReaction(connector.id, orgId, botUserId, ev as Extract<SlackEvent, { type: 'reaction_added' }>);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordAudit({
      connectorId: connector.id,
      customerOrgId: orgId,
      eventType: `event.${ev.type}.error`,
      direction: 'inbound',
      status: 'failed',
      payloadSummary: { event_type: ev.type },
      errorMessage: message,
    });
    // Always ack 200 — Slack retries non-2xx for 5 minutes.
  }

  return NextResponse.json({ ok: true });
}

// ────────────────────────────────────────────────────────────────────────
// Event handlers
// ────────────────────────────────────────────────────────────────────────

async function handleAppMention(
  connectorId: string,
  orgId: string,
  botUserId: string | null,
  ev: Extract<SlackEvent, { type: 'app_mention' }>,
): Promise<void> {
  if (!ev.channel) return;

  const result = await routeChatMessage({ text: ev.text ?? '', botUserId });
  await postSlackReply(connectorId, ev.channel, ev.thread_ts ?? ev.ts ?? null, clipReply(result.reply));

  await recordAudit({
    connectorId,
    customerOrgId: orgId,
    eventType: 'event.app_mention',
    direction: 'inbound',
    status: 'received',
    payloadSummary: { channel: ev.channel, routed: result.routed },
  });
}

async function handleDM(
  connectorId: string,
  orgId: string,
  botUserId: string | null,
  ev: Extract<SlackEvent, { type: 'message' }>,
): Promise<void> {
  if (!ev.channel) return;

  const result = await routeChatMessage({ text: ev.text ?? '', botUserId });
  await postSlackReply(connectorId, ev.channel, ev.thread_ts ?? null, clipReply(result.reply));

  await recordAudit({
    connectorId,
    customerOrgId: orgId,
    eventType: 'event.message_im',
    direction: 'inbound',
    status: 'received',
    payloadSummary: { channel: ev.channel, routed: result.routed },
  });
}

async function handleReaction(
  connectorId: string,
  orgId: string,
  botUserId: string | null,
  ev: Extract<SlackEvent, { type: 'reaction_added' }>,
): Promise<void> {
  // Security: only capture reactions on messages the bot itself posted.
  // The reaction event includes `item_user` — the user who posted the
  // reacted-to message. For a bot message that equals the bot's user id.
  // Reject events from non-bot messages so user-on-user reactions don't
  // get captured as agent feedback.
  if (!botUserId || ev.item_user !== botUserId) {
    await recordAudit({
      connectorId,
      customerOrgId: orgId,
      eventType: 'event.reaction_added.skipped',
      direction: 'inbound',
      status: 'received',
      payloadSummary: {
        reason: 'item_user_not_bot',
        item_user: ev.item_user ?? null,
      },
    });
    return;
  }

  const reaction = (ev.reaction ?? '').toLowerCase();
  const thumb: 'up' | 'down' | null =
    reaction === '+1' || reaction === 'thumbsup'
      ? 'up'
      : reaction === '-1' || reaction === 'thumbsdown'
        ? 'down'
        : null;
  if (!thumb || !ev.item?.ts || !ev.user) {
    return;
  }

  // Resolve the project id from the bot's posted message. We do this by
  // looking at the message blocks via chat.history; the action_value of
  // each lead_actions button carries `lead:<projectId>`. For C-1B we
  // accept the simpler proxy: parse from the message's `text` fallback.
  const projectId = await resolveProjectIdForMessageTs(connectorId, ev.item.channel ?? null, ev.item.ts);
  if (!projectId) {
    await recordAudit({
      connectorId,
      customerOrgId: orgId,
      eventType: 'event.reaction_added.unmapped',
      direction: 'inbound',
      status: 'received',
      payloadSummary: { ts: ev.item.ts, channel: ev.item.channel ?? null },
    });
    return;
  }

  await recordReactionFeedback({
    customerOrgId: orgId,
    connectorId,
    projectId,
    thumb,
    messageTs: ev.item.ts,
    userExternalId: ev.user,
  });

  await recordAudit({
    connectorId,
    customerOrgId: orgId,
    eventType: 'event.reaction_added',
    direction: 'inbound',
    status: 'received',
    payloadSummary: { project_id: projectId, thumb, ts: ev.item.ts },
  });
}

// ────────────────────────────────────────────────────────────────────────
// Slack I/O helpers
// ────────────────────────────────────────────────────────────────────────

async function postSlackReply(
  connectorId: string,
  channel: string,
  threadTs: string | null,
  text: string,
): Promise<void> {
  const token = await getToken(connectorId);
  if (!token) return;
  const body: Record<string, unknown> = { channel, text };
  if (threadTs) body.thread_ts = threadTs;
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token.accessToken}`,
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
}

/**
 * Resolve the `project_id` carried by a bot-posted lead message.
 *
 * Strategy: look up the most recent `connector_audit_log` row for this
 * connector with payload_summary referencing `ts === messageTs`. If
 * absent, return null (the reaction is then treated as unmapped, which
 * is the correct soft-fail state for a reaction on a non-lead bot
 * message such as a help reply).
 */
async function resolveProjectIdForMessageTs(
  connectorId: string,
  _channel: string | null,
  ts: string,
): Promise<string | null> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
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
  };
  const r = await sb
    .from('connector_audit_log')
    .select('payload_summary')
    .eq('connector_id', connectorId)
    .eq('event_type', 'lead.posted')
    .order('created_at', { ascending: false })
    .limit(50);
  if (r.error || !r.data) return null;
  for (const row of r.data) {
    const summary = (row as { payload_summary?: Record<string, unknown> }).payload_summary;
    if (!summary) continue;
    if (summary.ts === ts) {
      const pid = summary.project_id;
      if (typeof pid === 'string' && pid.length > 0) return pid;
    }
  }
  return null;
}
