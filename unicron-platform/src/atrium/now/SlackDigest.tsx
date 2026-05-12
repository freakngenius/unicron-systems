// src/atrium/now/SlackDigest.tsx — Stream S3 + extraction/display fix
//
// Renders the Slack daily-scan digest for a chosen date inside Atrium Now >
// Digest sub-tab. Reads from public.ns_slack_daily_digest_for_date(date) RPC.
//
// Redesign (fix branch): replaces the single-line top_theme with a "Top 3
// takeaways" panel — three editorial bullets with author + channel + Slack
// permalink. A Read More button opens a modal showing all takeaways, every
// extracted action item, every decision, and per-channel activity, each row
// hyperlinked back to Slack via permalink.
//
// Permalink strategy: takeaway rows carry a server-built permalink (built in
// lib/agents/slack-daily-scan.ts using SLACK_WORKSPACE_DOMAIN env). Action
// items and decisions reconstruct permalinks client-side using the same env
// surfaced as VITE_SLACK_WORKSPACE_DOMAIN, falling back to slack:// channel
// deep links when the env is unset.
//
// Empty states:
//   - Today before 06:00 PT: "Today's digest runs at 06:00 PT. Yesterday's
//     digest is shown above." (component auto-shifts initial date back).
//   - Today after, no row yet: prompts the Skills tray button.
//   - Past date no row: explains the cron schedule + S1 invite gate.
//   - exists && action_items_extracted=0 && channel_count>0: "No action items
//     extracted from N channels today. This is honest if the day had no
//     action-creating conversations, OR a sign extraction missed something.
//     Check System > Audit log for slack-daily-scan run details."

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DigestTakeaway {
  takeaway: string;
  primary_author: string | null;
  channel_name: string;
  channel_id: string;
  source_message_ts: string | null;
  permalink: string | null;
  impact: 'milestone' | 'agreement' | 'customer' | 'thread' | 'other' | null;
}

interface DigestRow {
  id: string;
  digest_date: string;
  top_theme: string | null;
  theme_confidence: number | null;
  channel_count: number;
  message_count: number;
  action_items_extracted: number;
  decisions_extracted: number;
  top_3_takeaways: DigestTakeaway[] | null;
  created_at: string;
  updated_at: string;
}

interface ChannelScanSummary {
  ledger_id: string;
  channel_id: string;
  content_summary: string | null;
  action_items: ExtractedActionItemPayload[];
  decisions: ExtractedDecisionPayload[];
  insights: { sentiment?: string; key_topics?: string[] }[];
  created_at: string;
}

interface ExtractedActionItemPayload {
  title?: string;
  owner_hint?: string | null;
  due_hint?: string | null;
  source_message_ts?: string | null;
}

interface ExtractedDecisionPayload {
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
  requested_by: {
    channel_id?: string;
    channel_name?: string;
    source_message_ts?: string;
  } | null;
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

// ─── Date / time helpers ────────────────────────────────────────────────────

function todayInPT(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function ptHour(): number {
  const part = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    hour12: false,
  })
    .formatToParts(new Date())
    .find((p) => p.type === 'hour');
  return part ? parseInt(part.value, 10) : 0;
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

// ─── Permalink helpers ──────────────────────────────────────────────────────

const WORKSPACE_DOMAIN =
  (import.meta.env?.VITE_SLACK_WORKSPACE_DOMAIN as string | undefined)?.trim() ?? '';

function buildPermalink(channelId: string, ts?: string | null): string {
  if (!ts) return `slack://channel?id=${channelId}`;
  if (!WORKSPACE_DOMAIN) return `slack://channel?id=${channelId}`;
  const tsNoDots = ts.replace('.', '');
  return `https://${WORKSPACE_DOMAIN}.slack.com/archives/${channelId}/p${tsNoDots}`;
}

function parseChannelNameFromSummary(s: string | null): string {
  if (!s) return '';
  const m = s.match(/^\[#([^\]]+)\]/);
  return m ? m[1] : '';
}

// ─── Component ──────────────────────────────────────────────────────────────

interface SlackDigestProps {
  /**
   * Optional — when omitted, the component owns its own date state (legacy
   * standalone usage). When provided, the component is controlled by the
   * page-level picker in DigestTab and renders no internal date nav.
   */
  date?: string;
}

export function SlackDigest({ date: dateProp }: SlackDigestProps = {}) {
  const today = todayInPT();
  const beforeSixPT = ptHour() < 6;
  const initialDate = beforeSixPT ? shiftDate(today, -1) : today;
  const [internalDate, setInternalDate] = useState(initialDate);
  const date = dateProp ?? internalDate;
  const setDate = setInternalDate;
  const controlled = dateProp !== undefined;
  const [payload, setPayload] = useState<DigestPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

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

  // Item 6 of the Atrium usefulness pass — show only channels with real
  // activity (message_count>0 OR non-empty key_topics). Sort positive sentiment
  // first, then neutral-with-content, then by message_count desc. Skipped
  // channels are revealed via a "Show all (N hidden)" toggle.
  const allChannelActivity = useMemo(() => {
    return (payload?.channels ?? []).map((c) => {
      const sentiment = c.insights?.[0]?.sentiment ?? 'neutral';
      const topics = c.insights?.[0]?.key_topics ?? [];
      const channelName = parseChannelNameFromSummary(c.content_summary);
      return { ...c, sentiment, topics, channelName };
    });
  }, [payload]);

  const [showAllChannels, setShowAllChannels] = useState(false);

  const channelActivity = useMemo(() => {
    if (showAllChannels) return allChannelActivity;
    return allChannelActivity.filter((c) => (c.message_count ?? 0) > 0 || c.topics.length > 0);
  }, [allChannelActivity, showAllChannels]);

  const sortedChannelActivity = useMemo(() => {
    return [...channelActivity].sort((a, b) => {
      const aS = a.sentiment === 'positive' ? 0 : (a.topics.length > 0 ? 1 : 2);
      const bS = b.sentiment === 'positive' ? 0 : (b.topics.length > 0 ? 1 : 2);
      if (aS !== bS) return aS - bS;
      return (b.message_count ?? 0) - (a.message_count ?? 0);
    });
  }, [channelActivity]);

  const hiddenChannelCount = allChannelActivity.length - channelActivity.length;

  const exists = !!payload?.exists;
  const digest = payload?.digest;
  const decisions = payload?.decisions ?? [];
  const actionItems = payload?.action_items ?? [];
  const takeaways = digest?.top_3_takeaways ?? [];

  const showSilentDayHint =
    exists &&
    (digest?.action_items_extracted ?? 0) === 0 &&
    (digest?.channel_count ?? 0) > 0;

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* ─── Header card ─── */}
        <div className="bg-bg-card border border-border-default rounded-xl px-5 py-5">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-3">
            <div>
              <div className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent)] font-semibold mb-1">
                Slack daily digest
              </div>
              <div className="mono text-[10px] text-text-muted">
                {exists
                  ? `${digest?.channel_count ?? 0} channels · ${digest?.message_count ?? 0} messages`
                  : 'no scan yet'}
              </div>
            </div>

            {/* Internal date picker — only when uncontrolled (no `date` prop). */}
            {!controlled && (
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
            )}
          </div>

          {/* Top theme — small subtitle */}
          {loading ? (
            <div className="space-y-2">
              <div className="h-3 w-3/4 bg-bg-raised rounded animate-pulse" />
              <div className="h-3 w-1/2 bg-bg-raised rounded animate-pulse" />
            </div>
          ) : error ? (
            <p className="mono text-[12px] text-[var(--danger)]">Failed to load digest: {error}</p>
          ) : exists && digest?.top_theme ? (
            <p className="mono text-[12px] text-text-secondary leading-snug italic">
              {digest.top_theme}
            </p>
          ) : (
            <EmptyHeadline date={date} today={today} beforeSixPT={beforeSixPT} />
          )}
        </div>

        {/* ─── Top 3 takeaways panel ─── */}
        {!loading && exists && takeaways.length > 0 && (
          <div className="bg-bg-card border border-border-default rounded-xl px-5 py-5 relative">
            <div className="flex items-center justify-between mb-4">
              <div className="mono text-[10px] uppercase tracking-[0.18em] text-text-secondary font-semibold">
                Top 3 takeaways
              </div>
              <button
                onClick={() => setModalOpen(true)}
                className="mono text-[11px] text-[var(--accent)] hover:opacity-80 transition-opacity"
              >
                Read more →
              </button>
            </div>
            <ol className="flex flex-col gap-3">
              {takeaways.map((t, i) => (
                <TakeawayRow key={i} takeaway={t} index={i + 1} />
              ))}
            </ol>
          </div>
        )}

        {/* ─── Silent-day honesty banner ─── */}
        {!loading && exists && showSilentDayHint && (
          <div className="bg-bg-raised border border-border-subtle rounded-lg px-4 py-3">
            <div className="mono text-[11px] text-text-secondary leading-relaxed">
              No action items extracted from {digest?.channel_count ?? 0} channels today. This is
              honest if the day had no action-creating conversations, OR a sign the extraction
              pipeline missed something.{' '}
              <span className="text-text-muted">
                Check System &rsaquo; Audit log for slack-daily-scan run details.
              </span>
            </div>
          </div>
        )}

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
              count={sortedChannelActivity.length}
              empty={`No channel activity for ${date}.`}
            >
              {sortedChannelActivity.map((c) => (
                <ChannelCard key={c.ledger_id} channel={c} />
              ))}
              {hiddenChannelCount > 0 && (
                <button
                  onClick={() => setShowAllChannels((v) => !v)}
                  className="mono text-[10px] text-text-secondary hover:text-text-primary underline-offset-2 hover:underline pt-1"
                >
                  {showAllChannels ? 'Hide silent channels' : `Show all (${hiddenChannelCount} hidden)`}
                </button>
              )}
            </DigestColumn>
          </div>
        )}
      </div>

      {/* ─── Read More modal ─── */}
      {modalOpen && payload?.digest && (
        <ReadMoreModal
          date={date}
          digest={payload.digest}
          channels={channelActivity}
          decisions={decisions}
          actionItems={actionItems}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
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

function TakeawayRow({ takeaway, index }: { takeaway: DigestTakeaway; index: number }) {
  const link = takeaway.permalink ?? buildPermalink(takeaway.channel_id, takeaway.source_message_ts);
  return (
    <li className="flex gap-3">
      <div className="mono text-[14px] text-text-muted font-mono w-5 shrink-0 pt-0.5">{index}.</div>
      <div className="flex-1 min-w-0">
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="block text-[15px] leading-snug text-text-primary hover:text-[var(--accent)] transition-colors"
        >
          {takeaway.takeaway}
        </a>
        <div className="flex items-center gap-2 flex-wrap mt-1.5">
          {takeaway.primary_author && (
            <span className="mono text-[10px] text-text-secondary">{takeaway.primary_author}</span>
          )}
          <span className="mono text-[10px] text-text-muted">#{takeaway.channel_name}</span>
          {takeaway.impact && takeaway.impact !== 'other' && (
            <span className="mono text-[9px] uppercase tracking-wide text-[var(--accent)]">
              {takeaway.impact}
            </span>
          )}
        </div>
      </div>
    </li>
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
  const channelId = item.requested_by?.channel_id;
  const ts = item.requested_by?.source_message_ts;
  const link = channelId ? buildPermalink(channelId, ts) : null;

  // Item 5 of the Atrium usefulness pass — checkbox marks done via Pathfinder
  // PATCH endpoint. Optimistic UI, error rolls back.
  const [done, setDone] = useState(item.status === 'done');
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (pending || done) return;
    setPending(true);
    setErr(null);
    setDone(true); // optimistic
    try {
      const { patchActionItem } = await import('../../lib/actionItemsClient');
      await patchActionItem(item.id, { closed: true, status: 'done' });
    } catch (e2) {
      setDone(false);
      setErr(e2 instanceof Error ? e2.message : 'failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="bg-bg-raised border border-border-subtle rounded-lg px-3 py-2.5">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={handleToggle}
          disabled={pending || done}
          aria-label={done ? 'Action item complete' : 'Mark action item as done'}
          className={`mt-0.5 shrink-0 w-4 h-4 rounded border transition-colors ${
            done
              ? 'bg-[#2E8E66] border-[#2E8E66]'
              : 'bg-transparent border-border-default hover:border-text-secondary'
          }`}
        >
          {done && (
            <span className="block text-white text-[10px] leading-none">✓</span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className={`block mono text-[12px] leading-snug hover:text-[var(--accent)] transition-colors ${
                done ? 'line-through text-text-muted' : 'text-text-primary'
              }`}
            >
              {item.title}
            </a>
          ) : (
            <div
              className={`mono text-[12px] leading-snug ${
                done ? 'line-through text-text-muted' : 'text-text-primary'
              }`}
            >
              {item.title}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            {channel && <span className="mono text-[10px] text-text-muted">#{channel}</span>}
            {item.requested_of?.hint && item.requested_of.hint !== 'unassigned' && (
              <span className="mono text-[10px] text-text-secondary">→ {item.requested_of.hint}</span>
            )}
            {item.priority && item.priority !== 'medium' && (
              <span className="mono text-[10px] uppercase tracking-wide text-[var(--accent)]">
                {item.priority}
              </span>
            )}
            {err && <span className="mono text-[10px] text-[#E14B4B]">{err}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function DecisionCard({ decision }: { decision: DecisionLedgerRow }) {
  const [channelId, ts] = (decision.source_id ?? '').split(':');
  const link = channelId
    ? buildPermalink(channelId, ts && ts !== 'unknown' ? ts : null)
    : null;

  let rationale: string | null = null;
  let decidedBy: string | null = null;
  let channelName: string | null = null;
  if (decision.content_full) {
    try {
      const parsed = JSON.parse(decision.content_full) as {
        rationale?: string | null;
        decided_by_hint?: string | null;
        channel_name?: string | null;
      };
      rationale = parsed.rationale ?? null;
      decidedBy = parsed.decided_by_hint ?? null;
      channelName = parsed.channel_name ?? null;
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="bg-bg-raised border border-border-subtle rounded-lg px-3 py-2.5">
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="block mono text-[12px] text-text-primary leading-snug hover:text-[var(--accent)] transition-colors"
        >
          {decision.content_summary ?? '(no summary)'}
        </a>
      ) : (
        <div className="mono text-[12px] text-text-primary leading-snug">
          {decision.content_summary ?? '(no summary)'}
        </div>
      )}
      {rationale && (
        <div className="mono text-[11px] text-text-secondary leading-snug mt-1.5 italic">
          {rationale}
        </div>
      )}
      <div className="flex items-center gap-2 mt-1.5">
        {decidedBy && <span className="mono text-[10px] text-text-muted">— {decidedBy}</span>}
        {channelName && (
          <span className="mono text-[10px] text-text-muted">#{channelName}</span>
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
  const link = buildPermalink(channel.channel_id);
  return (
    <div className="bg-bg-raised border border-border-subtle rounded-lg px-3 py-2.5">
      <div className="flex items-center justify-between mb-1">
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
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

// ─── Read More modal ────────────────────────────────────────────────────────

function ReadMoreModal({
  date,
  digest,
  channels,
  decisions,
  actionItems,
  onClose,
}: {
  date: string;
  digest: DigestRow;
  channels: (ChannelScanSummary & { sentiment: string; topics: string[]; channelName: string })[];
  decisions: DecisionLedgerRow[];
  actionItems: ActionItemRow[];
  onClose: () => void;
}) {
  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const takeaways = digest.top_3_takeaways ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 py-8 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-bg-card border border-border-default rounded-xl max-w-3xl w-full px-6 py-6 my-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent)] font-semibold mb-1">
              Slack digest details
            </div>
            <div className="mono text-[16px] text-text-primary">{relativeLabel(date)}</div>
            <div className="mono text-[10px] text-text-muted mt-1">{formatDisplayDate(date)}</div>
          </div>
          <button
            onClick={onClose}
            className="mono text-[14px] text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {digest.top_theme && (
          <div className="mb-5">
            <div className="mono text-[9px] uppercase tracking-wide text-text-muted mb-1">
              Top theme
            </div>
            <p className="mono text-[12px] text-text-primary leading-snug italic">
              {digest.top_theme}
            </p>
          </div>
        )}

        {takeaways.length > 0 && (
          <ModalSection title={`Top takeaways (${takeaways.length})`}>
            <ol className="flex flex-col gap-2.5">
              {takeaways.map((t, i) => (
                <TakeawayRow key={i} takeaway={t} index={i + 1} />
              ))}
            </ol>
          </ModalSection>
        )}

        <ModalSection title={`Action items (${actionItems.length})`}>
          {actionItems.length === 0 ? (
            <div className="mono text-[11px] text-text-muted">None extracted today.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {actionItems.map((ai) => (
                <ActionItemCard key={ai.id} item={ai} />
              ))}
            </div>
          )}
        </ModalSection>

        <ModalSection title={`Decisions (${decisions.length})`}>
          {decisions.length === 0 ? (
            <div className="mono text-[11px] text-text-muted">None logged today.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {decisions.map((d) => (
                <DecisionCard key={d.ledger_id} decision={d} />
              ))}
            </div>
          )}
        </ModalSection>

        <ModalSection title={`Channel activity (${channels.length})`}>
          {channels.length === 0 ? (
            <div className="mono text-[11px] text-text-muted">No bot-member channel activity.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {channels.map((c) => (
                <ChannelCard key={c.ledger_id} channel={c} />
              ))}
            </div>
          )}
        </ModalSection>

        <div className="flex justify-end mt-5">
          <button
            onClick={onClose}
            className="mono text-[12px] text-text-secondary hover:text-text-primary transition-colors px-3 py-1.5 border border-border-default rounded-lg hover:border-border-hover"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mono text-[9px] uppercase tracking-wide text-text-muted mb-2">{title}</div>
      {children}
    </div>
  );
}
