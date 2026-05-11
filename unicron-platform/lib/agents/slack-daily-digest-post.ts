// lib/agents/slack-daily-digest-post.ts — Stream S4
//
// Optional Slack post-back of the daily digest.
//
// Listens for the 'slack/daily-digest.posted' event (fired by
// slackDailyScanCron / slackDailyScanRun on completion in S2). If the
// env var SLACK_DAILY_DIGEST_CHANNEL_ID is set, posts a Block Kit
// summary to that channel. If unset, silently skips with a structured
// "skipped" return value (not an error — feature-flag gate).
//
// Block Kit shape:
//   1. Header: "Slack daily digest · <date>"
//   2. Top theme as a section block (large markdown)
//   3. Section: "Top action items" + up to 3 bulleted with channel hints
//   4. Section: "Top decisions" + up to 3 bulleted with rationale
//   5. Context block with footer: "<channel_count> channels · <message_count>
//      messages · <action_items_extracted> AIs · <decisions_extracted>
//      decisions" + link to atrium.unicron.systems
//
// Refusal-layer hooks:
//   - slack-write pattern (specific channel from env, audit-logged).
//   - feature-flag gate (no env → no write).

import { createClient } from '@supabase/supabase-js';
import { slackPost } from '../slack/client.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ATRIUM_DIGEST_URL = 'https://atrium.unicron.systems/?tab=now#digest';

interface ScanEventData {
  digest_date?: string;
  channel_count?: number;
  message_count?: number;
  action_items_extracted?: number;
  decisions_extracted?: number;
  top_theme?: string;
}

interface ForDateRpcShape {
  digest_date: string;
  exists: boolean;
  digest?: {
    top_theme?: string | null;
    channel_count?: number;
    message_count?: number;
    action_items_extracted?: number;
    decisions_extracted?: number;
  };
  channels?: unknown[];
  decisions?: { content_summary?: string | null; content_full?: string | null }[];
  action_items?: {
    title?: string;
    requested_by?: { channel_name?: string } | null;
  }[];
}

export interface PostResult {
  status: 'posted' | 'skipped' | 'failed';
  reason?: string;
  channel?: string;
  ts?: string;
  digest_date?: string;
}

export async function postSlackDailyDigest(eventData: unknown): Promise<PostResult> {
  const channelId = process.env.SLACK_DAILY_DIGEST_CHANNEL_ID?.trim();
  if (!channelId) {
    return {
      status: 'skipped',
      reason: 'SLACK_DAILY_DIGEST_CHANNEL_ID not set — feature-flag gate',
    };
  }

  const data = (eventData ?? {}) as ScanEventData;
  const digestDate = data.digest_date ?? digestDateForToday();

  // Re-read from the RPC for the canonical join over channels + decisions +
  // action_items. The event payload only carries the rollup numbers.
  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    'ns_slack_daily_digest_for_date',
    { p_date: digestDate },
  );

  if (rpcErr) {
    console.error(`[slack-daily-digest-post] RPC failed: ${rpcErr.message}`);
    return { status: 'failed', reason: rpcErr.message, digest_date: digestDate };
  }

  const payload = rpcData as ForDateRpcShape;
  if (!payload?.exists) {
    return {
      status: 'skipped',
      reason: 'no digest row exists yet for this date',
      digest_date: digestDate,
    };
  }

  const blocks = buildBlocks(digestDate, payload);

  try {
    const res = await slackPost<{ ts?: string; channel?: string; ok?: boolean }>(
      'chat.postMessage',
      {
        channel: channelId,
        text: `Slack daily digest · ${digestDate}`, // fallback for notifications
        blocks,
        unfurl_links: false,
        unfurl_media: false,
      },
    );

    await appendAuditLog(digestDate, channelId, res.ts ?? null);

    return {
      status: 'posted',
      channel: res.channel ?? channelId,
      ts: res.ts,
      digest_date: digestDate,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[slack-daily-digest-post] post failed: ${reason}`);
    return { status: 'failed', reason, digest_date: digestDate, channel: channelId };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function digestDateForToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

interface BlockKitBlock {
  type: string;
  text?: { type: string; text: string };
  elements?: { type: string; text?: string; url?: string }[];
}

function buildBlocks(digestDate: string, p: ForDateRpcShape): BlockKitBlock[] {
  const d = p.digest ?? {};
  const topTheme = d.top_theme || 'No top theme synthesized.';
  const aiCount = d.action_items_extracted ?? 0;
  const dCount = d.decisions_extracted ?? 0;
  const channelCount = d.channel_count ?? 0;
  const msgCount = d.message_count ?? 0;

  const topAis = (p.action_items ?? []).slice(0, 3);
  const topDecs = (p.decisions ?? []).slice(0, 3);

  const blocks: BlockKitBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Slack daily digest · ${digestDate}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*${escapeMd(topTheme)}*` },
    },
  ];

  if (topAis.length > 0) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `*Top action items* _(${aiCount} total)_\n` +
            topAis
              .map((ai) => {
                const ch = ai.requested_by?.channel_name;
                return `• ${escapeMd(ai.title ?? 'untitled')}` + (ch ? ` _#${escapeMd(ch)}_` : '');
              })
              .join('\n'),
        },
      },
    );
  }

  if (topDecs.length > 0) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `*Top decisions* _(${dCount} total)_\n` +
            topDecs
              .map((dec) => {
                const summary = dec.content_summary ?? '(no summary)';
                let rationale: string | null = null;
                try {
                  const parsed = dec.content_full
                    ? (JSON.parse(dec.content_full) as { rationale?: string })
                    : null;
                  rationale = parsed?.rationale ?? null;
                } catch {
                  rationale = null;
                }
                return `• ${escapeMd(summary)}` + (rationale ? ` — _${escapeMd(rationale)}_` : '');
              })
              .join('\n'),
        },
      },
    );
  }

  blocks.push(
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text:
            `${channelCount} channels · ${msgCount} messages · ${aiCount} action items · ${dCount} decisions  ·  ` +
            `<${ATRIUM_DIGEST_URL}|Open in Atrium →>`,
        },
      ],
    },
  );

  return blocks;
}

// Slack mrkdwn requires escaping &, <, >.
function escapeMd(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function appendAuditLog(
  digestDate: string,
  channelId: string,
  postTs: string | null,
): Promise<void> {
  const { error } = await supabase.schema('nervous_system').from('audit_log').insert({
    table_name: 'slack_daily_digest',
    action: 'slack_daily_digest_posted',
    payload: { digest_date: digestDate, channel_id: channelId, post_ts: postTs },
  });
  if (error) {
    console.error(`[slack-daily-digest-post] audit_log append failed: ${error.message}`);
  }
}
