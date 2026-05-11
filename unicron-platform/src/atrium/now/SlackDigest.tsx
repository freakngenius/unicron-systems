// src/atrium/now/SlackDigest.tsx — Stream S3
//
// Renders the Slack daily-scan digest for a chosen date inside Atrium Now >
// Digest sub-tab. Reads from public.ns_slack_daily_digest_for_date(date) RPC
// shipped in S2's migration. Composes above the existing Analyst-vault
// digest so operators see the most action-bearing surface first.
//
// Empty states:
//   - Date < first scan or no row exists: friendly "First digest runs tomorrow"
//   - Today before 06:00 PT and no row yet: "Today's digest runs at 06:00 PT.
//     Yesterday's digest below." + auto-shifts the date picker back one day.
//
// Manual run: defers to the Skills tray entry "Run Slack Daily Scan"
// (see api/atrium/skills/run.ts case 'slack-daily-scan'). The component
// surfaces a "Run now →" link that scrolls / focuses the Skills tray.

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DigestRow {
  id: string;
  digest_date: string;
  top_theme: string | null;
  theme_confidence: number | null;
  channel_count: number;
  message_count: number;
  action_items_extracted: number;
  decisions_extracted: number;
  created_at: string;
  updated_at: string;
}

interface ChannelScanSummary {
  ledger_id: string;
  channel_id: string;
  content_summary: string | null;
  action_items: ExtractedActionItem[];
  decisions: ExtractedDecision[];
  insights: { sentiment?: string; key_topics?: string[] }[];
  created_at: string;
}

interface ExtractedActionItem {
  title?: string;
  owner_hint?: string | null;
  due_hint?: string | null;
  source_message_ts?: string | null;
}

interface ExtractedDecision {
  decision?: string;
  decided_by_hint?: string | null;
  rationale?: string | null;
  source_message_ts?: string | null;
}

interface DecisionLedgerRow {
  ledger_id: string;
  source_id: string;
  content_summary: string | null;
  content_full: string | null;
  created_at: string;
}

interface ActionItemRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  requested_by: { channel_id?: string; channel_name?: string; source_message_ts?: string } | null;
  requested_of: { hint?: string } | null;
  ledger_id: string | null;
  created_at: string;
}

interface DigestPayload {
  digest_date: string;
  exists: boolean;
  digest?: DigestRow;
  channels?: ChannelScanSummary[];
  decisions?: DecisionLedgerRow[];
  action_items?: ActionItemRow[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayInPT(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function ptHour(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    hour12: false,
  })
    .formatToParts(new Date())
    .find((p) => p.type === 'hour');
  return parts ? parseInt(parts.value, 10) : 0;
}

function shiftDate(iso: string, deltaDays: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function formatDisplayDate(iso: string): string {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Los_Angeles',
  });
}

function relativeLabel(iso: string): string {
  const today = todayInPT();
  if (iso === today) return 'Today';
  if (iso === shiftDate(today, -1)) return 'Yesterday';
  return formatDisplayDate(iso);
}

function channelDeepLink(channelId: string, ts?: string | null): string {
  return ts
    ? `slack://channel?id=${channelId}&message=${ts}`
    : `slack://channel?id=${channelId}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SlackDigest() {
  const today = todayInPT();
  const beforeSixPT = ptHour() < 6;
  // If it's before 06:00 PT, default to yesterday — today's run hasn't happened.
  const initialDate = beforeSixPT ? shiftDate(today, -1) : today;
  const [date, setDate] = useState(initialDate);
  const [payload, setPayload] = useState<DigestPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPayload(null);

    const supabase = getSupabase();
    supabase
      .rpc('ns_slack_daily_digest_for_date', { p_date: date })
      .then(({ data, error: e }) => {
        if (cancelled) return;
        if (e) {
          setError(e.message);
          setLoading(false);
          return;
        }
        setPayload((data as DigestPayload) ?? { digest_date: date, exists: false });
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [date]);

  const channelActivity = useMemo(() => {
    return (payload?.channels ?? []).map((c) => {
      const sentiment = c.insights?.[0]?.sentiment ?? 'neutral';
      const topics = c.insights?.[0]?.key_topics ?? [];
      const channelName = parseChannelNameFromSummary(c.content_summary);
      return { ...c, sentiment, topics, channelName };
    });
  }, [payload]);

  const exists = !!payload?.exists;
  const digest = payload?.digest;
  const decisions = payload?.decisions ?? [];
  const actionItems = payload?.action_items ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* ─── Header card ─── */}
      <div className="bg-bg-card border border-border-default rounded-xl px-5 py-5">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent)] font-semibold mb-1">
              Slack daily digest
            </div>
            <div className="mono text-[22px] font-medium text-text-primary leading-tight">
              {relativeLabel(date)}
            </div>
            <div className="mono text-[10px] text-text-muted mt-1.5">
              {formatDisplayDate(date)} ·{' '}
              {exists
                ? `${digest?.channel_count ?? 0} channels · ${digest?.message_count ?? 0} messages`
                : 'no scan yet'}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setDate(shiftDate(date, -1))}
              className="w-8 h-8 flex items-center justify-center bg-bg-raised border border-border-default rounded-lg mono text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors"
              aria-label="Previous day"
            >
              ←
            </button>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="bg-bg-raised border border-border-default rounded-lg px-2.5 py-1.5 mono text-[12px] text-text-primary focus:outline-none focus:border-border-hover"
            />
            <button
              onClick={() => setDate(shiftDate(date, +1))}
              disabled={date >= today}
              className="w-8 h-8 flex items-center justify-center bg-bg-raised border border-border-default rounded-lg mono text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next day"
            >
              →
            </button>
          </div>
        </div>

        {/* Top theme — large editorial */}
        {loading ? (
          <div className="space-y-2">
            <div className="h-4 w-3/4 bg-bg-raised rounded animate-pulse" />
            <div className="h-4 w-1/2 bg-bg-raised rounded animate-pulse" />
          </div>
        ) : error ? (
          <p className="mono text-[12px] text-[var(--danger)]">Failed to load digest: {error}</p>
        ) : exists && digest?.top_theme ? (
          <p className="text-[18px] text-text-primary leading-snug font-light">
            {digest.top_theme}
          </p>
        ) : (
          <EmptyHeadline date={date} today={today} beforeSixPT={beforeSixPT} />
        )}
      </div>

      {/* ─── Three columns: action items / decisions / channel activity ─── */}
      {!loading && exists && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DigestColumn
            title="Action items"
            count={actionItems.length}
            empty="No action items extracted"
          >
            {actionItems.map((ai) => (
              <ActionItemCard key={ai.id} item={ai} />
            ))}
          </DigestColumn>

          <DigestColumn
            title="Decisions"
            count={decisions.length}
            empty="No decisions logged"
          >
            {decisions.map((d) => (
              <DecisionCard key={d.ledger_id} decision={d} />
            ))}
          </DigestColumn>

          <DigestColumn
            title="Channel activity"
            count={channelActivity.length}
            empty="No bot-member channels active"
          >
            {channelActivity.map((c) => (
              <ChannelCard key={c.ledger_id} channel={c} />
            ))}
          </DigestColumn>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function EmptyHeadline({
  date,
  today,
  beforeSixPT,
}: {
  date: string;
  today: string;
  beforeSixPT: boolean;
}) {
  if (date === today && beforeSixPT) {
    return (
      <p className="mono text-[12px] text-text-muted">
        Today's digest runs at 06:00 PT. Yesterday's digest is shown above.
      </p>
    );
  }
  if (date === today) {
    return (
      <p className="mono text-[12px] text-text-muted">
        No digest exists yet for today. Run it on demand from the Skills tray
        → <span className="text-text-primary">Run Slack Daily Scan</span>.
      </p>
    );
  }
  return (
    <p className="mono text-[12px] text-text-muted">
      No digest exists for this date. The first digest runs at 06:00 PT after
      the bot is invited to operational channels (Stream S1).
    </p>
  );
}

function DigestColumn({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-bg-card border border-border-default rounded-xl px-4 py-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="mono text-[11px] font-semibold text-text-primary">{title}</div>
        <div className="mono text-[10px] text-text-muted">{count}</div>
      </div>
      {count === 0 ? (
        <div className="mono text-[11px] text-text-muted py-4 text-center">{empty}</div>
      ) : (
        <div className="flex flex-col gap-2">{children}</div>
      )}
    </div>
  );
}

function ActionItemCard({ item }: { item: ActionItemRow }) {
  const channel = item.requested_by?.channel_name;
  const ts = item.requested_by?.source_message_ts;
  const channelId = item.requested_by?.channel_id;
  const link = channelId ? channelDeepLink(channelId, ts ?? null) : null;
  return (
    <div className="bg-bg-raised border border-border-subtle rounded-lg px-3 py-2.5">
      <div className="mono text-[12px] text-text-primary leading-snug">{item.title}</div>
      <div className="flex items-center gap-2 flex-wrap mt-1.5">
        {channel && (
          <span className="mono text-[10px] text-text-muted">#{channel}</span>
        )}
        {item.requested_of?.hint && item.requested_of.hint !== 'unassigned' && (
          <span className="mono text-[10px] text-text-secondary">→ {item.requested_of.hint}</span>
        )}
        {item.priority && item.priority !== 'medium' && (
          <span className="mono text-[10px] uppercase tracking-wide text-[var(--accent)]">
            {item.priority}
          </span>
        )}
        {link && (
          <a
            href={link}
            className="mono text-[10px] text-text-muted hover:text-text-primary transition-colors ml-auto"
          >
            open in slack →
          </a>
        )}
      </div>
    </div>
  );
}

function DecisionCard({ decision }: { decision: DecisionLedgerRow }) {
  // source_id is "channel_id:ts" — peel apart for the deep link.
  const [channelId, ts] = (decision.source_id ?? '').split(':');
  const link = channelId ? channelDeepLink(channelId, ts && ts !== 'unknown' ? ts : null) : null;

  // content_full holds the structured payload — try to pull rationale.
  let rationale: string | null = null;
  let decidedBy: string | null = null;
  if (decision.content_full) {
    try {
      const parsed = JSON.parse(decision.content_full) as {
        rationale?: string | null;
        decided_by_hint?: string | null;
      };
      rationale = parsed.rationale ?? null;
      decidedBy = parsed.decided_by_hint ?? null;
    } catch {
      // ignore — content_full not parseable
    }
  }

  return (
    <div className="bg-bg-raised border border-border-subtle rounded-lg px-3 py-2.5">
      <div className="mono text-[12px] text-text-primary leading-snug">
        {decision.content_summary ?? '(no summary)'}
      </div>
      {rationale && (
        <div className="mono text-[11px] text-text-secondary leading-snug mt-1.5 italic">
          {rationale}
        </div>
      )}
      <div className="flex items-center gap-2 mt-1.5">
        {decidedBy && <span className="mono text-[10px] text-text-muted">— {decidedBy}</span>}
        {link && (
          <a
            href={link}
            className="mono text-[10px] text-text-muted hover:text-text-primary transition-colors ml-auto"
          >
            open in slack →
          </a>
        )}
      </div>
    </div>
  );
}

function ChannelCard({
  channel,
}: {
  channel: ChannelScanSummary & { sentiment: string; topics: string[]; channelName: string };
}) {
  const link = channelDeepLink(channel.channel_id);
  return (
    <div className="bg-bg-raised border border-border-subtle rounded-lg px-3 py-2.5">
      <div className="flex items-center justify-between mb-1">
        <a
          href={link}
          className="mono text-[12px] text-text-primary hover:text-[var(--accent)] transition-colors"
        >
          #{channel.channelName || 'unknown'}
        </a>
        <SentimentBadge sentiment={channel.sentiment} />
      </div>
      {channel.topics.length > 0 && (
        <div className="mono text-[10px] text-text-secondary leading-snug">
          {channel.topics.join(' · ')}
        </div>
      )}
    </div>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const color =
    sentiment === 'positive'
      ? 'text-[var(--success)]'
      : sentiment === 'concerned'
        ? 'text-[var(--warning)]'
        : 'text-text-muted';
  return (
    <span className={`mono text-[9px] uppercase tracking-wide ${color}`}>{sentiment}</span>
  );
}

// content_summary is "[#channel-name] theme sentence" — peel off the channel.
function parseChannelNameFromSummary(s: string | null): string {
  if (!s) return '';
  const match = s.match(/^\[#([^\]]+)\]/);
  return match ? match[1] : '';
}
