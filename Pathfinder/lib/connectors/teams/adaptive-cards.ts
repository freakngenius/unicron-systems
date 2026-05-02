// lib/connectors/teams/adaptive-cards.ts — Adaptive Card builders for the
// connector-framework dispatcher. Pure functions: input → Adaptive Card
// JSON. Snapshot-tested in tests/connectors/teams-adaptive-cards.test.ts.
//
// Mirrors the Block Kit functions in lib/connectors/slack/formatters.ts
// so the dispatcher can emit either format from the same payload shape.
//
// SPEC § 4.2: Adaptive Card schema 1.5; cards under 28KB.
//
// Microsoft's Bot Framework wraps Adaptive Cards as an Activity with
// `attachments[0].contentType = 'application/vnd.microsoft.card.adaptive'`.
// We return both the raw card object (for snapshot tests + DM threads)
// and the wrapped attachment (for chat.postMessage-equivalent calls).

export interface AdaptiveCard {
  type: 'AdaptiveCard';
  $schema: string;
  version: string;
  body: AdaptiveElement[];
  actions?: AdaptiveAction[];
  msteams?: { width?: 'Full' };
}

export interface AdaptiveElement {
  type: string;
  [key: string]: unknown;
}

export interface AdaptiveAction {
  type: string;
  title?: string;
  url?: string;
  data?: Record<string, unknown>;
  style?: 'positive' | 'destructive' | 'default';
  [key: string]: unknown;
}

export interface TeamsAttachment {
  contentType: 'application/vnd.microsoft.card.adaptive';
  content: AdaptiveCard;
}

/** Action ids — used by the bot webhook to pattern-match `Action.Submit`
 *  payloads. Keep stable so we don't break in-flight cards posted before
 *  a deploy. */
export const TEAMS_ACTION_IDS = {
  viewLead: 'cf_view_lead',
  sendOutreach: 'cf_send_outreach',
  dismiss: 'cf_dismiss',
  feedbackUp: 'cf_feedback_up',
  feedbackDown: 'cf_feedback_down',
} as const;

const SCHEMA = 'http://adaptivecards.io/schemas/adaptive-card.json';
const VERSION = '1.5';
/** Adaptive Card max size hint per Microsoft docs. We assert below in
 *  toAttachment() that the rendered JSON stays under 28KB. */
const MAX_BYTES = 28 * 1024;

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

function scoreColor(score: number | null): 'good' | 'warning' | 'default' {
  if (score == null) return 'default';
  if (score >= 90) return 'good';
  if (score >= 75) return 'warning';
  return 'default';
}

// ---------------------------------------------------------------------------
// formatLead — title + facts row + rationale + 3 actions.
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

export function formatLead(input: FormatLeadInput): AdaptiveCard {
  const titleClean = truncate(input.title, 150);
  const scoreLabel = input.score != null ? String(input.score) : '—';
  const valueText = formatUSD(input.projectValue);
  const branch = input.branchName ?? '—';
  const source = input.source ?? '—';
  const rationale = (input.rationale ?? '').trim() || 'No rationale yet.';

  const card: AdaptiveCard = {
    type: 'AdaptiveCard',
    $schema: SCHEMA,
    version: VERSION,
    msteams: { width: 'Full' },
    body: [
      {
        type: 'TextBlock',
        text: titleClean,
        weight: 'Bolder',
        size: 'Large',
        wrap: true,
      },
      {
        type: 'FactSet',
        facts: [
          { title: 'Score', value: scoreLabel },
          { title: 'Value', value: valueText },
          { title: 'Source', value: source },
          { title: 'Branch', value: branch },
        ],
      },
      {
        type: 'TextBlock',
        text: truncate(rationale, 500),
        wrap: true,
        spacing: 'Medium',
        color: scoreColor(input.score),
      },
    ],
    actions: [
      {
        type: 'Action.OpenUrl',
        title: 'View lead',
        url: input.dashboardUrl,
      },
      {
        type: 'Action.Submit',
        title: 'Send outreach',
        style: 'positive',
        data: { actionId: TEAMS_ACTION_IDS.sendOutreach, projectId: input.id },
      },
      {
        type: 'Action.Submit',
        title: 'Dismiss',
        data: { actionId: TEAMS_ACTION_IDS.dismiss, projectId: input.id },
      },
      {
        type: 'Action.Submit',
        title: '👍 Useful',
        data: { actionId: TEAMS_ACTION_IDS.feedbackUp, projectId: input.id },
      },
      {
        type: 'Action.Submit',
        title: '👎 Not for us',
        data: { actionId: TEAMS_ACTION_IDS.feedbackDown, projectId: input.id },
      },
    ],
  };

  return card;
}

// ---------------------------------------------------------------------------
// formatRejection — single-text card for the rejected pile sample.
// ---------------------------------------------------------------------------
export interface FormatRejectionInput {
  id: string;
  title: string;
  reason: string | null;
}

export function formatRejection(input: FormatRejectionInput): AdaptiveCard {
  const titleClean = truncate(input.title, 150);
  const reason = (input.reason ?? '').trim() || 'No reason recorded.';
  return {
    type: 'AdaptiveCard',
    $schema: SCHEMA,
    version: VERSION,
    body: [
      {
        type: 'TextBlock',
        text: `Rejected: ${titleClean}`,
        weight: 'Bolder',
        wrap: true,
      },
      {
        type: 'TextBlock',
        text: truncate(reason, 500),
        wrap: true,
        spacing: 'Small',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// formatFeedbackPrompt — ask for thumbs feedback via Action.Submit buttons.
// Slack uses native reactions; Teams uses card actions because the
// reaction event surface in Teams is patchier.
// ---------------------------------------------------------------------------
export interface FormatFeedbackPromptInput {
  id: string;
  title: string;
}

export function formatFeedbackPrompt(input: FormatFeedbackPromptInput): AdaptiveCard {
  const titleClean = truncate(input.title, 150);
  return {
    type: 'AdaptiveCard',
    $schema: SCHEMA,
    version: VERSION,
    body: [
      {
        type: 'TextBlock',
        text: `How was this lead?`,
        weight: 'Bolder',
        wrap: true,
      },
      {
        type: 'TextBlock',
        text: titleClean,
        wrap: true,
      },
    ],
    actions: [
      {
        type: 'Action.Submit',
        title: '👍 Useful',
        style: 'positive',
        data: { actionId: TEAMS_ACTION_IDS.feedbackUp, projectId: input.id },
      },
      {
        type: 'Action.Submit',
        title: '👎 Not for us',
        data: { actionId: TEAMS_ACTION_IDS.feedbackDown, projectId: input.id },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// formatHelp — @-mention `help` response.
// ---------------------------------------------------------------------------
export function formatHelp(): AdaptiveCard {
  return {
    type: 'AdaptiveCard',
    $schema: SCHEMA,
    version: VERSION,
    body: [
      {
        type: 'TextBlock',
        text: 'Pathfinder commands',
        weight: 'Bolder',
        size: 'Medium',
      },
      {
        type: 'TextBlock',
        text:
          '`@Pathfinder leads [N]` — top N leads (default 5)\n' +
          '`@Pathfinder rejected` — recent rejected pile sample\n' +
          '`@Pathfinder feedback <project_id> <up|down> [reason]` — record feedback\n' +
          '`@Pathfinder help` — show this help',
        wrap: true,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// formatPlainText — used by error / acknowledgement responses.
// ---------------------------------------------------------------------------
export function formatPlainText(text: string): AdaptiveCard {
  return {
    type: 'AdaptiveCard',
    $schema: SCHEMA,
    version: VERSION,
    body: [{ type: 'TextBlock', text, wrap: true }],
  };
}

// ---------------------------------------------------------------------------
// toAttachment — wrap a card as a Bot Framework attachment + size guard.
// ---------------------------------------------------------------------------
export function toAttachment(card: AdaptiveCard): TeamsAttachment {
  const serialized = JSON.stringify(card);
  if (serialized.length > MAX_BYTES) {
    throw new Error(
      `adaptive card exceeds ${MAX_BYTES}-byte limit (${serialized.length} bytes); truncate before send`,
    );
  }
  return {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: card,
  };
}
