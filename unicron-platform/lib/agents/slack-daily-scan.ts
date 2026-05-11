// lib/agents/slack-daily-scan.ts — Stream S2
//
// Runs once per calendar day (06:00 PT cron via Inngest) — also event-triggerable.
// For every channel the orchestrator bot is a member of:
//   1. Pull the last 24h of messages.
//   2. Summarize with Haiku 4.5: theme, key topics, action items, decisions, sentiment.
//   3. Write a per-channel ledger row (source_type='slack_channel_scan').
//   4. Insert extracted action items into nervous_system.action_items linked
//      back to the channel-scan ledger row.
//   5. Insert each extracted decision as a separate ledger row
//      (source_type='decision', source_id='<channel_id>:<message_ts>').
// Then aggregates across channels:
//   6. Synthesize one company-wide top theme via Sonnet 4.6.
//   7. Upsert nervous_system.slack_daily_digest for the day (digest_date unique).
//   8. Append an audit_log entry (action='slack_daily_scan_complete') and
//      fire 'slack/daily-digest.posted' for the optional S4 post-back.
//
// Refusal-gate hooks (per existing patterns):
//   - slack-read pattern (bounded, audit-logged, scopes already granted via S1)
//   - llm-summarization pattern (cost-bounded per channel; Haiku cheap tier)
//   - action-item-create pattern (per-item validation: title required,
//     ledger_id present, ttl_days bounded)
//   - decision-write pattern (Elder-style ledger write)
//
// Idempotency: digest_date is unique on slack_daily_digest, so re-running the
// scan within the same day upserts the rollup. Per-channel ledger rows DO get
// re-inserted on re-run (we deliberately let history accumulate); the for_date
// RPC dedupes by created_at::date on read so the UI shows the latest scan
// only when the cron fires once per day as intended.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { slackPaginated, SlackApiError } from '../slack/client.js';
import { runMembershipAudit, type AuditedChannel } from '../slack/membership-audit.js';

const anthropic = new Anthropic();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Cheap tier — per-channel summarization runs N times per day at fan-out.
const SUMMARY_MODEL = 'claude-haiku-4-5';
// Single call across all channels — quality matters here for the "headline".
const THEME_MODEL = 'claude-sonnet-4-6';

const LOOKBACK_HOURS = 24;
const PER_CHANNEL_HISTORY_LIMIT = 500; // hard cap on messages we'll summarize per channel
const TRANSCRIPT_CHAR_CAP = 30_000;     // hard cap on characters fed to the LLM
const SUMMARY_MAX_TOKENS = 2_000;
const THEME_MAX_TOKENS = 200;
const ACTION_ITEM_TTL_DAYS = 30;

// ─── Types ──────────────────────────────────────────────────────────────────

interface SlackMessage {
  user?: string;
  text?: string;
  ts: string;
  bot_id?: string;
  subtype?: string;
}

interface SlackHistoryPage {
  ok: boolean;
  messages?: SlackMessage[];
  response_metadata?: { next_cursor?: string };
  has_more?: boolean;
  error?: string;
  [key: string]: unknown;
}

interface ExtractedActionItem {
  title: string;
  owner_hint?: string | null;
  due_hint?: string | null;
  source_message_ts?: string | null;
}

interface ExtractedDecision {
  decision: string;
  decided_by_hint?: string | null;
  rationale?: string | null;
  source_message_ts?: string | null;
}

interface PerChannelSummary {
  channel_theme: string;
  key_topics: string[];
  action_items: ExtractedActionItem[];
  decisions: ExtractedDecision[];
  sentiment: 'positive' | 'neutral' | 'concerned';
  message_count: number;
}

export interface SlackDailyScanResult {
  digest_date: string;
  channel_count: number;
  message_count: number;
  action_items_extracted: number;
  decisions_extracted: number;
  top_theme: string;
  channels_skipped_no_messages: number;
  channels_failed: { channel_id: string; channel_name: string; error: string }[];
}

// ─── Public entry point ─────────────────────────────────────────────────────

/**
 * Run a Slack daily scan. Idempotent at the day level (slack_daily_digest
 * upserts on digest_date).
 *
 * @param opts.date - YYYY-MM-DD digest date. Defaults to today (PT).
 * @param opts.dryRun - If true, no writes. Returns extraction counts only.
 */
export async function runSlackDailyScan(
  opts: { date?: string; dryRun?: boolean } = {},
): Promise<SlackDailyScanResult> {
  const digestDate = opts.date ?? digestDateForToday();
  const dryRun = !!opts.dryRun;

  // 1. Enumerate bot-member channels.
  const allChannels = await runMembershipAudit();
  const memberChannels = allChannels.filter((c) => c.is_bot_member && !c.is_archived);

  console.log(
    `[slack-daily-scan] digest_date=${digestDate} bot_member_channels=${memberChannels.length} dryRun=${dryRun}`,
  );

  // 2. Per-channel scan + summarize.
  const perChannel: {
    channel: AuditedChannel;
    summary: PerChannelSummary;
    ledger_id: string | null;
    raw_message_count: number;
  }[] = [];
  const channelsFailed: SlackDailyScanResult['channels_failed'] = [];
  let channelsSkipped = 0;
  let totalMessages = 0;

  for (const ch of memberChannels) {
    try {
      const messages = await fetchChannelMessages(ch.channel_id);
      if (messages.length === 0) {
        channelsSkipped++;
        continue;
      }
      totalMessages += messages.length;

      const summary = await summarizeChannel(ch.channel_name, messages);

      let ledgerId: string | null = null;
      if (!dryRun) {
        ledgerId = await insertChannelScanLedgerRow(ch, summary);
      }

      perChannel.push({
        channel: ch,
        summary,
        ledger_id: ledgerId,
        raw_message_count: messages.length,
      });
    } catch (err) {
      const message =
        err instanceof SlackApiError ? err.slackError : (err as Error).message ?? 'unknown';
      console.error(`[slack-daily-scan] channel=${ch.channel_name} failed: ${message}`);
      channelsFailed.push({
        channel_id: ch.channel_id,
        channel_name: ch.channel_name,
        error: message,
      });
    }
  }

  // 3. Insert action_items + decisions.
  let actionItemsCount = 0;
  let decisionsCount = 0;
  if (!dryRun) {
    for (const p of perChannel) {
      for (const ai of p.summary.action_items) {
        const ok = await insertActionItem(p.channel, p.ledger_id, ai);
        if (ok) actionItemsCount++;
      }
      for (const d of p.summary.decisions) {
        const ok = await insertDecisionLedgerRow(p.channel, d);
        if (ok) decisionsCount++;
      }
    }
  } else {
    actionItemsCount = perChannel.reduce((n, p) => n + p.summary.action_items.length, 0);
    decisionsCount = perChannel.reduce((n, p) => n + p.summary.decisions.length, 0);
  }

  // 4. Synthesize top theme.
  const topTheme = await synthesizeTopTheme(
    perChannel.map((p) => ({
      channel: p.channel.channel_name,
      theme: p.summary.channel_theme,
      topics: p.summary.key_topics,
    })),
  );

  // 5. Upsert daily digest + audit log.
  if (!dryRun) {
    await upsertDailyDigest({
      digest_date: digestDate,
      top_theme: topTheme,
      channel_count: perChannel.length,
      message_count: totalMessages,
      action_items_extracted: actionItemsCount,
      decisions_extracted: decisionsCount,
    });

    await appendAuditLog({
      digest_date: digestDate,
      channel_count: perChannel.length,
      message_count: totalMessages,
      action_items_extracted: actionItemsCount,
      decisions_extracted: decisionsCount,
      channels_failed: channelsFailed.length,
    });
  }

  return {
    digest_date: digestDate,
    channel_count: perChannel.length,
    message_count: totalMessages,
    action_items_extracted: actionItemsCount,
    decisions_extracted: decisionsCount,
    top_theme: topTheme,
    channels_skipped_no_messages: channelsSkipped,
    channels_failed: channelsFailed,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function digestDateForToday(): string {
  // PT-anchored: the cron runs at 06:00 PT, so "today" in PT = the digest date.
  // Compute via Intl rather than naive UTC.
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now); // YYYY-MM-DD
}

async function fetchChannelMessages(channelId: string): Promise<SlackMessage[]> {
  const oldest = (Date.now() / 1000 - LOOKBACK_HOURS * 3600).toFixed(6);
  const out: SlackMessage[] = [];
  for await (const page of slackPaginated<SlackHistoryPage>('conversations.history', {
    channel: channelId,
    oldest,
    limit: 200,
  })) {
    for (const m of page.messages ?? []) {
      // Skip channel-join/leave noise + bot messages (incl. our own posts).
      if (m.subtype === 'channel_join' || m.subtype === 'channel_leave') continue;
      if (m.bot_id) continue;
      out.push(m);
      if (out.length >= PER_CHANNEL_HISTORY_LIMIT) return out;
    }
  }
  return out;
}

async function summarizeChannel(
  channelName: string,
  messages: SlackMessage[],
): Promise<PerChannelSummary> {
  // Render oldest → newest so the LLM reads in temporal order.
  const ordered = [...messages].sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
  let transcript = ordered
    .map((m) => `[${m.ts}] ${m.user ?? '?'}: ${m.text ?? ''}`)
    .join('\n');
  if (transcript.length > TRANSCRIPT_CHAR_CAP) {
    // Keep the most recent N chars — recent context is more action-item-bearing.
    transcript = `… [truncated ${transcript.length - TRANSCRIPT_CHAR_CAP} chars] …\n` +
      transcript.slice(-TRANSCRIPT_CHAR_CAP);
  }

  const system = `You are summarizing a single Slack channel's last 24 hours for an internal company digest.

Return ONLY valid JSON matching this exact schema:
{
  "channel_theme": "single sentence describing the dominant topic",
  "key_topics": ["up to 3 short bullet phrases"],
  "action_items": [
    { "title": "imperative verb phrase, max 80 chars", "owner_hint": "name or null", "due_hint": "ISO date or relative phrase or null", "source_message_ts": "the ts of the message it came from" }
  ],
  "decisions": [
    { "decision": "single sentence stating the decision", "decided_by_hint": "name or null", "rationale": "one sentence why", "source_message_ts": "the ts of the message it came from" }
  ],
  "sentiment": "positive" | "neutral" | "concerned",
  "message_count": <int>
}

Rules:
- If the channel had no actionable content, return empty arrays for action_items and decisions.
- Do NOT invent action items or decisions. Only extract what is explicit in the transcript.
- "decision" means an explicit choice or commitment, not a passing comment.
- "action_item" means an explicit task someone said they/another would do.
- Return ONLY the JSON object. No prose, no code fences.`;

  const msg = await anthropic.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: SUMMARY_MAX_TOKENS,
    system,
    messages: [{ role: 'user', content: `Channel: #${channelName}\n\nTranscript:\n${transcript}` }],
  });

  const raw = msg.content[0]?.type === 'text' ? msg.content[0].text : '{}';
  const match = raw.match(/\{[\s\S]*\}/);
  const fallback: PerChannelSummary = {
    channel_theme: 'no parseable summary',
    key_topics: [],
    action_items: [],
    decisions: [],
    sentiment: 'neutral',
    message_count: messages.length,
  };
  if (!match) return fallback;

  try {
    const parsed = JSON.parse(match[0]) as Partial<PerChannelSummary> & {
      action_items?: unknown[];
      decisions?: unknown[];
    };
    return {
      channel_theme: typeof parsed.channel_theme === 'string' ? parsed.channel_theme : '',
      key_topics: Array.isArray(parsed.key_topics)
        ? parsed.key_topics.filter((t) => typeof t === 'string').slice(0, 3)
        : [],
      action_items: Array.isArray(parsed.action_items)
        ? parsed.action_items.map(coerceActionItem).filter((a): a is ExtractedActionItem => a !== null)
        : [],
      decisions: Array.isArray(parsed.decisions)
        ? parsed.decisions.map(coerceDecision).filter((d): d is ExtractedDecision => d !== null)
        : [],
      sentiment:
        parsed.sentiment === 'positive' || parsed.sentiment === 'concerned'
          ? parsed.sentiment
          : 'neutral',
      message_count:
        typeof parsed.message_count === 'number' && parsed.message_count >= 0
          ? parsed.message_count
          : messages.length,
    };
  } catch {
    return fallback;
  }
}

function coerceActionItem(raw: unknown): ExtractedActionItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === 'string' ? r.title.trim() : '';
  if (!title) return null;
  return {
    title: title.slice(0, 200),
    owner_hint: typeof r.owner_hint === 'string' ? r.owner_hint : null,
    due_hint: typeof r.due_hint === 'string' ? r.due_hint : null,
    source_message_ts:
      typeof r.source_message_ts === 'string' ? r.source_message_ts : null,
  };
}

function coerceDecision(raw: unknown): ExtractedDecision | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const decision = typeof r.decision === 'string' ? r.decision.trim() : '';
  if (!decision) return null;
  return {
    decision: decision.slice(0, 500),
    decided_by_hint: typeof r.decided_by_hint === 'string' ? r.decided_by_hint : null,
    rationale: typeof r.rationale === 'string' ? r.rationale : null,
    source_message_ts:
      typeof r.source_message_ts === 'string' ? r.source_message_ts : null,
  };
}

async function synthesizeTopTheme(
  perChannelHints: { channel: string; theme: string; topics: string[] }[],
): Promise<string> {
  if (perChannelHints.length === 0) {
    return 'No bot-member channel activity in the last 24 hours.';
  }

  const system = `You are the Unicron Analyst summarizing yesterday's company-wide Slack activity. Given per-channel themes, return ONE sentence (max 20 words) describing the company's dominant focus or signal.

Tone: tight, no fluff. Lead with the noun or topic. No "yesterday saw…" or "the team discussed…". Examples:
- Customer-zero pilot: Zedcor procurement timeline locked for next week.
- Connector framework: Slack + Teams + HubSpot bidirectional shipped to staging.
- Sprint 5 closeout: 6 cards verified, 2 in bug-fix loop.

Return only the sentence. No quotes, no preamble.`;

  const input = perChannelHints
    .map((p) => `#${p.channel}: ${p.theme}` + (p.topics.length ? ` [${p.topics.join('; ')}]` : ''))
    .join('\n');

  const msg = await anthropic.messages.create({
    model: THEME_MODEL,
    max_tokens: THEME_MAX_TOKENS,
    system,
    messages: [{ role: 'user', content: input }],
  });

  const text = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '';
  return text || 'Theme synthesis returned empty result.';
}

// ─── Persistence ────────────────────────────────────────────────────────────

async function insertChannelScanLedgerRow(
  ch: AuditedChannel,
  summary: PerChannelSummary,
): Promise<string | null> {
  const { data, error } = await supabase
    .schema('nervous_system')
    .from('ledger')
    .insert({
      source_type: 'slack_channel_scan',
      source_id: ch.channel_id,
      source_url: `slack://channel?id=${ch.channel_id}`,
      content_summary: `[#${ch.channel_name}] ${summary.channel_theme}`.slice(0, 500),
      content_full: JSON.stringify({
        channel_id: ch.channel_id,
        channel_name: ch.channel_name,
        ...summary,
      }),
      action_items: summary.action_items as unknown as object[],
      decisions: summary.decisions as unknown as object[],
      insights: [{ sentiment: summary.sentiment, key_topics: summary.key_topics }],
    })
    .select('id')
    .single();

  if (error) {
    console.error(`[slack-daily-scan] ledger insert failed channel=${ch.channel_name}: ${error.message}`);
    return null;
  }
  return data?.id ?? null;
}

async function insertActionItem(
  ch: AuditedChannel,
  ledgerId: string | null,
  ai: ExtractedActionItem,
): Promise<boolean> {
  const { error } = await supabase
    .schema('nervous_system')
    .from('action_items')
    .insert({
      title: ai.title,
      description: ai.owner_hint
        ? `Hint: assigned to ${ai.owner_hint}${ai.due_hint ? ` · due ${ai.due_hint}` : ''}`
        : ai.due_hint
          ? `Hint: due ${ai.due_hint}`
          : null,
      requested_by: {
        agent: 'slack-daily-scan',
        channel_id: ch.channel_id,
        channel_name: ch.channel_name,
        source_message_ts: ai.source_message_ts ?? null,
      },
      requested_of: { hint: ai.owner_hint || 'unassigned' },
      ledger_id: ledgerId,
      status: 'open',
      priority: 'medium',
      ttl_days: ACTION_ITEM_TTL_DAYS,
    });
  if (error) {
    console.error(`[slack-daily-scan] action_item insert failed: ${error.message}`);
    return false;
  }
  return true;
}

async function insertDecisionLedgerRow(
  ch: AuditedChannel,
  d: ExtractedDecision,
): Promise<boolean> {
  const sourceId = `${ch.channel_id}:${d.source_message_ts ?? 'unknown'}`;
  const { error } = await supabase
    .schema('nervous_system')
    .from('ledger')
    .insert({
      source_type: 'decision',
      source_id: sourceId,
      source_url: d.source_message_ts
        ? `slack://channel?id=${ch.channel_id}&message=${d.source_message_ts}`
        : `slack://channel?id=${ch.channel_id}`,
      content_summary: d.decision,
      content_full: JSON.stringify({
        channel_id: ch.channel_id,
        channel_name: ch.channel_name,
        decision: d.decision,
        decided_by_hint: d.decided_by_hint,
        rationale: d.rationale,
        source_message_ts: d.source_message_ts,
      }),
    });
  if (error) {
    console.error(`[slack-daily-scan] decision ledger insert failed: ${error.message}`);
    return false;
  }
  return true;
}

async function upsertDailyDigest(row: {
  digest_date: string;
  top_theme: string;
  channel_count: number;
  message_count: number;
  action_items_extracted: number;
  decisions_extracted: number;
}): Promise<void> {
  const { error } = await supabase
    .schema('nervous_system')
    .from('slack_daily_digest')
    .upsert(row, { onConflict: 'digest_date' });
  if (error) {
    console.error(`[slack-daily-scan] digest upsert failed: ${error.message}`);
  }
}

async function appendAuditLog(payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase
    .schema('nervous_system')
    .from('audit_log')
    .insert({
      table_name: 'slack_daily_digest',
      action: 'slack_daily_scan_complete',
      payload,
    });
  if (error) {
    console.error(`[slack-daily-scan] audit_log append failed: ${error.message}`);
  }
}
