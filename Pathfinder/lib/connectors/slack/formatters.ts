// lib/connectors/slack/formatters.ts — Block Kit builders for the
// connector-framework dispatcher. Pure functions: input → Block Kit JSON.
// Snapshot-tested in tests/connectors/slack-formatters.test.ts.
//
// These run on top of the connector framework (per-org, OAuth-installed
// workspaces). The Phase-1 Slack alerts code in lib/slack/messages.ts
// keeps its own builders for the existing slack_workspaces install path
// — we don't share types because the dispatch layer is different
// (connector_id-scoped action_value vs slack_messages.id).

export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

export interface SlackMessagePayload {
  text: string; // accessibility / push fallback (required by Slack)
  blocks: SlackBlock[];
}

// ---------------------------------------------------------------------------
// Action ids — the slash-command + reaction handlers pattern-match on these
// ---------------------------------------------------------------------------
export const CONNECTOR_ACTION_IDS = {
  viewLead: 'cf_view_lead',
  sendOutreach: 'cf_send_outreach',
  dismiss: 'cf_dismiss',
  feedbackUp: 'cf_feedback_up',
  feedbackDown: 'cf_feedback_down',
} as const;

// ---------------------------------------------------------------------------
// Lead summary input shape — kept narrow so tests can construct fixtures
// without pulling the full Project type. Production callers can spread
// from a Project row; only the listed fields matter.
// ---------------------------------------------------------------------------
export interface FormatLeadInput {
  id: string;
  title: string;
  score: number | null;
  rationale: string | null;
  projectValue?: number | null;
  source?: string | null;
  branchName?: string | null;
  dashboardUrl: string;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

function formatUSD(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

function scoreEmoji(score: number | null): string {
  if (score == null) return '⚪';
  if (score >= 90) return '🟢';
  if (score >= 75) return '🟡';
  return '⚪';
}

/**
 * formatLead — header + metadata context + rationale + 3 action buttons.
 *
 * Block layout (5 blocks):
 *   1. header        — title (truncated to 150 chars)
 *   2. context       — score badge / value / source / branch
 *   3. section       — rationale (truncated to 280 chars)
 *   4. actions       — View Lead, Send Outreach, Dismiss
 *   5. divider
 *
 * The `value` field on each button carries `lead:<projectId>` so the
 * action handler can resolve the lead without parsing the Block Kit.
 */
export function formatLead(input: FormatLeadInput): SlackMessagePayload {
  const titleClean = truncate(input.title, 150);
  const valueText = formatUSD(input.projectValue);
  const scoreLabel = input.score != null ? String(input.score) : '—';
  const branch = input.branchName ?? '—';
  const source = input.source ?? '—';
  const rationale = (input.rationale ?? '').trim() || 'No rationale yet.';

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${scoreEmoji(input.score)} ${titleClean}`, emoji: true },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `\`score ${scoreLabel}\` · \`${valueText}\` · ${source} · ${branch}`,
        },
      ],
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: truncate(rationale, 280) },
    },
    {
      type: 'actions',
      block_id: `lead_actions:${input.id}`,
      elements: [
        {
          type: 'button',
          action_id: CONNECTOR_ACTION_IDS.viewLead,
          text: { type: 'plain_text', text: 'View lead' },
          url: input.dashboardUrl,
          value: `lead:${input.id}`,
        },
        {
          type: 'button',
          action_id: CONNECTOR_ACTION_IDS.sendOutreach,
          text: { type: 'plain_text', text: 'Send outreach' },
          style: 'primary',
          value: `lead:${input.id}`,
        },
        {
          type: 'button',
          action_id: CONNECTOR_ACTION_IDS.dismiss,
          text: { type: 'plain_text', text: 'Dismiss' },
          value: `lead:${input.id}`,
        },
      ],
    },
    { type: 'divider' },
  ];

  return {
    text: `Lead: ${titleClean} (score ${scoreLabel}, ${valueText})`,
    blocks,
  };
}

// ---------------------------------------------------------------------------
// formatRejection — single-section rationale-style block for the rejected
// pile sample. No buttons; this is informational.
// ---------------------------------------------------------------------------
export interface FormatRejectionInput {
  id: string;
  title: string;
  reason: string | null;
}

export function formatRejection(input: FormatRejectionInput): SlackMessagePayload {
  const reason = (input.reason ?? '').trim() || 'No reason recorded.';
  const titleClean = truncate(input.title, 150);
  return {
    text: `Rejected: ${titleClean} — ${truncate(reason, 100)}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Rejected:* ${titleClean}\n${truncate(reason, 280)}`,
        },
      },
      { type: 'divider' },
    ],
  };
}

// ---------------------------------------------------------------------------
// formatFeedbackPrompt — one-section message asking for thumbs feedback.
// The reactions:read scope lets us capture +1 / -1 reactions on this
// message (events route handles `reaction_added` for the bot's own ts).
// ---------------------------------------------------------------------------
export interface FormatFeedbackPromptInput {
  id: string;
  title: string;
}

export function formatFeedbackPrompt(input: FormatFeedbackPromptInput): SlackMessagePayload {
  const titleClean = truncate(input.title, 150);
  return {
    text: `How was this lead? React 👍 or 👎 — ${titleClean}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `How was *${titleClean}*? React :+1: useful, :-1: not for us.`,
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// formatHelp — slash-command /pathfinder help response.
// ---------------------------------------------------------------------------
export function formatHelp(): SlackMessagePayload {
  return {
    text: 'Pathfinder slash commands',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            '*Pathfinder commands*\n' +
            '`/pathfinder leads [N]` — top N leads (default 5)\n' +
            '`/pathfinder rejected` — recent rejected pile sample\n' +
            '`/pathfinder feedback <project_id> <up|down> [reason]` — record feedback\n' +
            '`/pathfinder help` — show this help',
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// formatPlainText — used by error / acknowledgement responses
// ---------------------------------------------------------------------------
export function formatPlainText(text: string): SlackMessagePayload {
  return {
    text,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text },
      },
    ],
  };
}
