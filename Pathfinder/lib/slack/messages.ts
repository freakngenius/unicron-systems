// lib/slack/messages.ts — pure Block Kit builders for the Pathfinder
// Slack bot. No network calls, no state — builders take a typed input
// and return the JSON shape Slack expects. Snapshot-tested in
// __tests__/slack/messages.test.ts.
//
// Five builders:
//
//   buildLeadMessage             — per-lead channel post / DM with 4 buttons
//   buildAcceptModal             — view payload for views.open
//   buildPostActionUpdate        — replacement blocks after a button tap
//   buildAcceptThreadReply       — thread reply for accepts (Q7 resolution)
//   buildDigestMessage           — per-branch digest used by Friday brief

import type { Project } from '@/lib/types';

// ────────────────────────────────────────────────────────────────────────
// Local types — Block Kit shapes
// ────────────────────────────────────────────────────────────────────────

export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

export interface SlackMessagePayload {
  text: string; // plain-text fallback (required by Slack for accessibility + push notif)
  blocks: SlackBlock[];
}

export interface SlackModalView {
  type: 'modal';
  callback_id: string;
  title: { type: 'plain_text'; text: string };
  submit: { type: 'plain_text'; text: string };
  close: { type: 'plain_text'; text: string };
  private_metadata: string;
  blocks: SlackBlock[];
}

// ────────────────────────────────────────────────────────────────────────
// Action ids — single source of truth (lib/slack/actions.ts dispatches on these)
// ────────────────────────────────────────────────────────────────────────

export const ACTION_IDS = {
  accept: 'pf_accept',
  dismiss: 'pf_dismiss',
  snooze24h: 'pf_snooze_24h',
  snooze7d: 'pf_snooze_7d',
} as const;

export const ACCEPT_MODAL_CALLBACK_ID = 'pf_accept_modal';

export const ACCEPT_MODAL_BLOCK_IDS = {
  pipelineValue: 'pf_pipeline_value',
  firstActionDate: 'pf_first_action_date',
  note: 'pf_note',
} as const;

export const ACCEPT_MODAL_ACTION_IDS = {
  pipelineValue: 'pf_pipeline_value_input',
  firstActionDate: 'pf_first_action_date_input',
  note: 'pf_note_input',
} as const;

// ────────────────────────────────────────────────────────────────────────
// Per-lead message
// ────────────────────────────────────────────────────────────────────────

export interface LeadMessageInput {
  project: Pick<
    Project,
    'id' | 'title' | 'score' | 'project_value' | 'distance_miles' | 'source' | 'rationale'
  >;
  branchName: string | null;
  /** When true, prepend `<!here>` so the channel's online members get pinged. DMs pass false. */
  mentionHere: boolean;
  /** Persisted slack_messages.id; Slack's button payloads carry it back to dispatch. */
  slackMessagesId: number;
  /** Used by buttons for context-only display; not the dispatch primary key. */
  dashboardUrl: string;
}

interface ActionValuePayload {
  pid: string; // project_id
  smid: number; // slack_messages.id
}

function actionValue(input: ActionValuePayload): string {
  return JSON.stringify(input);
}

export function buildLeadMessage(input: LeadMessageInput): SlackMessagePayload {
  const p = input.project;
  const value = formatUSD(p.project_value);
  const distance = p.distance_miles != null ? `${p.distance_miles} mi` : '— mi';
  const score = p.score != null ? p.score : '—';
  const branch = input.branchName ?? '—';
  const rationale = (p.rationale ?? '').trim() || 'No rationale yet.';
  const truncatedRationale = truncate(rationale, 240);

  const blocks: SlackBlock[] = [];

  if (input.mentionHere) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '<!here> high-priority lead' },
    });
  }

  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: truncate(p.title, 150), emoji: true },
  });

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `\`score ${score}\` · \`${value}\` · \`${distance}\` · ${escapeMrkdwn(p.source)} · ${escapeMrkdwn(branch)}`,
      },
    ],
  });

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: truncatedRationale },
  });

  const value_payload = actionValue({ pid: p.id, smid: input.slackMessagesId });
  blocks.push({
    type: 'actions',
    block_id: 'pf_lead_actions',
    elements: [
      {
        type: 'button',
        action_id: ACTION_IDS.accept,
        text: { type: 'plain_text', text: 'Accept' },
        style: 'primary',
        value: value_payload,
      },
      {
        type: 'button',
        action_id: ACTION_IDS.dismiss,
        text: { type: 'plain_text', text: 'Dismiss' },
        value: value_payload,
      },
      {
        type: 'button',
        action_id: ACTION_IDS.snooze24h,
        text: { type: 'plain_text', text: 'Snooze 24h' },
        value: value_payload,
      },
      {
        type: 'button',
        action_id: ACTION_IDS.snooze7d,
        text: { type: 'plain_text', text: 'Snooze 7d' },
        value: value_payload,
      },
    ],
  });

  blocks.push({
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: `<${input.dashboardUrl}|View in Pathfinder ›>` },
    ],
  });

  // Plain-text fallback — used for push notifications + screen readers.
  const fallbackParts = [
    input.mentionHere ? '[high-priority]' : '',
    p.title,
    `score ${score}`,
    value,
    distance,
    branch,
  ].filter(Boolean);
  return {
    text: fallbackParts.join(' · '),
    blocks,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Accept modal
// ────────────────────────────────────────────────────────────────────────

export interface AcceptModalInput {
  projectId: string;
  projectTitle: string;
  slackMessagesId: number;
  channelId: string;
  /** Slack message ts of the original lead message, so submit can update it in-place. */
  messageTs: string;
  /** ISO date (YYYY-MM-DD); defaulted into the datepicker. */
  defaultFirstActionDate: string;
}

export function buildAcceptModal(input: AcceptModalInput): SlackModalView {
  const meta = {
    pid: input.projectId,
    smid: input.slackMessagesId,
    cid: input.channelId,
    ts: input.messageTs,
  };
  return {
    type: 'modal',
    callback_id: ACCEPT_MODAL_CALLBACK_ID,
    title: { type: 'plain_text', text: truncate(`Accept lead`, 24) },
    submit: { type: 'plain_text', text: 'Confirm accept' },
    close: { type: 'plain_text', text: 'Cancel' },
    private_metadata: JSON.stringify(meta),
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${escapeMrkdwn(truncate(input.projectTitle, 140))}*` },
      },
      {
        type: 'input',
        block_id: ACCEPT_MODAL_BLOCK_IDS.pipelineValue,
        label: { type: 'plain_text', text: 'Estimated pipeline value (USD)' },
        element: {
          type: 'number_input',
          action_id: ACCEPT_MODAL_ACTION_IDS.pipelineValue,
          is_decimal_allowed: true,
          min_value: '0',
          placeholder: { type: 'plain_text', text: 'e.g. 250000' },
        },
      },
      {
        type: 'input',
        block_id: ACCEPT_MODAL_BLOCK_IDS.firstActionDate,
        label: { type: 'plain_text', text: 'First-action date' },
        element: {
          type: 'datepicker',
          action_id: ACCEPT_MODAL_ACTION_IDS.firstActionDate,
          initial_date: input.defaultFirstActionDate,
        },
      },
      {
        type: 'input',
        block_id: ACCEPT_MODAL_BLOCK_IDS.note,
        optional: true,
        label: { type: 'plain_text', text: 'Note (optional)' },
        element: {
          type: 'plain_text_input',
          action_id: ACCEPT_MODAL_ACTION_IDS.note,
          multiline: true,
          max_length: 1000,
          placeholder: { type: 'plain_text', text: 'Context for the deal record …' },
        },
      },
    ],
  };
}

// ────────────────────────────────────────────────────────────────────────
// Post-action update — replaces the original message after a button tap
// ────────────────────────────────────────────────────────────────────────

export type PostActionKind =
  | { action: 'accept'; actorDisplay: string; attestedValue: number | null; firstActionDate: string | null }
  | { action: 'dismiss'; actorDisplay: string }
  | { action: 'snooze_24h'; actorDisplay: string }
  | { action: 'snooze_7d'; actorDisplay: string };

export interface PostActionUpdateInput {
  /** Original message blocks before the buttons; we keep the header + context + rationale. */
  original: LeadMessageInput;
  outcome: PostActionKind;
}

export function buildPostActionUpdate(input: PostActionUpdateInput): SlackMessagePayload {
  // Re-use the original builder, then replace the actions block with a context line.
  const base = buildLeadMessage({ ...input.original, mentionHere: false });
  const blocks: SlackBlock[] = base.blocks.filter(
    (b) => b.type !== 'actions' && !(b.type === 'section' && (b.text as { text?: string } | undefined)?.text === '<!here> high-priority lead'),
  );
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: outcomeLine(input.outcome) }],
  });
  blocks.push({
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: `<${input.original.dashboardUrl}|View in Pathfinder ›>` },
    ],
  });
  return { text: `${base.text} — ${outcomePlain(input.outcome)}`, blocks };
}

function outcomeLine(o: PostActionKind): string {
  switch (o.action) {
    case 'accept': {
      const value = o.attestedValue != null ? formatUSD(o.attestedValue) : '—';
      const date = o.firstActionDate ?? '—';
      return `:white_check_mark: *Accepted* by ${escapeMrkdwn(o.actorDisplay)} · pipeline ${value} · first action ${escapeMrkdwn(date)}`;
    }
    case 'dismiss':
      return `:no_entry: *Dismissed* by ${escapeMrkdwn(o.actorDisplay)}`;
    case 'snooze_24h':
      return `:zzz: *Snoozed 24h* by ${escapeMrkdwn(o.actorDisplay)}`;
    case 'snooze_7d':
      return `:zzz: *Snoozed 7d* by ${escapeMrkdwn(o.actorDisplay)}`;
  }
}

function outcomePlain(o: PostActionKind): string {
  switch (o.action) {
    case 'accept':
      return `accepted by ${o.actorDisplay}`;
    case 'dismiss':
      return `dismissed by ${o.actorDisplay}`;
    case 'snooze_24h':
      return `snoozed 24h by ${o.actorDisplay}`;
    case 'snooze_7d':
      return `snoozed 7d by ${o.actorDisplay}`;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Accept thread reply (Q7 resolution: accepts only)
// ────────────────────────────────────────────────────────────────────────

export interface AcceptThreadReplyInput {
  actorDisplay: string;
  attestedValue: number | null;
  firstActionDate: string | null;
  note: string | null;
  hubspotDealUrl: string | null;
}

export function buildAcceptThreadReply(input: AcceptThreadReplyInput): SlackMessagePayload {
  const lines: string[] = [];
  lines.push(`:memo: Accept details from ${escapeMrkdwn(input.actorDisplay)}:`);
  if (input.attestedValue != null) {
    lines.push(`• Pipeline value: \`${formatUSD(input.attestedValue)}\``);
  }
  if (input.firstActionDate) {
    lines.push(`• First action: \`${escapeMrkdwn(input.firstActionDate)}\``);
  }
  if (input.note && input.note.trim().length > 0) {
    lines.push(`• Note: ${escapeMrkdwn(truncate(input.note, 1500))}`);
  }
  if (input.hubspotDealUrl) {
    lines.push(`<${input.hubspotDealUrl}|View deal in HubSpot ›>`);
  }
  const text = lines.join('\n');
  return {
    text,
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }],
  };
}

// ────────────────────────────────────────────────────────────────────────
// Per-branch digest (no buttons; deep-links only)
// ────────────────────────────────────────────────────────────────────────

export interface DigestOpportunity {
  id: string;
  title: string;
  source: string;
  value: string;
  distance: string;
  score: number;
  rationale: string;
  highPriority: boolean;
}

export interface DigestMessageInput {
  branchName: string;
  date: string;
  statusStrip: string;
  opportunities: DigestOpportunity[];
  dashboardUrl: string;
}

export function buildDigestMessage(input: DigestMessageInput): SlackMessagePayload {
  const blocks: SlackBlock[] = [];
  const headerText = `Friday brief · ${input.branchName} · ${input.date}`;
  blocks.push({ type: 'header', text: { type: 'plain_text', text: headerText, emoji: false } });
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `\`${input.statusStrip}\`` }],
  });
  blocks.push({ type: 'divider' });

  if (input.opportunities.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_No high-priority opportunities this week._' },
    });
  } else {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*Top opportunities*' },
    });
    for (const o of input.opportunities) {
      const badge = o.highPriority ? ' :large_orange_diamond: high-priority' : '';
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${escapeMrkdwn(truncate(o.title, 140))}*${badge}\n\`${escapeMrkdwn(o.source)} · ${escapeMrkdwn(o.value)} · ${escapeMrkdwn(o.distance)} · score ${o.score}\`\n${escapeMrkdwn(truncate(o.rationale, 240))}`,
        },
      });
    }
  }

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Open operations console' },
        url: input.dashboardUrl,
        style: 'primary',
      },
    ],
  });

  return { text: headerText, blocks };
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function formatUSD(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, Math.max(0, n - 1)) + '…';
}

// Slack mrkdwn escape — we wrap user-supplied strings so a stray
// backtick or angle bracket doesn't confuse Slack's parser. Block Kit
// is generally tolerant, but rationales are user-visible and worth
// guarding.
function escapeMrkdwn(s: string): string {
  return s.replace(/[<>&]/g, (ch) => (ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : '&amp;'));
}
