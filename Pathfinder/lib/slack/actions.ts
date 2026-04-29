// lib/slack/actions.ts — Slack interactivity dispatcher.
//
// Handles two payload types:
//
//   block_actions   — button taps on lead messages (4 buttons total)
//   view_submission — submit on the Accept modal
//
// All accept/dismiss/snooze writes go through lib/lead-actions (P0-03's
// canonical accept-flow library). This module only orchestrates Slack
// I/O + message updates; it never duplicates accept logic.
//
// Slack requires a 200 within 3 seconds. We respond as soon as we've
// done the minimum required network work (open modal for accept;
// chat.update + recordLocalAction for dismiss/snooze; modal-close +
// chat.update + thread reply for view_submission). Typical wall-clock
// for each path is well under 3s; HubSpot can occasionally push us
// past that and the modal will spin briefly — acceptable v1 trade-off.

import { acceptLead, recordLocalAction } from '@/lib/lead-actions';
import { publicUrl } from '@/lib/public-url';
import { supabaseAdmin } from '@/lib/supabase';
import { auditSlack, getClient, getWorkspace } from '@/lib/slack/bot';
import {
  ACCEPT_MODAL_ACTION_IDS,
  ACCEPT_MODAL_BLOCK_IDS,
  ACCEPT_MODAL_CALLBACK_ID,
  ACTION_IDS,
  buildAcceptModal,
  buildAcceptThreadReply,
  buildLeadMessage,
  buildPostActionUpdate,
  type LeadMessageInput,
  type PostActionKind,
} from '@/lib/slack/messages';
import type { LeadAction, Project, SlackMessageRow, SlackResolvedAction } from '@/lib/types';

// ────────────────────────────────────────────────────────────────────────
// Public dispatcher — called by app/api/slack/actions/route.ts
// ────────────────────────────────────────────────────────────────────────

interface SlackUser {
  id: string;
  username?: string;
  name?: string;
  team_id?: string;
}

interface SlackTeam {
  id: string;
  domain?: string;
}

interface SlackChannel {
  id: string;
  name?: string;
}

interface BlockActionsPayload {
  type: 'block_actions';
  user: SlackUser;
  team: SlackTeam;
  channel?: SlackChannel;
  trigger_id: string;
  actions: Array<{
    action_id: string;
    block_id: string;
    value: string;
  }>;
  message?: { ts: string; channel?: string };
  container?: { channel_id?: string; message_ts?: string };
}

interface ViewSubmissionPayload {
  type: 'view_submission';
  user: SlackUser;
  team: SlackTeam;
  view: {
    callback_id: string;
    private_metadata: string;
    state: {
      values: Record<string, Record<string, ViewStateValue>>;
    };
  };
}

interface ViewStateValue {
  type: string;
  value?: string | null;
  selected_date?: string | null;
}

export type SlackInteractivityPayload = BlockActionsPayload | ViewSubmissionPayload;

export interface DispatchResult {
  /** HTTP status to return to Slack. 200 closes the modal / acks the action. */
  status: number;
  /** Optional response body. {} clears any open modal; { response_action: 'errors', ... } shows validation. */
  body?: Record<string, unknown>;
}

export async function dispatchSlackInteractivity(
  payload: SlackInteractivityPayload,
): Promise<DispatchResult> {
  if (payload.type === 'block_actions') {
    return dispatchBlockActions(payload);
  }
  if (payload.type === 'view_submission') {
    return dispatchViewSubmission(payload);
  }
  // Unknown type — ack 200 so Slack stops retrying, audit-log for follow-up.
  await auditSlack('action_unknown_type', {
    message: 'received an unsupported interactivity payload type',
    payload_type: (payload as { type?: string }).type ?? 'undefined',
  });
  return { status: 200 };
}

// ────────────────────────────────────────────────────────────────────────
// block_actions — button taps
// ────────────────────────────────────────────────────────────────────────

interface ActionValue {
  pid: string;
  smid: number;
}

function parseActionValue(raw: string): ActionValue | null {
  try {
    const v = JSON.parse(raw);
    if (typeof v?.pid !== 'string' || typeof v?.smid !== 'number') return null;
    return { pid: v.pid, smid: v.smid };
  } catch {
    return null;
  }
}

async function dispatchBlockActions(p: BlockActionsPayload): Promise<DispatchResult> {
  const action = p.actions[0];
  if (!action) {
    await auditSlack('action_no_action', { message: 'block_actions payload had no actions[0]' });
    return { status: 200 };
  }

  const parsed = parseActionValue(action.value);
  if (!parsed) {
    await auditSlack('action_bad_value', {
      message: 'action.value did not parse as { pid, smid }',
      action_id: action.action_id,
    });
    return { status: 200 };
  }

  switch (action.action_id) {
    case ACTION_IDS.accept:
      return openAcceptModal(p, parsed);
    case ACTION_IDS.dismiss:
      return handleDismissOrSnooze(p, parsed, 'dismiss');
    case ACTION_IDS.snooze24h:
      return handleDismissOrSnooze(p, parsed, 'snooze_24h');
    case ACTION_IDS.snooze7d:
      return handleDismissOrSnooze(p, parsed, 'snooze_7d');
    default:
      await auditSlack('action_unknown_id', {
        message: 'block_actions had an unknown action_id',
        action_id: action.action_id,
      });
      return { status: 200 };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Accept — open modal
// ────────────────────────────────────────────────────────────────────────

async function openAcceptModal(
  p: BlockActionsPayload,
  v: ActionValue,
): Promise<DispatchResult> {
  // Resolve channel + ts so the submit handler can update the message.
  const channelId = p.channel?.id ?? p.container?.channel_id;
  const ts = p.message?.ts ?? p.container?.message_ts;
  if (!channelId || !ts) {
    await auditSlack('action_missing_channel_ts', {
      message: 'accept tap arrived without channel_id / message_ts',
      project_id: v.pid,
      slack_messages_id: v.smid,
    });
    return { status: 200 };
  }

  // Prevent re-tap on a resolved message — we still ack 200 so Slack stops.
  const resolved = await isMessageResolved(p.team.id, channelId, ts);
  if (resolved) {
    await auditSlack('duplicate_button_tap', {
      message: 'accept tap on already-resolved message',
      project_id: v.pid,
      slack_messages_id: v.smid,
    });
    return { status: 200 };
  }

  const project = await loadProject(v.pid);
  const client = await getClient(p.team.id);

  await client.views.open({
    trigger_id: p.trigger_id,
    view: buildAcceptModal({
      projectId: v.pid,
      projectTitle: project?.title ?? 'Pathfinder lead',
      slackMessagesId: v.smid,
      channelId,
      messageTs: ts,
      defaultFirstActionDate: today(),
    }),
  });

  await auditSlack('accept_modal_opened', {
    message: 'opened accept modal',
    project_id: v.pid,
    slack_messages_id: v.smid,
    actor_user_id: p.user.id,
  });
  return { status: 200 };
}

// ────────────────────────────────────────────────────────────────────────
// Dismiss / Snooze — recordLocalAction + chat.update
// ────────────────────────────────────────────────────────────────────────

async function handleDismissOrSnooze(
  p: BlockActionsPayload,
  v: ActionValue,
  outcome: 'dismiss' | 'snooze_24h' | 'snooze_7d',
): Promise<DispatchResult> {
  const channelId = p.channel?.id ?? p.container?.channel_id;
  const ts = p.message?.ts ?? p.container?.message_ts;
  if (!channelId || !ts) {
    await auditSlack('action_missing_channel_ts', {
      message: `${outcome} tap arrived without channel_id / message_ts`,
      project_id: v.pid,
      slack_messages_id: v.smid,
    });
    return { status: 200 };
  }

  if (await isMessageResolved(p.team.id, channelId, ts)) {
    await auditSlack('duplicate_button_tap', {
      message: `${outcome} tap on already-resolved message`,
      project_id: v.pid,
      slack_messages_id: v.smid,
    });
    return { status: 200 };
  }

  const actorEmail = await resolveActorEmail(p.team.id, p.user.id);
  const actorDisplay = displayName(p.user);

  const status: 'dismissed' | 'snoozed' = outcome === 'dismiss' ? 'dismissed' : 'snoozed';
  const note =
    outcome === 'snooze_24h'
      ? 'snoozed 24h via slack'
      : outcome === 'snooze_7d'
      ? 'snoozed 7d via slack'
      : null;

  try {
    await recordLocalAction({
      projectId: v.pid,
      actorEmail,
      status,
      note,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await auditSlack('local_action_failed', {
      message: 'recordLocalAction threw',
      project_id: v.pid,
      slack_messages_id: v.smid,
      outcome,
      reason,
    });
    return { status: 200 };
  }

  await updateMessageInPlace({
    teamId: p.team.id,
    channelId,
    ts,
    project: await loadProject(v.pid),
    slackMessagesId: v.smid,
    actorDisplay,
    outcome:
      outcome === 'dismiss'
        ? { action: 'dismiss', actorDisplay }
        : outcome === 'snooze_24h'
        ? { action: 'snooze_24h', actorDisplay }
        : { action: 'snooze_7d', actorDisplay },
  });

  await markMessageResolved(p.team.id, channelId, ts, p.user.id, slackResolvedFrom(outcome));

  await auditSlack('local_action_recorded', {
    message: `${outcome} recorded`,
    project_id: v.pid,
    slack_messages_id: v.smid,
    actor_email: actorEmail,
    outcome,
  });
  return { status: 200 };
}

// ────────────────────────────────────────────────────────────────────────
// view_submission — Accept modal submit
// ────────────────────────────────────────────────────────────────────────

async function dispatchViewSubmission(p: ViewSubmissionPayload): Promise<DispatchResult> {
  if (p.view.callback_id !== ACCEPT_MODAL_CALLBACK_ID) {
    await auditSlack('view_unknown_callback', {
      message: 'view_submission for an unknown callback_id',
      callback_id: p.view.callback_id,
    });
    return { status: 200 };
  }

  let meta: { pid: string; smid: number; cid: string; ts: string };
  try {
    meta = JSON.parse(p.view.private_metadata);
  } catch {
    await auditSlack('view_bad_metadata', { message: 'private_metadata did not parse' });
    return { status: 200 };
  }

  const values = p.view.state.values;
  const pipelineRaw = values?.[ACCEPT_MODAL_BLOCK_IDS.pipelineValue]?.[ACCEPT_MODAL_ACTION_IDS.pipelineValue]?.value;
  const dateRaw = values?.[ACCEPT_MODAL_BLOCK_IDS.firstActionDate]?.[ACCEPT_MODAL_ACTION_IDS.firstActionDate]?.selected_date;
  const noteRaw = values?.[ACCEPT_MODAL_BLOCK_IDS.note]?.[ACCEPT_MODAL_ACTION_IDS.note]?.value;

  const pipelineValue = pipelineRaw != null && pipelineRaw !== '' ? Number(pipelineRaw) : null;
  if (pipelineValue == null || !Number.isFinite(pipelineValue) || pipelineValue < 0) {
    return {
      status: 200,
      body: {
        response_action: 'errors',
        errors: {
          [ACCEPT_MODAL_BLOCK_IDS.pipelineValue]: 'Enter a positive number.',
        },
      },
    };
  }

  const firstActionDate = dateRaw && dateRaw.length > 0 ? dateRaw : null;
  if (!firstActionDate) {
    return {
      status: 200,
      body: {
        response_action: 'errors',
        errors: {
          [ACCEPT_MODAL_BLOCK_IDS.firstActionDate]: 'Pick a first-action date.',
        },
      },
    };
  }

  const note = noteRaw && noteRaw.trim().length > 0 ? noteRaw.trim() : null;
  const actorEmail = await resolveActorEmail(p.team.id, p.user.id);
  const actorDisplay = displayName(p.user);

  // Heavy work — Supabase write + HubSpot push. Idempotent on
  // (project_id, actor_email) per LEAD-ACTIONS-API.md, so a re-submit
  // returns the same row.
  let leadActionId: number;
  let hubspotDealId: string | null;
  try {
    const r = await acceptLead({
      projectId: meta.pid,
      actorEmail,
      attestedPipelineValue: pipelineValue,
      firstActionDate,
      note,
    });
    leadActionId = r.leadActionId;
    hubspotDealId = r.hubspotDealId;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await auditSlack('accept_failed', {
      message: 'acceptLead threw',
      project_id: meta.pid,
      reason,
    });
    return {
      status: 200,
      body: {
        response_action: 'errors',
        errors: {
          [ACCEPT_MODAL_BLOCK_IDS.pipelineValue]: 'Accept failed; please try again.',
        },
      },
    };
  }

  await updateMessageInPlace({
    teamId: p.team.id,
    channelId: meta.cid,
    ts: meta.ts,
    project: await loadProject(meta.pid),
    slackMessagesId: meta.smid,
    actorDisplay,
    outcome: {
      action: 'accept',
      actorDisplay,
      attestedValue: pipelineValue,
      firstActionDate,
    },
  });

  await postAcceptThreadReply({
    teamId: p.team.id,
    channelId: meta.cid,
    threadTs: meta.ts,
    actorDisplay,
    attestedValue: pipelineValue,
    firstActionDate,
    note,
    hubspotDealId,
  });

  await markMessageResolved(p.team.id, meta.cid, meta.ts, p.user.id, 'accept');

  await auditSlack('accept_completed', {
    message: 'modal submit acceptLead completed',
    project_id: meta.pid,
    slack_messages_id: meta.smid,
    lead_action_id: leadActionId,
    hubspot_deal_id: hubspotDealId,
    actor_email: actorEmail,
  });

  // Empty body closes the modal (default `response_action: 'clear'`).
  return { status: 200, body: {} };
}

// ────────────────────────────────────────────────────────────────────────
// Helpers — Supabase reads/writes for slack_messages + projects
// ────────────────────────────────────────────────────────────────────────

let _admin: ReturnType<typeof supabaseAdmin> | null = null;
function admin() {
  if (!_admin) _admin = supabaseAdmin();
  return _admin;
}

async function loadProject(projectId: string): Promise<Project | null> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const r = await sb.from('projects').select('*').eq('id', projectId).maybeSingle();
  if (r.error || !r.data) return null;
  return r.data as unknown as Project;
}

async function isMessageResolved(teamId: string, channelId: string, ts: string): Promise<boolean> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
            };
          };
        };
      };
    };
  };
  const r = await sb
    .from('slack_messages')
    .select('resolved_at')
    .eq('team_id', teamId)
    .eq('channel_id', channelId)
    .eq('ts', ts)
    .maybeSingle();
  if (r.error || !r.data) return false;
  const row = r.data as unknown as Pick<SlackMessageRow, 'resolved_at'>;
  return Boolean(row.resolved_at);
}

async function markMessageResolved(
  teamId: string,
  channelId: string,
  ts: string,
  resolvedBy: string,
  resolvedAction: SlackResolvedAction,
): Promise<void> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
    };
  };
  await sb
    .from('slack_messages')
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
      resolved_action: resolvedAction,
    })
    .eq('team_id', teamId)
    .eq('channel_id', channelId)
    .eq('ts', ts);
}

interface UpdateInPlaceArgs {
  teamId: string;
  channelId: string;
  ts: string;
  project: Project | null;
  slackMessagesId: number;
  actorDisplay: string;
  outcome: PostActionKind;
}

async function updateMessageInPlace(args: UpdateInPlaceArgs): Promise<void> {
  const project = args.project;
  if (!project) {
    // No project to render; ack silently — the row vanished or the
    // channel stale-cached. The accept/dismiss row in lead_actions is
    // already persisted; the message just won't repaint.
    return;
  }

  const branchName = project.nearest_branch_id ? await loadBranchName(project.nearest_branch_id) : null;
  const original: LeadMessageInput = {
    project,
    branchName,
    mentionHere: false,
    slackMessagesId: args.slackMessagesId,
    dashboardUrl: `${publicUrl()}/projects/${project.id}`,
  };

  const update = buildPostActionUpdate({ original, outcome: args.outcome });
  const client = await getClient(args.teamId);
  await client.chat.update({
    channel: args.channelId,
    ts: args.ts,
    text: update.text,
    blocks: update.blocks as unknown as never[],
  });
}

async function loadBranchName(branchId: string): Promise<string | null> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const r = await sb.from('branches').select('name').eq('id', branchId).maybeSingle();
  if (r.error || !r.data) return null;
  return ((r.data as unknown) as { name?: string }).name ?? null;
}

interface PostThreadReplyArgs {
  teamId: string;
  channelId: string;
  threadTs: string;
  actorDisplay: string;
  attestedValue: number | null;
  firstActionDate: string | null;
  note: string | null;
  hubspotDealId: string | null;
}

async function postAcceptThreadReply(args: PostThreadReplyArgs): Promise<void> {
  const reply = buildAcceptThreadReply({
    actorDisplay: args.actorDisplay,
    attestedValue: args.attestedValue,
    firstActionDate: args.firstActionDate,
    note: args.note,
    hubspotDealUrl: hubspotDealUrl(args.hubspotDealId),
  });
  const client = await getClient(args.teamId);
  await client.chat.postMessage({
    channel: args.channelId,
    thread_ts: args.threadTs,
    text: reply.text,
    blocks: reply.blocks as unknown as never[],
  });
}

function hubspotDealUrl(dealId: string | null): string | null {
  if (!dealId) return null;
  // HubSpot redirects /contacts/0/deal/{id} to the user's portal when authenticated.
  // If we ever need a portal-specific URL we'll add HUBSPOT_PORTAL_ID env.
  return `https://app.hubspot.com/contacts/0/deal/${encodeURIComponent(dealId)}`;
}

// ────────────────────────────────────────────────────────────────────────
// User helpers — display name + email resolution
// ────────────────────────────────────────────────────────────────────────

function displayName(user: SlackUser): string {
  return user.name ?? user.username ?? `<@${user.id}>`;
}

async function resolveActorEmail(teamId: string, userId: string): Promise<string> {
  const ws = await getWorkspace(teamId);
  if (!ws) {
    throw new Error(`Slack workspace ${teamId} is not installed`);
  }
  try {
    const client = await getClient(teamId);
    const res = await client.users.info({ user: userId });
    const email = (res.user as { profile?: { email?: string } } | undefined)?.profile?.email;
    if (email) return email;
  } catch (e) {
    await auditSlack('users_info_failed', {
      message: 'users.info lookup failed; falling back to installer_email',
      team_id: teamId,
      actor_user_id: userId,
      reason: e instanceof Error ? e.message : String(e),
    });
  }
  if (ws.installer_email) return ws.installer_email;
  // Last-resort placeholder so the lead_actions upsert doesn't fail.
  // The audit log records the real Slack user_id so attribution can be
  // re-resolved later if email becomes available.
  return `slack:${userId}@${teamId}`;
}

// ────────────────────────────────────────────────────────────────────────
// Misc helpers
// ────────────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function slackResolvedFrom(outcome: 'dismiss' | 'snooze_24h' | 'snooze_7d'): SlackResolvedAction {
  return outcome;
}

// Export the LeadAction type so route handlers can typecheck against it
// without a separate import (handy for tests that mock acceptLead).
export type { LeadAction };
