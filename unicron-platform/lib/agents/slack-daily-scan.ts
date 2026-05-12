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
// ACTION_ITEM_TTL_DAYS lives inside the ns_slack_daily_scan_insert_action_item RPC
// (hardcoded to 30 there) — the JS-side constant became dead code after the
// RPC refactor and was removed.

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

interface ExtractedTakeaway {
  takeaway: string;
  primary_author?: string | null;
  source_message_ts?: string | null;
  /** Tag the LLM uses to score impact; used by the cross-channel selector. */
  impact?: 'milestone' | 'agreement' | 'customer' | 'thread' | 'other' | null;
}

interface PerChannelSummary {
  channel_theme: string;
  key_topics: string[];
  action_items: ExtractedActionItem[];
  decisions: ExtractedDecision[];
  takeaways: ExtractedTakeaway[];
  sentiment: 'positive' | 'neutral' | 'concerned';
  message_count: number;
}

/** Final cross-channel takeaway with author + permalink baked in for the UI. */
interface DigestTakeaway {
  takeaway: string;
  primary_author: string | null;
  channel_name: string;
  channel_id: string;
  source_message_ts: string | null;
  permalink: string | null;
  impact: ExtractedTakeaway['impact'];
}

export interface SlackDailyScanResult {
  digest_date: string;
  channel_count: number;
  message_count: number;
  action_items_extracted: number;
  decisions_extracted: number;
  top_theme: string;
  top_3_takeaways: DigestTakeaway[];
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
  // Item 5 of the Atrium usefulness pass (2026-05-12): respect
  // SCAN_EXCLUDE_CHANNELS (comma-separated channel IDs) so the bot can still
  // POST to #daily-digest without recursively scanning its own output.
  const allChannels = await runMembershipAudit();
  const excludeIds = new Set(
    (process.env.SCAN_EXCLUDE_CHANNELS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const memberChannels = allChannels.filter(
    (c) => c.is_bot_member && !c.is_archived && !excludeIds.has(c.channel_id),
  );
  const excludedCount = allChannels.filter(
    (c) => c.is_bot_member && !c.is_archived && excludeIds.has(c.channel_id),
  ).length;

  console.log(
    `[slack-daily-scan] digest_date=${digestDate} bot_member_channels=${memberChannels.length} excluded=${excludedCount} dryRun=${dryRun}`,
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

  // 4. Synthesize top theme + select top-3 cross-channel takeaways.
  const topTheme = await synthesizeTopTheme(
    perChannel.map((p) => ({
      channel: p.channel.channel_name,
      theme: p.summary.channel_theme,
      topics: p.summary.key_topics,
    })),
  );

  const top3Takeaways = await selectTop3Takeaways(
    perChannel.map((p) => ({
      channel_id: p.channel.channel_id,
      channel_name: p.channel.channel_name,
      takeaways: p.summary.takeaways,
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
      top_3_takeaways: top3Takeaways,
    });

    await appendAuditLog({
      digest_date: digestDate,
      channel_count: perChannel.length,
      message_count: totalMessages,
      action_items_extracted: actionItemsCount,
      decisions_extracted: decisionsCount,
      takeaways_selected: top3Takeaways.length,
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
    top_3_takeaways: top3Takeaways,
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

  const system = `You are summarizing a single Slack channel's last 24 hours for an internal company digest. Better empty than noisy.

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
  "takeaways": [
    { "takeaway": "single sentence stating the most-impactful fact / agreement / customer info / new thread from this channel today", "primary_author": "name or null", "source_message_ts": "ts of the source message", "impact": "milestone | agreement | customer | thread | other" }
  ],
  "sentiment": "positive" | "neutral" | "concerned",
  "message_count": <int>
}

Strict extraction rules — better empty than noisy:
- action_items: ONLY explicit commitments. "I'll do X by Y", "@person can you handle Z", "Will draft this tonight". NOT vague intentions like "we should think about" or "maybe someone could".
- decisions: ONLY explicit decisions or agreements. "We'll go with option B", "let's lock pricing at X", "Approved". NOT discussion or proposal exploration.
- takeaways: the up-to-3 most-impactful items from the channel today. Mix of milestone facts ("LOI signed"), agreements ("pricing locked at $X"), customer info ("Zedcor wants Q3 expansion"), or new threads ("started outbound to construction adjacencies"). Skip if the channel had no signal worth surfacing.
- Each item MUST cite the exact source_message_ts from the transcript header so we can deep-link back. If you can't cite a ts, omit the item.
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
    takeaways: [],
    sentiment: 'neutral',
    message_count: messages.length,
  };
  if (!match) return fallback;

  try {
    const parsed = JSON.parse(match[0]) as Partial<PerChannelSummary> & {
      action_items?: unknown[];
      decisions?: unknown[];
      takeaways?: unknown[];
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
      takeaways: Array.isArray(parsed.takeaways)
        ? parsed.takeaways.map(coerceTakeaway).filter((t): t is ExtractedTakeaway => t !== null).slice(0, 3)
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

function coerceTakeaway(raw: unknown): ExtractedTakeaway | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const takeaway = typeof r.takeaway === 'string' ? r.takeaway.trim() : '';
  if (!takeaway) return null;
  const allowedImpacts = new Set(['milestone', 'agreement', 'customer', 'thread', 'other']);
  const impactRaw = typeof r.impact === 'string' ? r.impact : null;
  return {
    takeaway: takeaway.slice(0, 280),
    primary_author: typeof r.primary_author === 'string' ? r.primary_author : null,
    source_message_ts:
      typeof r.source_message_ts === 'string' ? r.source_message_ts : null,
    impact: impactRaw && allowedImpacts.has(impactRaw)
      ? (impactRaw as ExtractedTakeaway['impact'])
      : 'other',
  };
}

/**
 * Cross-channel selector: picks the 3 most-impactful takeaways across all
 * scanned channels, biased toward variety (no two from the same channel
 * unless the candidate pool is too small) and impact tag (milestone +
 * agreement + customer rank above thread + other).
 *
 * Builds Slack permalinks server-side so the UI doesn't need workspace info.
 * If permalink build fails (no SLACK_WORKSPACE_DOMAIN env), falls back to a
 * slack:// channel deep link.
 */
async function selectTop3Takeaways(
  perChannel: { channel_id: string; channel_name: string; takeaways: ExtractedTakeaway[] }[],
): Promise<DigestTakeaway[]> {
  // Flatten + score by impact rank, preserving channel attribution.
  const impactRank: Record<string, number> = {
    milestone: 0,
    agreement: 1,
    customer: 2,
    thread: 3,
    other: 4,
  };
  type Candidate = DigestTakeaway & { _rank: number };
  const all: Candidate[] = [];
  for (const ch of perChannel) {
    for (const t of ch.takeaways) {
      all.push({
        takeaway: t.takeaway,
        primary_author: t.primary_author ?? null,
        channel_name: ch.channel_name,
        channel_id: ch.channel_id,
        source_message_ts: t.source_message_ts ?? null,
        permalink: buildSlackPermalink(ch.channel_id, t.source_message_ts ?? null),
        impact: t.impact ?? 'other',
        _rank: impactRank[t.impact ?? 'other'] ?? 4,
      });
    }
  }
  all.sort((a, b) => a._rank - b._rank);

  // Variety pass: prefer not-yet-represented channels until we hit 3.
  const picked: Candidate[] = [];
  const seenChannels = new Set<string>();
  for (const c of all) {
    if (picked.length >= 3) break;
    if (seenChannels.has(c.channel_id)) continue;
    picked.push(c);
    seenChannels.add(c.channel_id);
  }
  // Backfill if we couldn't fill 3 with distinct channels.
  if (picked.length < 3) {
    for (const c of all) {
      if (picked.length >= 3) break;
      if (picked.includes(c)) continue;
      picked.push(c);
    }
  }
  return picked.map(({ _rank, ...rest }) => rest);
}

/**
 * Build a Slack message permalink.
 *   https://<workspace>.slack.com/archives/<channel_id>/p<ts_no_dots>
 * Requires SLACK_WORKSPACE_DOMAIN env (e.g. "unicron-systems"). Falls back to
 * a slack:// channel deep link if the env isn't set or ts is missing — better
 * than a broken https:// link.
 */
function buildSlackPermalink(channelId: string, ts: string | null): string | null {
  if (!ts) return `slack://channel?id=${channelId}`;
  const workspace = process.env.SLACK_WORKSPACE_DOMAIN?.trim();
  if (!workspace) return `slack://channel?id=${channelId}`;
  const tsNoDots = ts.replace('.', '');
  return `https://${workspace}.slack.com/archives/${channelId}/p${tsNoDots}`;
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
//
// IMPORTANT: PostgREST only exposes the `public` schema in this project, so
// `.schema('nervous_system')` calls return PGRST106 silently. All writes go
// through SECURITY DEFINER RPCs in the public schema (migration
// 20260511_slack_daily_scan_rpcs.sql). The RPCs do the actual cross-schema
// INSERT with service-role bypassing RLS.

async function insertChannelScanLedgerRow(
  ch: AuditedChannel,
  summary: PerChannelSummary,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('ns_slack_daily_scan_insert_channel_ledger', {
    p_channel_id: ch.channel_id,
    p_channel_name: ch.channel_name,
    p_content_summary: `[#${ch.channel_name}] ${summary.channel_theme}`.slice(0, 500),
    p_content_full: JSON.stringify({
      channel_id: ch.channel_id,
      channel_name: ch.channel_name,
      ...summary,
    }),
    p_action_items: summary.action_items as unknown as object[],
    p_decisions: summary.decisions as unknown as object[],
    p_insights: [{ sentiment: summary.sentiment, key_topics: summary.key_topics }],
  });
  if (error) {
    console.error(
      `[slack-daily-scan] ledger insert failed channel=${ch.channel_name}: ${error.message}`,
    );
    return null;
  }
  return (data as string | null) ?? null;
}

async function insertActionItem(
  ch: AuditedChannel,
  ledgerId: string | null,
  ai: ExtractedActionItem,
): Promise<boolean> {
  const { error } = await supabase.rpc('ns_slack_daily_scan_insert_action_item', {
    p_channel_id: ch.channel_id,
    p_channel_name: ch.channel_name,
    p_ledger_id: ledgerId,
    p_title: ai.title,
    p_owner_hint: ai.owner_hint ?? null,
    p_due_hint: ai.due_hint ?? null,
    p_source_message_ts: ai.source_message_ts ?? null,
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
  const { error } = await supabase.rpc('ns_slack_daily_scan_insert_decision', {
    p_channel_id: ch.channel_id,
    p_channel_name: ch.channel_name,
    p_decision: d.decision,
    p_decided_by_hint: d.decided_by_hint ?? null,
    p_rationale: d.rationale ?? null,
    p_source_message_ts: d.source_message_ts ?? null,
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
  top_3_takeaways: DigestTakeaway[];
}): Promise<void> {
  const { error } = await supabase.rpc('ns_slack_daily_scan_upsert_digest', {
    p_digest_date: row.digest_date,
    p_top_theme: row.top_theme,
    p_channel_count: row.channel_count,
    p_message_count: row.message_count,
    p_action_items_extracted: row.action_items_extracted,
    p_decisions_extracted: row.decisions_extracted,
    p_top_3_takeaways: row.top_3_takeaways as unknown as object[],
  });
  if (error) {
    console.error(`[slack-daily-scan] digest upsert failed: ${error.message}`);
  }
}

async function appendAuditLog(payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc('ns_audit_log_append', {
    p_table_name: 'slack_daily_digest',
    p_action: 'slack_daily_scan_complete',
    p_payload: payload,
  });
  if (error) {
    console.error(`[slack-daily-scan] audit_log append failed: ${error.message}`);
  }
}
