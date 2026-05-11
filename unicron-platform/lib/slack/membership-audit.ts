// lib/slack/membership-audit.ts — Stream S1
//
// Enumerates every public channel in the workspace and every private/MPIM
// conversation the orchestrator bot can already see, and reports which ones
// the bot is currently a member of. Output feeds the runbook in
// Company Docs/Specs/atrium-slack-digest/.
//
// Bot-token coverage limits (per Slack scope docs):
//   - channels:read → returns ALL public channels (member or not).
//   - groups:read   → returns ONLY private channels the bot has been added to.
//   - mpim:read     → returns ONLY MPIMs the bot has been added to.
//
// Practical consequence: for public channels the audit is workspace-wide and
// `bot_missing_total` is meaningful. For private channels and MPIMs the audit
// is bot-visible-only — if the bot has never been invited to a private
// channel, it will never appear here. Discovering missing private-channel
// memberships requires an admin user-token sweep which is out of scope for
// S1 (tracked as a follow-on Bug Fix card).
//
// We read `is_member` directly off conversations.list rather than calling
// conversations.info per channel — saves round-trips and matches what the
// daily-scan loop will actually iterate.

import { slackPaginated } from './client.js';

export type ChannelType = 'public_channel' | 'private_channel' | 'mpim';

export interface AuditedChannel {
  channel_id: string;
  channel_name: string;
  type: ChannelType;
  is_archived: boolean;
  is_bot_member: boolean;
  num_members: number | null;
  last_activity_ts: string | null; // Slack ts (e.g., "1715472000.000100"), or null if unknown
  topic: string | null;
  purpose: string | null;
}

interface SlackConversation {
  id: string;
  name?: string;
  name_normalized?: string;
  is_channel?: boolean;
  is_group?: boolean;
  is_mpim?: boolean;
  is_private?: boolean;
  is_archived?: boolean;
  is_member?: boolean;
  num_members?: number;
  topic?: { value: string };
  purpose?: { value: string };
  created?: number;
  updated?: number;
  // Slack returns latest message ts on some objects; not guaranteed.
  latest?: { ts?: string };
}

interface ConversationsListPage {
  ok: boolean;
  channels?: SlackConversation[];
  response_metadata?: { next_cursor?: string };
  error?: string;
  [key: string]: unknown;
}

function classify(c: SlackConversation): ChannelType {
  if (c.is_mpim) return 'mpim';
  if (c.is_private || c.is_group) return 'private_channel';
  return 'public_channel';
}

function displayName(c: SlackConversation): string {
  return c.name_normalized || c.name || `(unnamed:${c.id})`;
}

export interface AuditOptions {
  /** Slack types= param. Default covers everything we plan to scan. */
  types?: string;
  /** exclude_archived flag. Default true (we don't want to scan dead channels). */
  excludeArchived?: boolean;
  /** Per-page limit. Slack max is 1000; default 200 (their recommendation). */
  pageLimit?: number;
}

/**
 * Run the membership audit. Returns a flat list sorted by:
 *   1. is_bot_member desc (members first)
 *   2. type asc          (public_channel → private_channel → mpim)
 *   3. channel_name asc
 */
export async function runMembershipAudit(
  opts: AuditOptions = {},
): Promise<AuditedChannel[]> {
  const types = opts.types ?? 'public_channel,private_channel,mpim';
  const excludeArchived = opts.excludeArchived ?? true;
  const limit = opts.pageLimit ?? 200;

  const out: AuditedChannel[] = [];

  for await (const page of slackPaginated<ConversationsListPage>('conversations.list', {
    types,
    exclude_archived: excludeArchived,
    limit,
  })) {
    for (const c of page.channels ?? []) {
      out.push({
        channel_id: c.id,
        channel_name: displayName(c),
        type: classify(c),
        is_archived: !!c.is_archived,
        is_bot_member: !!c.is_member,
        num_members: typeof c.num_members === 'number' ? c.num_members : null,
        last_activity_ts: c.latest?.ts ?? null,
        topic: c.topic?.value || null,
        purpose: c.purpose?.value || null,
      });
    }
  }

  out.sort((a, b) => {
    if (a.is_bot_member !== b.is_bot_member) return a.is_bot_member ? -1 : 1;
    if (a.type !== b.type) return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
    return a.channel_name.localeCompare(b.channel_name);
  });

  return out;
}

const TYPE_ORDER: Record<ChannelType, number> = {
  public_channel: 0,
  private_channel: 1,
  mpim: 2,
};

export interface AuditSummary {
  generated_at: string;
  /** Whether archived channels were excluded (defaults to true). */
  exclude_archived: boolean;
  /** Total visible-to-the-audit channels (public workspace-wide + private/MPIM that bot can see). */
  visible_total: number;
  bot_member_total: number;
  /** Bot is missing from this many *visible* channels — only meaningful for public_channel. */
  bot_missing_total: number;
  by_type: Record<ChannelType, { total: number; bot_member: number; coverage: 'workspace' | 'bot_visible_only' }>;
  channels: AuditedChannel[];
}

export function summarize(
  channels: AuditedChannel[],
  opts: { excludeArchived?: boolean } = {},
): AuditSummary {
  const by_type: AuditSummary['by_type'] = {
    public_channel: { total: 0, bot_member: 0, coverage: 'workspace' },
    private_channel: { total: 0, bot_member: 0, coverage: 'bot_visible_only' },
    mpim: { total: 0, bot_member: 0, coverage: 'bot_visible_only' },
  };
  let bot_member_total = 0;
  for (const c of channels) {
    by_type[c.type].total++;
    if (c.is_bot_member) {
      by_type[c.type].bot_member++;
      bot_member_total++;
    }
  }
  return {
    generated_at: new Date().toISOString(),
    exclude_archived: opts.excludeArchived ?? true,
    visible_total: channels.length,
    bot_member_total,
    bot_missing_total: channels.length - bot_member_total,
    by_type,
    channels,
  };
}

/**
 * Render the audit as a Markdown table block — for paste-into-runbook + PR
 * description usage.
 */
export function renderMarkdown(s: AuditSummary): string {
  const lines: string[] = [];
  lines.push(`# Slack channel membership audit`);
  lines.push('');
  lines.push(`Generated: ${s.generated_at}`);
  lines.push('');
  lines.push(`- Visible channels (active${s.exclude_archived ? '' : ', incl. archived'}): **${s.visible_total}**`);
  lines.push(`- Bot is member of: **${s.bot_member_total}**`);
  lines.push(`- Bot missing from (visible only): **${s.bot_missing_total}**`);
  lines.push('');
  lines.push('> **Coverage note:** \`channels:read\` returns every public channel in the workspace (member or not).');
  lines.push('> \`groups:read\` and \`mpim:read\` only return private/MPIM conversations the bot has already been');
  lines.push('> added to — so missing-membership for private channels is not enumerable from this report. To');
  lines.push('> discover private channels the bot was never invited to, an admin user-token sweep is needed');
  lines.push('> (tracked separately).');
  lines.push('');
  lines.push(`| type | total | bot member | coverage |`);
  lines.push(`|---|---:|---:|---|`);
  for (const t of ['public_channel', 'private_channel', 'mpim'] as ChannelType[]) {
    const row = s.by_type[t];
    lines.push(`| ${t} | ${row.total} | ${row.bot_member} | ${row.coverage} |`);
  }
  lines.push('');
  lines.push('## Channels');
  lines.push('');
  lines.push('| name | id | type | bot? | members | last activity |');
  lines.push('|---|---|---|:---:|---:|---|');
  for (const c of s.channels) {
    const last = c.last_activity_ts
      ? new Date(Math.floor(parseFloat(c.last_activity_ts) * 1000)).toISOString()
      : '—';
    lines.push(
      `| ${c.channel_name} | \`${c.channel_id}\` | ${c.type} | ${c.is_bot_member ? '✓' : '·'} | ${c.num_members ?? '—'} | ${last} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}
