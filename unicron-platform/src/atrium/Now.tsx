// Atrium Now tab.
//
// Today sub-tab (editorial pass 2026-05-11): action-driving default.
// Left column = greeting + "What needs you today" (TopOfMind, irreversible+high
// for the signed-in DRI). Right rail = three real metric cards (Open items,
// Refusals 24h, Decisions 7d) + Items-created-7d chart + Agent LLM spend
// (if real) + RecentActivityFeed (gated to last-60s events).
//
// Cuts: HeroStrip ("company is calm"), YesterdayDigest (Digest sub-tab owns
// it), Ingest yield sidebar, Calendar placeholder (returns when per-user
// OAuth ships), "Listening for activity" placeholder.

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type KeyboardEvent,
  type FormEvent,
} from 'react';
import { getSupabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { QuickCapture } from './QuickCapture';
import { AtriumIcon } from './icons';
import { SlackDigest } from './now/SlackDigest';
import { navigateAtrium } from './navigation';
// Pass 2 (R1): AttentionScorer cut — was hand-rolled scoring across mixed
// sources. TopOfMind now wires to ns_top_of_mind_for_dri RPC (real data).

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SkillRow {
  id: string;
  name: string;
  description: string;
  domain: string;
  active: boolean;
  refusal_gate: boolean;
  status?: 'active' | 'scaffolded' | 'deprecated' | null;
  run_endpoint?: string | null;
  execution?: 'api' | 'agentic' | 'ui_trigger' | 'scheduled' | null;
  config?: { ui_trigger?: boolean } | null;
  last_run_at?: string | null;
  total_runs?: number | null;
}

interface FeedEvent {
  id: string;
  source_type: string;
  content_summary: string | null;
  created_at: string;
  count: number;
  table: 'ledger' | 'audit_log';
}

type NowTab = 'skills' | 'today' | 'activity' | 'digest';
type Timeframe = '1h' | '24h' | '7d' | 'custom';

// ─── Constants ────────────────────────────────────────────────────────────────

// Sprint 4 upgrade: throttle 2s, dedupe 30s
const THROTTLE_MS = 2_000;
const DEDUPE_WINDOW_MS = 30_000;
const FEED_MAX = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function greeting(name: string): string {
  const h = new Date().getHours();
  if (h < 12) return `Good morning, ${name}.`;
  if (h < 17) return `Good afternoon, ${name}.`;
  return `Good evening, ${name}.`;
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function useLocalTime() {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  );
  useEffect(() => {
    const id = setInterval(() => {
      setTime(
        new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      );
    }, 10_000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── TopOfMind — Pass 2 (R1): wired to ns_top_of_mind_for_dri ─────────────────
// SLOT: TopOfMind · STATUS: real · SOURCE: ns_top_of_mind_for_dri(p_dri) RPC
// Shows the signed-in user's open irreversible+high action items, top 5.

interface TopOfMindItem {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  due_at: string | null;
  created_at: string;
}

const PRIORITY_COLOR: Record<string, string> = {
  irreversible: '#E14B4B',
  high:         '#C28A1F',
  medium:       '#6081BE',
  low:          '#7E8AA3',
};

function useTopOfMind(teamMemberId: string | null) {
  const [items, setItems] = useState<TopOfMindItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!teamMemberId) {
      setItems([]);
      setLoading(false);
      return () => { cancelled = true; };
    }
    getSupabase()
      .rpc('ns_top_of_mind_for_dri', { p_dri: teamMemberId })
      .then(({ data }) => {
        if (cancelled) return;
        setItems((data as TopOfMindItem[] | null) ?? []);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [teamMemberId]);

  return { items, loading };
}

// Hook: total open action items where the signed-in user is DRI. Powers
// TopOfMind's honest empty state ("N items" deep link to Work > Items).
function useOpenItemsForDri(teamMemberId: string | null) {
  const [total, setTotal] = useState<number | null>(teamMemberId ? null : 0);
  useEffect(() => {
    if (!teamMemberId) return;
    let cancelled = false;
    getSupabase()
      .rpc('ns_count_action_items_by_assignee', { p_member_id: teamMemberId })
      .then(({ data }) => {
        if (!cancelled) setTotal(Number(data ?? 0));
      })
      .catch(() => { if (!cancelled) setTotal(null); });
    return () => { cancelled = true; };
  }, [teamMemberId]);
  return total;
}

function TopOfMind({ teamMemberId }: { teamMemberId: string | null }) {
  const { items, loading } = useTopOfMind(teamMemberId);
  const totalOpen = useOpenItemsForDri(teamMemberId);

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 bg-bg-card rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    const totalLabel = totalOpen === null ? '—' : String(totalOpen);
    return (
      <div className="bg-bg-card border border-border-default rounded-xl px-5 py-4">
        <div className="mono text-[12px] text-text-primary">
          No irreversible or high-priority items for you.
        </div>
        <button
          type="button"
          onClick={() => navigateAtrium({ tab: 'work', subTab: 'items', filter: { dri: 'me' } })}
          className="mono text-[11px] text-text-secondary mt-1.5 hover:text-text-primary underline-offset-2 hover:underline text-left"
        >
          Open Work &gt; Items to see all assigned to you ({totalLabel} items)
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const color = PRIORITY_COLOR[item.priority] ?? PRIORITY_COLOR.medium;
        return (
          <div
            key={item.id}
            className="w-full bg-bg-card border border-border-default rounded-xl px-4 sm:px-5 py-3 sm:py-4 hover:border-border-hover transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: color }} />
              <div className="min-w-0 flex-1">
                <div className="mono text-[13px] text-text-primary truncate">{item.title}</div>
                {item.description && (
                  <div className="mono text-[11px] text-text-secondary mt-0.5 line-clamp-1">{item.description}</div>
                )}
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  <span className="mono text-[9px] uppercase tracking-[0.14em]" style={{ color }}>
                    {item.priority}
                  </span>
                  {item.due_at && (
                    <span className="mono text-[9px] text-text-muted">
                      due {new Date(item.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── ActivityFeed — Sprint 4: 30s dedupe, 2s throttle ─────────────────────────

function useActivityFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const lastDisplayedRef = useRef<number>(0);
  const pendingRef = useRef<FeedEvent[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPending = useCallback(() => {
    const now = Date.now();
    if (pendingRef.current.length === 0) return;
    if (now - lastDisplayedRef.current < THROTTLE_MS) return;

    lastDisplayedRef.current = now;
    const toAdd = pendingRef.current.splice(0);
    pendingRef.current = [];

    setEvents((prev) => {
      const updated = [...prev];
      const cutoff = now - DEDUPE_WINDOW_MS;

      for (const evt of toAdd) {
        // Dedupe: merge same source_type within DEDUPE_WINDOW_MS into one card with count
        const matchIdx = updated.findIndex(
          (e) =>
            e.source_type === evt.source_type &&
            new Date(e.created_at).getTime() > cutoff,
        );
        if (matchIdx >= 0) {
          updated[matchIdx] = {
            ...updated[matchIdx],
            count: (updated[matchIdx].count || 1) + 1,
          };
        } else {
          updated.unshift(evt);
        }
      }

      return updated.slice(0, FEED_MAX);
    });
  }, []);

  const addEvent = useCallback(
    (evt: FeedEvent) => {
      pendingRef.current.push(evt);
      // Schedule a flush respecting the 2s throttle
      if (timerRef.current) return; // already scheduled
      const delay = Math.max(0, THROTTLE_MS - (Date.now() - lastDisplayedRef.current));
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        flushPending();
      }, delay);
    },
    [flushPending],
  );

  useEffect(() => {
    const sb = getSupabase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ledgerChannel = (sb.channel('atrium-now-ledger') as any)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'nervous_system', table: 'ledger' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const row = payload.new as {
            id: string;
            source_type: string;
            content_summary: string | null;
            created_at: string;
          };
          addEvent({
            id: row.id,
            source_type: row.source_type,
            content_summary: row.content_summary,
            created_at: row.created_at,
            count: 1,
            table: 'ledger',
          });
        },
      )
      .subscribe();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auditChannel = (sb.channel('atrium-now-audit') as any)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'nervous_system', table: 'audit_log' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const row = payload.new as {
            id: string;
            table_name: string;
            action: string;
            created_at: string;
          };
          addEvent({
            id: row.id,
            source_type: `${row.action}:${row.table_name}`,
            content_summary: `${row.action} on ${row.table_name}`,
            created_at: row.created_at,
            count: 1,
            table: 'audit_log',
          });
        },
      )
      .subscribe();

    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      void sb.removeChannel(ledgerChannel);
      void sb.removeChannel(auditChannel);
    };
  }, [addEvent]);

  return events;
}

const SOURCE_TYPE_ICONS: Record<string, string> = {
  call: '📞',
  slack: '💬',
  email: '✉️',
  voice_memo: '🎙️',
  apple_note: '📝',
  cowork_session: '🤝',
  agent_run: '🤖',
  manual: '⌨️',
};

const SOURCE_TYPE_COLORS: Record<string, string> = {
  call:           '#2E6CD4',
  slack:          '#7355E5',
  email:          '#1F8A5B',
  voice_memo:     '#E8763A',
  agent_run:      '#0EA5E9',
  kanban_move:    '#94A3B8',
  taboo_bounce:   '#D14848',
  audit_log:      '#5B6580',
  ledger_write:   '#0B9488',
  apple_note:     '#C9A227',
  cowork_session: '#2E8E66',
  manual:         '#7E8AA3',
};

function SourceDot({ sourceType }: { sourceType: string }) {
  const color = SOURCE_TYPE_COLORS[sourceType] ?? '#94A3B8';
  return (
    <span style={{
      width: 22, height: 22, borderRadius: 6,
      background: color + '1A', color,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
    </span>
  );
}

function ActivityFeedView({ events }: { events: FeedEvent[] }) {
  return (
    // Sprint 4 mobile: full width
    <div className="w-full bg-bg-card border border-border-default rounded-xl overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-border-default flex items-center justify-between">
        <div className="mono text-[11px] uppercase tracking-[0.16em] text-text-secondary">
          Live Activity
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#2E8E66] animate-pulse" />
          <div className="mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
            Live
          </div>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="px-4 sm:px-5 py-6 mono text-[11px] text-text-muted">
          Listening for activity… events will appear here in real time.
        </div>
      ) : (
        <div className="divide-y divide-border-default">
          {events.map((evt) => (
            <div key={evt.id} className="px-4 sm:px-5 py-3 flex items-center gap-3">
              <SourceDot sourceType={evt.source_type} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="mono text-[12px] text-text-primary truncate">
                    {evt.content_summary ?? evt.source_type}
                    {(evt.count ?? 1) > 1 && (
                      <span className="ml-1.5 mono text-[10px] bg-bg-raised text-text-secondary px-1.5 py-0.5 rounded">
                        ×{evt.count}
                      </span>
                    )}
                  </div>
                  <div className="hidden sm:block mono text-[10px] text-text-muted shrink-0">
                    {formatRelativeTime(evt.created_at)}
                  </div>
                </div>
                <div className="mono text-[9px] uppercase tracking-[0.12em] text-text-muted mt-0.5">
                  {evt.source_type} · {evt.table}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ActivityTab — N-4: filter bar + timeframe + expandable rows ──────────────

const KNOWN_SOURCES = Object.keys(SOURCE_TYPE_ICONS);

function ActivityTab() {
  const events = useActivityFeed();
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set());
  const [surface, setSurface] = useState<'all' | 'ledger' | 'audit_log'>('all');
  const [timeframe, setTimeframe] = useState<Timeframe>('24h');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const cutoffMs = useMemo(() => {
    const now = Date.now();
    if (timeframe === '1h') return now - 3_600_000;
    if (timeframe === '24h') return now - 86_400_000;
    if (timeframe === '7d') return now - 604_800_000;
    return 0;
  }, [timeframe]);

  const allSourceTypes = useMemo(
    () => [...new Set([...KNOWN_SOURCES, ...events.map((e) => e.source_type)])],
    [events],
  );

  const filtered = useMemo(
    () =>
      events.filter((evt) => {
        if (new Date(evt.created_at).getTime() < cutoffMs) return false;
        if (surface !== 'all' && evt.table !== surface) return false;
        if (activeSources.size > 0 && !activeSources.has(evt.source_type)) return false;
        return true;
      }),
    [events, cutoffMs, surface, activeSources],
  );

  function toggleSource(src: string) {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Timeframe selector */}
        <div className="flex gap-0.5 bg-bg-card border border-border-default rounded-lg p-0.5 mr-1">
          {(['1h', '24h', '7d', 'custom'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              className={`mono text-[10px] uppercase tracking-[0.12em] px-2.5 py-1 rounded transition-colors ${
                timeframe === t
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Surface chips */}
        {(['all', 'ledger', 'audit_log'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSurface(s)}
            className={`mono text-[10px] uppercase tracking-[0.12em] px-2.5 py-1 rounded-full border transition-colors ${
              surface === s
                ? 'border-[var(--accent)] text-text-primary bg-[rgba(232,118,58,0.09)]'
                : 'border-border-default text-text-muted hover:text-text-secondary'
            }`}
          >
            {s === 'all' ? 'All' : s === 'audit_log' ? 'Audit' : 'Ledger'}
          </button>
        ))}

        {/* Source chips */}
        {allSourceTypes.map((src) => (
          <button
            key={src}
            onClick={() => toggleSource(src)}
            className={`mono text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
              activeSources.has(src)
                ? 'border-[var(--accent)] text-text-primary bg-[rgba(232,118,58,0.09)]'
                : 'border-border-default text-text-muted hover:text-text-secondary'
            }`}
          >
            {src}
          </button>
        ))}

        {/* DRI chip — Sprint 5+ */}
        <button
          disabled
          title="DRI filtering — Sprint 5"
          className="mono text-[10px] px-2.5 py-1 rounded-full border border-border-default text-text-faint cursor-not-allowed"
        >
          DRI · Sprint 5
        </button>
      </div>

      {/* Feed */}
      <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-border-default flex items-center justify-between">
          <div className="mono text-[11px] uppercase tracking-[0.16em] text-text-secondary">
            Activity Feed
          </div>
          <div className="flex items-center gap-3">
            <span className="mono text-[10px] text-text-muted">
              {filtered.length} event{filtered.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#2E8E66] animate-pulse" />
              <span className="mono text-[9px] uppercase tracking-[0.14em] text-text-muted">Live</span>
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 sm:px-5 py-6 mono text-[11px] text-text-muted">
            No events matching the current filters.
          </div>
        ) : (
          <div className="divide-y divide-border-default">
            {filtered.map((evt) => {
              const expanded = expandedId === evt.id;
              return (
                <div
                  key={evt.id}
                  className="cursor-pointer hover:bg-bg-raised transition-colors"
                  onClick={() => setExpandedId(expanded ? null : evt.id)}
                >
                  <div className="px-4 sm:px-5 py-3 flex items-center gap-3">
                    <SourceDot sourceType={evt.source_type} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="mono text-[12px] text-text-primary truncate">
                          {evt.content_summary ?? evt.source_type}
                          {(evt.count ?? 1) > 1 && (
                            <span className="ml-1.5 mono text-[10px] bg-bg-raised text-text-secondary px-1.5 py-0.5 rounded">
                              ×{evt.count}
                            </span>
                          )}
                        </div>
                        <div className="mono text-[10px] text-text-muted shrink-0">
                          {formatRelativeTime(evt.created_at)}
                        </div>
                      </div>
                      <div className="mono text-[9px] uppercase tracking-[0.12em] text-text-muted mt-0.5">
                        {evt.source_type} · {evt.table}
                      </div>
                    </div>
                    <div className="mono text-[10px] text-text-muted shrink-0">
                      {expanded ? '▾' : '▸'}
                    </div>
                  </div>

                  {expanded && (
                    <div className="px-4 sm:px-5 pb-3 bg-bg-card">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 pl-7 pt-1">
                        <div>
                          <div className="mono text-[9px] uppercase tracking-[0.16em] text-text-muted">source</div>
                          <div className="mono text-[11px] text-text-primary">{evt.source_type}</div>
                        </div>
                        <div>
                          <div className="mono text-[9px] uppercase tracking-[0.16em] text-text-muted">surface</div>
                          <div className="mono text-[11px] text-text-primary">{evt.table}</div>
                        </div>
                        <div>
                          <div className="mono text-[9px] uppercase tracking-[0.16em] text-text-muted">count</div>
                          <div className="mono text-[11px] text-text-primary">{evt.count ?? 1}</div>
                        </div>
                        <div>
                          <div className="mono text-[9px] uppercase tracking-[0.16em] text-text-muted">timestamp</div>
                          <div className="mono text-[11px] text-text-primary">
                            {new Date(evt.created_at).toLocaleString()}
                          </div>
                        </div>
                        {evt.content_summary && (
                          <div className="col-span-2">
                            <div className="mono text-[9px] uppercase tracking-[0.16em] text-text-muted">payload</div>
                            <div className="mono text-[11px] text-text-primary mt-0.5 break-all leading-relaxed">
                              {evt.content_summary}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DigestTab — N-5 (vault Analyst digest) + S3 (Slack daily-scan) ──────────
// Page-level shared date picker. Both Analyst-vault and Slack-scan tiles read
// from the same `date` state. Render order: picker → Analyst → Slack.

function digestTodayPT(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function digestShiftDate(iso: string, delta: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function digestRelativeLabel(iso: string): string {
  const today = digestTodayPT();
  if (iso === today) return 'Today';
  if (iso === digestShiftDate(today, -1)) return 'Yesterday';
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  });
}

function digestFormatDisplayDate(iso: string): string {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  });
}

function DigestTab() {
  const today = digestTodayPT();
  const [date, setDate] = useState(today);

  return (
    <div className="flex flex-col gap-6">
      {/* Page-level date picker — drives both tiles below. */}
      <div className="bg-bg-card border border-border-default rounded-xl px-5 py-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent)] font-semibold mb-1">
              Daily digest
            </div>
            <div className="mono text-[22px] font-medium text-text-primary leading-tight">
              {digestRelativeLabel(date)}
            </div>
            <div className="mono text-[10px] text-text-muted mt-1.5">
              {digestFormatDisplayDate(date)}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setDate(digestShiftDate(date, -1))}
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
              onClick={() => setDate(digestShiftDate(date, +1))}
              disabled={date >= today}
              className="w-8 h-8 flex items-center justify-center bg-bg-raised border border-border-default rounded-lg mono text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next day"
            >
              →
            </button>
          </div>
        </div>
      </div>

      <AnalystVaultDigest date={date} />
      <SlackDigest date={date} />
    </div>
  );
}

function AnalystVaultDigest({ date }: { date: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setContent(null);

    const url = `https://raw.githubusercontent.com/freakngenius/unicron-knowledge/main/wiki/memory/analyst/${date}.md`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.text();
      })
      .then((text) => { if (!cancelled) { setContent(text); setLoading(false); } })
      .catch(() => { if (!cancelled) { setContent(null); setLoading(false); } });

    return () => { cancelled = true; };
  }, [date]);

  const { narrative, sections } = useMemo(() => {
    if (!content) return { narrative: null, sections: [] as { title: string; body: string }[] };
    const lines = content.split('\n');
    const intro: string[] = [];
    const sects: { title: string; body: string }[] = [];
    let current: { title: string; body: string[] } | null = null;

    for (const line of lines) {
      if (line.startsWith('## ')) {
        if (current) sects.push({ title: current.title, body: current.body.join('\n').trim() });
        current = { title: line.slice(3).trim(), body: [] };
      } else if (line.startsWith('# ')) {
        // skip top-level header
      } else if (current) {
        current.body.push(line);
      } else {
        intro.push(line);
      }
    }
    if (current) sects.push({ title: current.title, body: current.body.join('\n').trim() });

    return {
      narrative: intro.filter(Boolean).join('\n').trim() || null,
      sections: sects,
    };
  }, [content]);

  const SECTION_LABELS = ['Calls', 'Actions', 'PRs', 'Taboos', 'Decay', 'Sprints'];

  return (
    <div className="flex flex-col gap-4">
      {/* Header card — eyebrow + narrative; date already rendered at the page level. */}
      <div className="bg-bg-card border border-border-default rounded-xl px-5 py-5">
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent)] font-semibold mb-1">
          Analyst · Daily digest
        </div>
        <div className="mono text-[10px] text-text-muted mb-3">
          vault/Memory/analyst/{date}.md
        </div>

        {loading ? (
          <div className="space-y-2">
            <div className="h-3 w-full bg-bg-raised rounded animate-pulse" />
            <div className="h-3 w-4/5 bg-bg-raised rounded animate-pulse" />
          </div>
        ) : content ? (
          narrative && (
            <p className="mono text-[13px] text-text-primary leading-relaxed">{narrative}</p>
          )
        ) : (
          <p className="mono text-[12px] text-text-muted">
            No digest for this date. Digests are generated nightly at 06:00 PT.
          </p>
        )}
      </div>

      {/* 2-col sections grid — real sections from markdown or placeholder skeleton */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SECTION_LABELS.map((s) => (
            <div key={s} className="h-32 bg-bg-card rounded-xl animate-pulse" />
          ))}
        </div>
      ) : sections.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sections.map((s) => (
            <div key={s.title} className="bg-bg-card border border-border-default rounded-xl px-5 py-4">
              <div className="mono text-[12px] font-semibold text-text-primary mb-3">{s.title}</div>
              {s.body ? (
                <div className="mono text-[12px] text-text-secondary leading-relaxed whitespace-pre-line">
                  {s.body}
                </div>
              ) : (
                <div className="mono text-[11px] text-text-muted">—</div>
              )}
            </div>
          ))}
        </div>
      ) : content ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SECTION_LABELS.map((s) => (
            <div
              key={s}
              className="h-20 border border-dashed border-border-default rounded-xl flex items-center justify-center"
            >
              <div className="mono text-[9px] uppercase tracking-[0.18em] text-text-faint">{s}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── GlobalSearch stub ────────────────────────────────────────────────────────

function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center pt-[15vh] px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg-card border border-border-hover rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border-default">
          <div className="mono text-text-muted">⌘</div>
          <input
            autoFocus
            placeholder="Search coming in Sprint 3…"
            className="flex-1 bg-transparent mono text-[14px] text-text-primary placeholder:text-text-muted outline-none"
            readOnly
          />
          <button
            onClick={onClose}
            className="mono text-[10px] uppercase tracking-[0.16em] text-text-secondary hover:text-text-primary transition-colors"
          >
            esc
          </button>
        </div>
        <div className="px-5 py-6 text-center">
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-text-muted mb-2">
            Search not yet implemented
          </div>
          <div className="mono text-[10px] text-text-muted">
            Full search across vault, action items, and ledger arrives in Sprint 3.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SkillsSurface — Sprint 4: 2-col mobile, 4-col desktop ───────────────────

interface TriageItem {
  id: string;
  source_type: string;
  content_summary: string | null;
  confidence: number | null;
  created_at: string;
  score: number;
}

interface SkillDispatchState {
  prompt: string;
  result: string | null;
  running: boolean;
  error: string | null;
  // Productivity skill results
  runningSlug: string | null;
  triageItems: TriageItem[] | null;
  triageMessage: string | null;
}

// Sprint 5+6: modal state for active skills that need input
type SkillModalState =
  | { open: false }
  | {
      open: true;
      skill: SkillRow;
      // deep-research fields
      topic?: string;
      depth?: string;
      // llm-council-deliberate fields
      question?: string;
      criteria?: string;
      // track-pipeline-stage fields
      customerId?: string;
      newStage?: string;
      note?: string;
      // marketing fields (Sprint 6)
      targetAudience?: string;
      platform?: string;
      audience?: string;
      product?: string;
      pageSlug?: string;
      proposedChanges?: string;
    };

// Slugs that route to /api/atrium/skills/run instead of /api/skills/dispatch
const PRODUCTIVITY_SLUGS = new Set(['morning-brief', 'inbox-triage', 'slack-daily-scan']);

// Sprint 5+6: slugs that route to /api/atrium/skills/run and need a modal for input
const MODAL_SKILL_SLUGS = new Set([
  'deep-research',
  'llm-council-deliberate',
  'track-pipeline-stage',
  // Marketing (Sprint 6)
  'draft-blog-post',
  'draft-social-post',
  'generate-positioning-deck',
  'update-manifesto-page',
]);

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await getSupabase().auth.getSession();
  const accessToken = data.session?.access_token;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) h.Authorization = `Bearer ${accessToken}`;
  return h;
}

// Future-sprint placeholder skills not yet in the DB.
// Shown as disabled stubs until seeded.
// Sprint 4: Productivity domain is now live — removed from stubs.
// Sprint 5: Research, Discovery, Sales domains are now DB-registered — removed from stubs.
// Sprint 6: Marketing domain is now DB-registered — removed from stubs.
const FUTURE_SKILL_STUBS: { label: string; key: string; names: string[]; sprint: number }[] = [];

function formatSkillName(name: string): string {
  return name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function useSkills() {
  const [skills, setSkills] = useState<SkillRow[]>([]);
  useEffect(() => {
    fetch('/api/atrium/skills')
      .then((r) => r.json() as Promise<SkillRow[]>)
      .then((data) => setSkills(Array.isArray(data) ? data : []))
      .catch(() => {
        const sb = getSupabase();
        sb.rpc('ns_list_skills')
          .then(({ data }) => setSkills((data as SkillRow[] | null) ?? []));
      });
  }, []);
  return skills;
}

function SkillsSurface({ onOpenQuickCapture }: { onOpenQuickCapture?: () => void }) {
  const skills = useSkills();
  const [state, setState] = useState<SkillDispatchState>({
    prompt: '',
    result: null,
    running: false,
    error: null,
    runningSlug: null,
    triageItems: null,
    triageMessage: null,
  });

  // Sprint 5: modal state for active skills that need user input before running
  const [modal, setModal] = useState<SkillModalState>({ open: false });

  // N-6: category filter state
  const [domainFilter, setDomainFilter] = useState<string | null>(null);

  const byDomain = skills.reduce<Record<string, SkillRow[]>>((acc, s) => {
    (acc[s.domain] ??= []).push(s);
    return acc;
  }, {});

  const allDomains = [...new Set(skills.map((s) => s.domain))].sort();
  const filteredDomains = domainFilter
    ? { [domainFilter]: byDomain[domainFilter] ?? [] }
    : byDomain;

  const registeredNames = new Set(skills.map((s) => s.name));

  // Sprint 5: submit handler for modal-driven active skills
  async function handleModalSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modal.open) return;
    const skill = modal.skill;
    setModal({ open: false });

    setState((s) => ({
      ...s,
      running: true,
      runningSlug: skill.name,
      result: null,
      error: null,
      triageItems: null,
      triageMessage: null,
    }));

    try {
      const bodyPayload: Record<string, unknown> = { skill_slug: skill.name };

      if (skill.name === 'deep-research') {
        bodyPayload.topic = modal.topic ?? '';
        if (modal.depth) bodyPayload.depth = modal.depth;
      } else if (skill.name === 'llm-council-deliberate') {
        bodyPayload.question = modal.question ?? '';
        if (modal.criteria) bodyPayload.criteria = modal.criteria;
      } else if (skill.name === 'track-pipeline-stage') {
        bodyPayload.customer_id = modal.customerId ?? '';
        bodyPayload.new_stage = modal.newStage ?? '';
        if (modal.note) bodyPayload.note = modal.note;
      } else if (skill.name === 'draft-blog-post') {
        bodyPayload.topic = modal.topic ?? '';
        if (modal.targetAudience) bodyPayload.target_audience = modal.targetAudience;
      } else if (skill.name === 'draft-social-post') {
        bodyPayload.topic = modal.topic ?? '';
        bodyPayload.platform = modal.platform ?? 'both';
      } else if (skill.name === 'generate-positioning-deck') {
        bodyPayload.audience = modal.audience ?? '';
        bodyPayload.product = modal.product ?? 'pathfinder';
      } else if (skill.name === 'update-manifesto-page') {
        bodyPayload.page_slug = modal.pageSlug ?? '';
        bodyPayload.proposed_changes = modal.proposedChanges ?? '';
      }

      const res = await fetch('/api/atrium/skills/run', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify(bodyPayload),
      });
      const json = await res.json().catch(() => ({})) as Record<string, unknown>;

      if (!res.ok) {
        setState((s) => ({
          ...s,
          running: false,
          runningSlug: null,
          error: (json.error as string | undefined) ?? `${skill.name} failed (${res.status})`,
        }));
        return;
      }

      const resultText =
        skill.name === 'deep-research'
          ? (json.summary as string | undefined) ?? JSON.stringify(json, null, 2)
          : skill.name === 'llm-council-deliberate'
          ? (json.synthesis as string | undefined) ?? JSON.stringify(json, null, 2)
          : skill.name === 'track-pipeline-stage'
          ? `Stage updated → ${(json.stage as string | undefined) ?? 'unknown'}`
          : skill.name === 'draft-blog-post'
          ? (json.draft as string | undefined) ?? JSON.stringify(json, null, 2)
          : skill.name === 'draft-social-post'
          ? [
              json.linkedin ? `**LinkedIn:**\n${json.linkedin as string}` : '',
              json.twitter ? `**Twitter/X:**\n${json.twitter as string}` : '',
            ].filter(Boolean).join('\n\n') || JSON.stringify(json, null, 2)
          : skill.name === 'generate-positioning-deck'
          ? (() => {
              const slides = json.slides as Array<{ title: string; bullet_points: string[] }> | undefined;
              if (!slides || !Array.isArray(slides)) return JSON.stringify(json, null, 2);
              return slides.map((s, i) =>
                `**Slide ${i + 1}: ${s.title}**\n${(s.bullet_points ?? []).map((b) => `• ${b}`).join('\n')}`
              ).join('\n\n');
            })()
          : skill.name === 'update-manifesto-page'
          ? (json.proposed_edit as string | undefined) ?? JSON.stringify(json, null, 2)
          : JSON.stringify(json, null, 2);

      setState((s) => ({
        ...s,
        running: false,
        runningSlug: null,
        result: resultText,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        running: false,
        runningSlug: null,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }

  async function handleSkillClick(skill: SkillRow) {
    if (state.running) return;

    // UI trigger — open the modal directly, no API call
    if (skill.execution === 'ui_trigger' || skill.name === 'quick-capture' || skill.config?.ui_trigger === true) {
      onOpenQuickCapture?.();
      return;
    }

    // Agentic skills are invoked through Claude Code, not the Atrium UI.
    if (skill.execution === 'agentic') {
      setState((s) => ({
        ...s,
        running: false,
        runningSlug: null,
        result: `${skill.name} is an agentic skill — run it from Claude Code (Skill tool / slash command). The UI does not dispatch agentic skills.`,
      }));
      return;
    }

    // Scheduled-only skills are cron-driven, not click-driven.
    if (skill.execution === 'scheduled') {
      setState((s) => ({
        ...s,
        running: false,
        runningSlug: null,
        result: `${skill.name} runs on schedule. Click is a no-op.`,
      }));
      return;
    }

    // Scaffolded skills — do nothing (button is disabled in the UI)
    if (skill.status === 'scaffolded') {
      return;
    }

    // Sprint 5+6: modal-driven active skills — open input modal
    if (MODAL_SKILL_SLUGS.has(skill.name)) {
      setModal({
        open: true,
        skill,
        // research
        topic: '',
        depth: 'standard',
        question: '',
        criteria: '',
        // sales
        customerId: '',
        newStage: 'qualified',
        note: '',
        // marketing
        targetAudience: '',
        platform: 'both',
        audience: '',
        product: 'pathfinder',
        pageSlug: '',
        proposedChanges: '',
      });
      return;
    }

    // Productivity slugs: route to /api/atrium/skills/run
    if (PRODUCTIVITY_SLUGS.has(skill.name)) {
      setState((s) => ({
        ...s,
        running: true,
        runningSlug: skill.name,
        result: null,
        error: null,
        triageItems: null,
        triageMessage: null,
      }));
      try {
        const res = await fetch('/api/atrium/skills/run', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ skill_slug: skill.name }),
        });
        const json = await res.json().catch(() => ({})) as Record<string, unknown>;
        if (!res.ok) {
          setState((s) => ({
            ...s,
            running: false,
            runningSlug: null,
            error: (json.error as string | undefined) ?? `${skill.name} failed (${res.status})`,
          }));
          return;
        }
        if (skill.name === 'morning-brief') {
          setState((s) => ({
            ...s,
            running: false,
            runningSlug: null,
            result: (json.message as string | undefined) ?? 'Morning brief sent.',
          }));
        } else if (skill.name === 'inbox-triage') {
          setState((s) => ({
            ...s,
            running: false,
            runningSlug: null,
            triageItems: (json.items as TriageItem[] | undefined) ?? [],
            triageMessage: (json.message as string | undefined) ?? null,
          }));
        } else {
          setState((s) => ({
            ...s,
            running: false,
            runningSlug: null,
            result: 'done',
          }));
        }
      } catch (e) {
        setState((s) => ({
          ...s,
          running: false,
          runningSlug: null,
          error: e instanceof Error ? e.message : 'Unknown error',
        }));
      }
      return;
    }

    // No API route registered for this skill. Surface the gap instead of
    // POSTing to the deprecated /api/skills/dispatch stub.
    setState((s) => ({
      ...s,
      prompt: skill.name,
      running: false,
      runningSlug: null,
      result: null,
      error: `No dispatcher for "${skill.name}". Classify it in nervous_system.skills.execution (api/agentic/ui_trigger/scheduled) or add a handler in api/atrium/skills/run.ts.`,
    }));
  }

  async function handleRun(skillName?: string) {
    const prompt = skillName ?? state.prompt;
    if (!prompt.trim() || state.running) return;
    if (skillName) setState((s) => ({ ...s, prompt: skillName }));

    // Free-form prompts have no registered dispatcher — the legacy
    // /api/skills/dispatch endpoint was a Sprint-2 stub. Route by skill name
    // via handleSkillClick if we recognise the slug; otherwise surface the gap.
    const skill = skillName
      ? skills.find((s) => s.name === skillName)
      : null;
    if (skill) {
      await handleSkillClick(skill);
      return;
    }
    setState((s) => ({
      ...s,
      result: null,
      error: `Free-form prompts are not dispatched. Pick a registered skill from the catalog.`,
    }));
  }

  function clearState() {
    setState({
      prompt: '',
      result: null,
      running: false,
      error: null,
      runningSlug: null,
      triageItems: null,
      triageMessage: null,
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void handleRun();
  }

  return (
    <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 py-4 border-b border-border-default">
        <div className="mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
          Run a Skill to Begin
        </div>
        <div className="mono text-[9px] text-text-muted mt-0.5">
          Click a skill · press run · or type any prompt
        </div>
      </div>

      {/* Prompt area */}
      <div className="px-4 sm:px-5 py-4 border-b border-border-default">
        <div className="flex gap-2">
          <textarea
            value={state.prompt}
            onChange={(e) => setState((s) => ({ ...s, prompt: e.target.value }))}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want the system to do…"
            rows={3}
            className="flex-1 bg-bg-raised border border-border-default rounded-lg px-3 py-2 mono text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-hover resize-none"
          />
          <div className="flex flex-col gap-2">
            <button
              onClick={() => void handleRun()}
              disabled={!state.prompt.trim() || state.running}
              className="mono text-[11px] uppercase tracking-[0.14em] bg-[var(--accent)] text-white px-3 sm:px-4 py-2 rounded-lg hover:opacity-90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {state.running ? '…' : 'Run →'}
            </button>
            <button
              onClick={clearState}
              className="mono text-[11px] uppercase tracking-[0.14em] px-3 sm:px-4 py-2 rounded-lg border border-border-default text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Morning Brief result — preformatted message */}
        {state.result && (
          <div className="mt-3 bg-bg-raised border border-border-default rounded-lg px-3 py-2">
            <div className="mono text-[10px] uppercase tracking-[0.14em] text-text-secondary mb-1">Result</div>
            <div className="mono text-[12px] text-text-primary whitespace-pre-wrap">{state.result}</div>
          </div>
        )}

        {/* Inbox Triage result — ordered list */}
        {state.triageItems !== null && (
          <div className="mt-3 bg-bg-raised border border-border-default rounded-lg px-3 py-2">
            <div className="mono text-[10px] uppercase tracking-[0.14em] text-text-secondary mb-2">
              Inbox Triage — Top {state.triageItems.length} Items
            </div>
            {state.triageMessage && state.triageItems.length === 0 ? (
              <div className="mono text-[12px] text-text-secondary">{state.triageMessage}</div>
            ) : (
              <div className="space-y-2">
                {state.triageItems.map((item, idx) => (
                  <div key={item.id} className="flex items-start gap-2">
                    <div className="mono text-[9px] text-text-muted w-4 shrink-0 pt-0.5">
                      {idx + 1}.
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mono text-[12px] text-text-primary truncate">
                        {item.content_summary ?? `(${item.source_type} · no summary)`}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="mono text-[9px] uppercase tracking-[0.1em] text-text-muted">
                          {item.source_type}
                        </span>
                        <span className="mono text-[9px] text-text-muted">
                          score {item.score.toFixed(2)}
                        </span>
                        <span className="mono text-[9px] text-text-muted">
                          {formatRelativeTime(item.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {state.error && (
          <div className="mt-3 bg-[#E14B4B]/10 border border-[#E14B4B]/30 rounded-lg px-3 py-2">
            <div className="mono text-[11px] text-[#E14B4B]">{state.error}</div>
          </div>
        )}
      </div>

      {/* Domain grid — DB-registered skills */}
      <div className="px-4 sm:px-5 py-4 space-y-4">
        {/* N-6: category filter chips */}
        {allDomains.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setDomainFilter(null)}
              className={[
                'mono text-[9px] uppercase tracking-[0.16em] px-2.5 py-1 rounded-full border transition-colors',
                domainFilter === null
                  ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10'
                  : 'border-border-hover text-text-muted hover:border-border-strong hover:text-text-secondary',
              ].join(' ')}
            >
              All
            </button>
            {allDomains.map((d) => (
              <button
                key={d}
                onClick={() => setDomainFilter(d === domainFilter ? null : d)}
                className={[
                  'mono text-[9px] uppercase tracking-[0.16em] px-2.5 py-1 rounded-full border transition-colors',
                  domainFilter === d
                    ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10'
                    : 'border-border-hover text-text-muted hover:border-border-strong hover:text-text-secondary',
                ].join(' ')}
              >
                {d}
              </button>
            ))}
          </div>
        )}

        {Object.entries(filteredDomains).map(([domain, domainSkills]) => (
          <div key={domain}>
            <div className="mono text-[9px] uppercase tracking-[0.22em] text-text-muted mb-2">
              {domain}:
            </div>
            {/* N-6: auto-fill with 180px min tile width */}
            <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
              {domainSkills.map((skill) => {
                const isThisRunning = state.running && state.runningSlug === skill.name;
                const isUiTrigger =
                  skill.name === 'quick-capture' || skill.config?.ui_trigger === true;
                // Sprint 5: scaffolded skills render as disabled/dimmed
                const isScaffolded = skill.status === 'scaffolded';
                const isDisabled = isScaffolded || (state.running && !isUiTrigger);
                return (
                  <button
                    key={skill.id}
                    title={
                      isScaffolded
                        ? 'Coming in Sprint 6'
                        : isUiTrigger
                        ? 'Opens Quick Capture modal'
                        : skill.description
                    }
                    onClick={() => void handleSkillClick(skill)}
                    disabled={isDisabled}
                    className={[
                      'text-left px-3 py-2 rounded-lg border transition-colors',
                      isThisRunning
                        ? 'border-[var(--accent)] text-[var(--accent)] opacity-70 cursor-wait'
                        : isScaffolded
                        ? 'border-border-default text-text-muted cursor-not-allowed opacity-60'
                        : 'border-border-hover text-text-primary hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer',
                      isDisabled && !isThisRunning && !isScaffolded
                        ? 'disabled:opacity-50 disabled:cursor-not-allowed'
                        : '',
                    ].join(' ')}
                  >
                    <div className="mono text-[11px] tracking-[0.08em] truncate">
                      {isThisRunning ? '…' : formatSkillName(skill.name)}
                      {isScaffolded && (
                        <span className="ml-1 mono text-[8px] text-text-faint">
                          S6
                        </span>
                      )}
                      {skill.refusal_gate && !isThisRunning && !isScaffolded && (
                        <span
                          className="ml-1 mono text-[8px] text-orange-400"
                          title="Requires human approval before running"
                        >
                          &#x1F6E1;
                        </span>
                      )}
                    </div>
                    {!isThisRunning && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="mono text-[8px] text-text-muted">
                          {skill.last_run_at ? formatRelativeTime(skill.last_run_at) : 'never'}
                        </span>
                        {(skill.total_runs ?? 0) > 0 && (
                          <span className="mono text-[8px] text-text-muted bg-[rgba(255,255,255,0.06)] rounded px-1">
                            {skill.total_runs}×
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Future-sprint stubs */}
        {FUTURE_SKILL_STUBS.map((domain) => {
          const unstubbed = domain.names.filter(
            (n) => !registeredNames.has(n.toLowerCase().replace(/\s+/g, '-')),
          );
          if (unstubbed.length === 0) return null;
          return (
            <div key={domain.key}>
              <div className="mono text-[9px] uppercase tracking-[0.22em] text-text-muted mb-2">
                {domain.label}:
              </div>
              {/* 2-col mobile, 3-col sm, 4-col lg */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                {unstubbed.map((skillName) => (
                  <button
                    key={skillName}
                    disabled
                    title={`Coming in Sprint ${domain.sprint}`}
                    className="text-left px-3 py-2 rounded-lg border mono text-[11px] tracking-[0.08em] transition-colors border-border-default text-text-muted cursor-not-allowed"
                  >
                    {skillName}
                    <span className="ml-1 mono text-[8px] text-text-faint">
                      S{domain.sprint}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer stats */}
      <div className="px-4 sm:px-5 py-3 border-t border-border-default flex items-center gap-4 sm:gap-6">
        {[
          { label: 'Registered', value: skills.length > 0 ? String(skills.length) : '—' },
          { label: 'Recent Runs', value: '—' },
          { label: 'Vault Pulse', value: '—' },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="mono text-[9px] uppercase tracking-[0.18em] text-text-muted">
              {stat.label}
            </div>
            <div className="mono text-[11px] text-text-muted">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* ─── Sprint 5: Skill Input Modals ─── */}
      {modal.open && (
        <div
          className="fixed inset-0 z-[90] flex items-start justify-center pt-[12vh] px-4"
          onClick={(e) => e.target === e.currentTarget && setModal({ open: false })}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModal({ open: false })} />
          <div className="relative bg-bg-card border border-border-hover rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
              <div>
                <div className="mono text-[12px] text-text-primary font-medium">
                  {formatSkillName(modal.skill.name)}
                </div>
                <div className="mono text-[10px] text-text-muted mt-0.5 line-clamp-1">
                  {modal.skill.description}
                </div>
              </div>
              <button
                onClick={() => setModal({ open: false })}
                className="mono text-[10px] uppercase tracking-[0.16em] text-text-secondary hover:text-text-primary transition-colors ml-4"
              >
                esc
              </button>
            </div>

            {/* Modal form */}
            <form onSubmit={(e) => void handleModalSubmit(e)} className="px-5 py-5 space-y-4">
              {/* deep-research fields */}
              {modal.skill.name === 'deep-research' && (
                <>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-text-secondary block mb-1.5">
                      Topic *
                    </label>
                    <textarea
                      autoFocus
                      required
                      rows={3}
                      placeholder="What should the system research? Be specific."
                      value={modal.topic ?? ''}
                      onChange={(e) => setModal((m) => m.open ? { ...m, topic: e.target.value } : m)}
                      className="w-full bg-bg-raised border border-border-default rounded-lg px-3 py-2 mono text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-hover resize-none"
                    />
                  </div>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-text-secondary block mb-1.5">
                      Depth
                    </label>
                    <select
                      value={modal.depth ?? 'standard'}
                      onChange={(e) => setModal((m) => m.open ? { ...m, depth: e.target.value } : m)}
                      className="w-full bg-bg-raised border border-border-default rounded-lg px-3 py-2 mono text-[13px] text-text-primary focus:outline-none focus:border-border-hover"
                    >
                      <option value="quick">Quick (2-4 pages)</option>
                      <option value="standard">Standard (6-10 pages)</option>
                      <option value="deep">Deep (12-15 pages)</option>
                    </select>
                  </div>
                </>
              )}

              {/* llm-council-deliberate fields */}
              {modal.skill.name === 'llm-council-deliberate' && (
                <>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-text-secondary block mb-1.5">
                      Question *
                    </label>
                    <textarea
                      autoFocus
                      required
                      rows={3}
                      placeholder="What question or decision should the council deliberate on?"
                      value={modal.question ?? ''}
                      onChange={(e) => setModal((m) => m.open ? { ...m, question: e.target.value } : m)}
                      className="w-full bg-bg-raised border border-border-default rounded-lg px-3 py-2 mono text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-hover resize-none"
                    />
                  </div>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-text-secondary block mb-1.5">
                      Evaluation Criteria (optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. speed, cost, risk, market fit"
                      value={modal.criteria ?? ''}
                      onChange={(e) => setModal((m) => m.open ? { ...m, criteria: e.target.value } : m)}
                      className="w-full bg-bg-raised border border-border-default rounded-lg px-3 py-2 mono text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-hover"
                    />
                  </div>
                </>
              )}

              {/* track-pipeline-stage fields */}
              {modal.skill.name === 'track-pipeline-stage' && (
                <>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-text-secondary block mb-1.5">
                      Customer ID *
                    </label>
                    <input
                      autoFocus
                      required
                      type="text"
                      placeholder="UUID of the customer record"
                      value={modal.customerId ?? ''}
                      onChange={(e) => setModal((m) => m.open ? { ...m, customerId: e.target.value } : m)}
                      className="w-full bg-bg-raised border border-border-default rounded-lg px-3 py-2 mono text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-hover font-mono"
                    />
                  </div>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-text-secondary block mb-1.5">
                      New Stage *
                    </label>
                    <select
                      required
                      value={modal.newStage ?? 'qualified'}
                      onChange={(e) => setModal((m) => m.open ? { ...m, newStage: e.target.value } : m)}
                      className="w-full bg-bg-raised border border-border-default rounded-lg px-3 py-2 mono text-[13px] text-text-primary focus:outline-none focus:border-border-hover"
                    >
                      <option value="lead">Lead</option>
                      <option value="qualified">Qualified</option>
                      <option value="proposal">Proposal</option>
                      <option value="negotiation">Negotiation</option>
                      <option value="closed_won">Closed Won</option>
                      <option value="closed_lost">Closed Lost</option>
                    </select>
                  </div>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-text-secondary block mb-1.5">
                      Note (optional)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="What happened? Any context for this stage change."
                      value={modal.note ?? ''}
                      onChange={(e) => setModal((m) => m.open ? { ...m, note: e.target.value } : m)}
                      className="w-full bg-bg-raised border border-border-default rounded-lg px-3 py-2 mono text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-hover resize-none"
                    />
                  </div>
                </>
              )}

              {/* draft-blog-post fields */}
              {modal.skill.name === 'draft-blog-post' && (
                <>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-text-secondary block mb-1.5">
                      Topic *
                    </label>
                    <textarea
                      autoFocus
                      required
                      rows={2}
                      placeholder="e.g. How surveillance operators can win more bids with procurement intelligence"
                      value={modal.topic ?? ''}
                      onChange={(e) => setModal((m) => m.open ? { ...m, topic: e.target.value } : m)}
                      className="w-full bg-bg-raised border border-border-default rounded-lg px-3 py-2 mono text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-hover resize-none"
                    />
                  </div>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-text-secondary block mb-1.5">
                      Target Audience (optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. construction security buyers, investors"
                      value={modal.targetAudience ?? ''}
                      onChange={(e) => setModal((m) => m.open ? { ...m, targetAudience: e.target.value } : m)}
                      className="w-full bg-bg-raised border border-border-default rounded-lg px-3 py-2 mono text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-hover"
                    />
                  </div>
                </>
              )}

              {/* draft-social-post fields */}
              {modal.skill.name === 'draft-social-post' && (
                <>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-text-secondary block mb-1.5">
                      Topic / Milestone *
                    </label>
                    <textarea
                      autoFocus
                      required
                      rows={2}
                      placeholder="e.g. We just shipped procurement signal scoring for Zedcor"
                      value={modal.topic ?? ''}
                      onChange={(e) => setModal((m) => m.open ? { ...m, topic: e.target.value } : m)}
                      className="w-full bg-bg-raised border border-border-default rounded-lg px-3 py-2 mono text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-hover resize-none"
                    />
                  </div>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-text-secondary block mb-1.5">
                      Platform
                    </label>
                    <select
                      value={modal.platform ?? 'both'}
                      onChange={(e) => setModal((m) => m.open ? { ...m, platform: e.target.value } : m)}
                      className="w-full bg-bg-raised border border-border-default rounded-lg px-3 py-2 mono text-[13px] text-text-primary focus:outline-none focus:border-border-hover"
                    >
                      <option value="both">Both (LinkedIn + Twitter/X)</option>
                      <option value="linkedin">LinkedIn only</option>
                      <option value="twitter">Twitter/X only</option>
                    </select>
                  </div>
                </>
              )}

              {/* generate-positioning-deck fields */}
              {modal.skill.name === 'generate-positioning-deck' && (
                <>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-text-secondary block mb-1.5">
                      Audience Segment *
                    </label>
                    <input
                      autoFocus
                      required
                      type="text"
                      placeholder="e.g. construction security buyers, municipal procurement officers"
                      value={modal.audience ?? ''}
                      onChange={(e) => setModal((m) => m.open ? { ...m, audience: e.target.value } : m)}
                      className="w-full bg-bg-raised border border-border-default rounded-lg px-3 py-2 mono text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-hover"
                    />
                  </div>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-text-secondary block mb-1.5">
                      Product
                    </label>
                    <select
                      value={modal.product ?? 'pathfinder'}
                      onChange={(e) => setModal((m) => m.open ? { ...m, product: e.target.value } : m)}
                      className="w-full bg-bg-raised border border-border-default rounded-lg px-3 py-2 mono text-[13px] text-text-primary focus:outline-none focus:border-border-hover"
                    >
                      <option value="pathfinder">Pathfinder</option>
                      <option value="metacron">Metacron</option>
                    </select>
                  </div>
                </>
              )}

              {/* update-manifesto-page fields */}
              {modal.skill.name === 'update-manifesto-page' && (
                <>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-text-secondary block mb-1.5">
                      Page Slug *
                    </label>
                    <input
                      autoFocus
                      required
                      type="text"
                      placeholder="e.g. why-we-build, seven-generations, operating-principles"
                      value={modal.pageSlug ?? ''}
                      onChange={(e) => setModal((m) => m.open ? { ...m, pageSlug: e.target.value } : m)}
                      className="w-full bg-bg-raised border border-border-default rounded-lg px-3 py-2 mono text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-hover"
                    />
                  </div>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-text-secondary block mb-1.5">
                      Proposed Changes *
                    </label>
                    <textarea
                      required
                      rows={3}
                      placeholder="Describe what to add, remove, or reframe — e.g. 'Add a paragraph about Zedcor pilot outcomes to the proof section'"
                      value={modal.proposedChanges ?? ''}
                      onChange={(e) => setModal((m) => m.open ? { ...m, proposedChanges: e.target.value } : m)}
                      className="w-full bg-bg-raised border border-border-default rounded-lg px-3 py-2 mono text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-hover resize-none"
                    />
                  </div>
                </>
              )}

              {/* Modal actions */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setModal({ open: false })}
                  className="mono text-[11px] uppercase tracking-[0.14em] px-4 py-2 rounded-lg border border-border-default text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="mono text-[11px] uppercase tracking-[0.14em] bg-[var(--accent)] text-white px-4 py-2 rounded-lg hover:opacity-90 transition-colors"
                >
                  Run →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Pass 2 (R1) — ForecastPanel + RecentRunsPanel + RECENT_AGENT_RUNS const CUT.
// Static fake numbers had no backing source. Replaced with two real-data charts.

// SLOT: Action items per day · 7d · STATUS: real
// SOURCE: ns_action_items_daily_7d RPC over nervous_system.action_items
function useActionItemsDaily7d() {
  const [data, setData] = useState<Array<{ day: string; total: number; irreversible: number }>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    getSupabase()
      .rpc('ns_action_items_daily_7d')
      .then(({ data: rows }) => {
        if (cancelled) return;
        setData((rows as Array<{ day: string; total: number; irreversible: number }> | null) ?? []);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  return { data, loading };
}

function ActionItemsDailyChart() {
  const { data, loading } = useActionItemsDaily7d();
  if (loading) {
    return <div className="bg-bg-card border border-border-default rounded-xl p-4 h-32 animate-pulse" />;
  }
  const maxTotal = Math.max(1, ...data.map((d) => Number(d.total)));
  const sumTotal = data.reduce((acc, d) => acc + Number(d.total), 0);
  const sumIrr = data.reduce((acc, d) => acc + Number(d.irreversible), 0);
  const labels = data.map((d) => new Date(d.day).toLocaleDateString('en-US', { weekday: 'short' })[0]);
  // "+N today" delta — last bucket from the RPC is today (PT-anchored upstream).
  const todayCount = data.length > 0 ? Number(data[data.length - 1].total) : 0;
  return (
    <div className="bg-bg-card border border-border-default rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-0.5">
        <div className="mono text-[12px] font-semibold text-text-primary">Items created · 7d</div>
        <div className="mono text-[11px] text-text-primary">{sumTotal}</div>
      </div>
      <div className="mono text-[10px] text-text-secondary mb-3">
        +{todayCount} today · <span style={{ color: '#E14B4B' }}>{sumIrr} irreversible</span>
      </div>
      <svg viewBox="0 0 200 60" preserveAspectRatio="none" className="w-full h-14">
        {data.map((d, i) => {
          const x = (i / Math.max(1, data.length - 1)) * 190 + 5;
          const total = Number(d.total);
          const h = (total / maxTotal) * 50;
          const day = d.day;
          return (
            <rect
              key={day}
              x={x - 10}
              y={60 - h}
              width={20}
              height={h}
              fill="#6081BE"
              opacity={0.7}
              rx={2}
              style={{ cursor: 'pointer' }}
              onClick={() =>
                navigateAtrium({ tab: 'work', subTab: 'items', filter: { created_on: day } })
              }
            >
              <title>{`${new Date(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${total} items — click to filter`}</title>
            </rect>
          );
        })}
        <polyline
          points={data
            .map((d, i) => {
              const x = (i / Math.max(1, data.length - 1)) * 190 + 5;
              const total = Math.max(1, Number(d.total));
              const irr = Number(d.irreversible);
              const ratio = irr / total;
              return `${x},${60 - ratio * 50}`;
            })
            .join(' ')}
          fill="none"
          stroke="#E14B4B"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      </svg>
      <div className="flex justify-between mt-1.5 mono text-[9px] text-text-muted">
        {labels.map((l, i) => <span key={i}>{l}</span>)}
      </div>
    </div>
  );
}

// SLOT: Ingest yield · 7d · STATUS: real
// SOURCE: ns_ingest_yield_daily_7d RPC over nervous_system.ledger
// (source_type IN voice_memo+apple_note, qualifying = insights.confidence >= 0.5)
function useIngestYield7d() {
  const [data, setData] = useState<Array<{ day: string; total: number; qualifying: number }>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    getSupabase()
      .rpc('ns_ingest_yield_daily_7d')
      .then(({ data: rows }) => {
        if (cancelled) return;
        setData((rows as Array<{ day: string; total: number; qualifying: number }> | null) ?? []);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  return { data, loading };
}

function IngestYieldChart() {
  const { data, loading } = useIngestYield7d();
  if (loading) {
    return <div className="bg-bg-card border border-border-default rounded-xl p-4 h-32 animate-pulse" />;
  }
  const sumTotal = data.reduce((acc, d) => acc + Number(d.total), 0);
  const sumQual = data.reduce((acc, d) => acc + Number(d.qualifying), 0);
  const yieldPct = sumTotal > 0 ? Math.round((sumQual / sumTotal) * 100) : null;
  const labels = data.map((d) => new Date(d.day).toLocaleDateString('en-US', { weekday: 'short' })[0]);
  return (
    <div className="bg-bg-card border border-border-default rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-0.5">
        <div className="mono text-[12px] font-semibold text-text-primary">Ingest yield</div>
        <div className="mono text-[11px] text-text-primary">
          {yieldPct === null ? '—' : `${yieldPct}%`}
        </div>
      </div>
      <div className="mono text-[10px] text-text-secondary mb-3">
        Voice + Notes · {sumQual}/{sumTotal} ≥ 0.5 confidence · 7d
      </div>
      <svg viewBox="0 0 200 60" preserveAspectRatio="none" className="w-full h-14">
        <polyline
          points={data
            .map((d, i) => {
              const x = (i / Math.max(1, data.length - 1)) * 190 + 5;
              const total = Number(d.total);
              const qual = Number(d.qualifying);
              const ratio = total > 0 ? qual / total : 0;
              return `${x},${60 - ratio * 50}`;
            })
            .join(' ')}
          fill="none"
          stroke="#2E8E66"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map((d, i) => {
          const x = (i / Math.max(1, data.length - 1)) * 190 + 5;
          const total = Number(d.total);
          const qual = Number(d.qualifying);
          const ratio = total > 0 ? qual / total : 0;
          return <circle key={d.day} cx={x} cy={60 - ratio * 50} r="2" fill="#2E8E66" />;
        })}
      </svg>
      <div className="flex justify-between mt-1.5 mono text-[9px] text-text-muted">
        {labels.map((l, i) => <span key={i}>{l}</span>)}
      </div>
    </div>
  );
}

// ─── Today sidebar metric cards — real, clickable ────────────────────────────
// All three cards back to RPCs added in 20260512_ns_now_today_metrics.sql.

interface MetricCardProps {
  label: string;
  value: string;
  sub: string;
  onClick: () => void;
  loading?: boolean;
  accent?: string;
}

function MetricCard({ label, value, sub, onClick, loading, accent = '#6081BE' }: MetricCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full text-left bg-bg-card border border-border-default rounded-xl p-4 hover:border-border-hover transition-colors disabled:cursor-wait"
    >
      <div className="mono text-[10px] uppercase tracking-[0.16em] text-text-secondary mb-1.5">
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className="text-[26px] font-semibold leading-none"
          style={{ color: accent, fontFamily: 'var(--font-display)' }}
        >
          {loading ? '—' : value}
        </span>
      </div>
      <div className="mono text-[10px] text-text-muted mt-2 line-clamp-2">{sub}</div>
    </button>
  );
}

function useOpenItemsBreakdown(teamMemberId: string | null) {
  const [row, setRow] = useState<{ total: number; irreversible: number; high: number; medium: number; low: number } | null>(null);
  const [loading, setLoading] = useState(Boolean(teamMemberId));
  useEffect(() => {
    if (!teamMemberId) return;
    let cancelled = false;
    getSupabase()
      .rpc('ns_now_open_items_for_dri', { p_dri: teamMemberId })
      .then(({ data }) => {
        if (cancelled) return;
        const rows = data as Array<{ total: number; irreversible: number; high: number; medium: number; low: number }> | null;
        setRow(rows?.[0] ?? null);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [teamMemberId]);
  return { row, loading };
}

function OpenItemsCard({ teamMemberId }: { teamMemberId: string | null }) {
  const { row, loading } = useOpenItemsBreakdown(teamMemberId);
  const total = row?.total ?? 0;
  const sub = row
    ? `${row.irreversible} irreversible · ${row.high} high · ${row.medium} medium · ${row.low} low`
    : '—';
  return (
    <MetricCard
      label="Open items · you DRI"
      value={String(total)}
      sub={sub}
      loading={loading}
      onClick={() => navigateAtrium({ tab: 'work', subTab: 'items', filter: { dri: 'me' } })}
    />
  );
}

function useRefusals24h() {
  const [row, setRow] = useState<{ total: number; needs_review: number } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    getSupabase()
      .rpc('ns_now_refusals_24h')
      .then(({ data }) => {
        if (cancelled) return;
        const rows = data as Array<{ total: number; needs_review: number }> | null;
        setRow(rows?.[0] ?? null);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  return { row, loading };
}

function RefusalsCard() {
  const { row, loading } = useRefusals24h();
  const total = row?.total ?? 0;
  const review = row?.needs_review ?? 0;
  const accent = total > 0 ? '#E14B4B' : '#6081BE';
  return (
    <MetricCard
      label="Refusals · 24h"
      value={String(total)}
      sub={`${review} need review`}
      loading={loading}
      accent={accent}
      onClick={() => navigateAtrium({ tab: 'system', subTab: 'Refusal Log', filter: { window: '24h' } })}
    />
  );
}

function useDecisions7d() {
  const [row, setRow] = useState<{ total: number; latest_title: string | null; latest_at: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    getSupabase()
      .rpc('ns_now_decisions_7d')
      .then(({ data }) => {
        if (cancelled) return;
        const rows = data as Array<{ total: number; latest_title: string | null; latest_at: string | null }> | null;
        setRow(rows?.[0] ?? null);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  return { row, loading };
}

function DecisionsCard() {
  const { row, loading } = useDecisions7d();
  const total = row?.total ?? 0;
  const latest = row?.latest_title?.trim();
  const sub = total === 0
    ? 'No decisions logged in the last 7d'
    : latest
      ? `Most recent: ${latest}`
      : `${total} decision${total === 1 ? '' : 's'} · no title`;
  return (
    <MetricCard
      label="Decisions · 7d"
      value={String(total)}
      sub={sub}
      loading={loading}
      onClick={() => navigateAtrium({ tab: 'work', subTab: 'decisions' })}
    />
  );
}

function useLlmSpend() {
  const [row, setRow] = useState<{ spent_usd: number; limit_usd: number; period_days: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    getSupabase()
      .rpc('ns_now_llm_spend_current_period')
      .then(({ data }) => {
        if (cancelled) return;
        const rows = data as Array<{ spent_usd: number; limit_usd: number; period_days: number | null }> | null;
        setRow(rows?.[0] ?? null);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  return { row, loading };
}

function AgentLlmSpendCard() {
  const { row, loading } = useLlmSpend();
  if (loading) {
    return <div className="bg-bg-card border border-border-default rounded-xl p-4 h-24 animate-pulse" />;
  }
  // No real source rows → hide entirely (no fakery).
  if (!row || (Number(row.limit_usd) === 0 && Number(row.spent_usd) === 0)) return null;
  const spent = Number(row.spent_usd);
  const limit = Number(row.limit_usd);
  const pct = limit > 0 ? Math.round((spent / limit) * 100) : null;
  const periodDays = row.period_days ?? null;
  const periodLabel = periodDays === 7 ? '/ week' : periodDays ? `/ ${periodDays}d` : '· current period';
  const accent = pct !== null && pct >= 80 ? '#E14B4B' : pct !== null && pct >= 60 ? '#C28A1F' : '#2E8E66';
  return (
    <button
      type="button"
      onClick={() => navigateAtrium({ tab: 'system', subTab: 'Services' })}
      className="w-full text-left bg-bg-card border border-border-default rounded-xl p-4 hover:border-border-hover transition-colors"
    >
      <div className="flex items-baseline justify-between mb-1">
        <div className="mono text-[12px] font-semibold text-text-primary">Agent LLM spend</div>
        <div className="mono text-[11px]" style={{ color: accent }}>
          {pct === null ? '—' : `${pct}%`}
        </div>
      </div>
      <div className="mono text-[10px] text-text-secondary">
        ${spent.toFixed(2)} of ${limit.toFixed(2)} {periodLabel}
      </div>
      <div className="mono text-[9px] uppercase tracking-[0.14em] text-text-muted mt-1.5">
        nervous_system.agents.budget
      </div>
    </button>
  );
}

// ActivityFeed wrapper that only renders when there's at least one event whose
// created_at is within the last 60 seconds. Hides the entire panel otherwise.
// `now` ticks every 5s so we re-evaluate the 60s window without calling
// Date.now() directly during render (react-hooks/purity).
function RecentActivityFeed() {
  const events = useActivityFeed();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);
  const recent = events.filter(
    (e) => now - new Date(e.created_at).getTime() <= 60_000,
  );
  if (recent.length === 0) return null;
  return <ActivityFeedView events={recent} />;
}

// ─── Now (main export) ────────────────────────────────────────────────────────

interface Props {
  name: string;
}

export function Now({ name }: Props) {
  const auth = useAuth();
  const time = useLocalTime();
  const [nowTab, setNowTab] = useState<NowTab>('today');
  const [skillPrompt, setSkillPrompt] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [teamMemberId, setTeamMemberId] = useState<string | null>(null);

  // Resolve team_member id from auth email
  // PGRST106 fix: use ns_get_team_member_by_email RPC instead of .schema('nervous_system')
  useEffect(() => {
    if (auth.status !== 'signed-in') return;
    const email = auth.user.email;
    if (!email) return;
    getSupabase()
      .rpc('ns_get_team_member_by_email', { p_email: email })
      .then(({ data }) => {
        const rows = data as Array<{ id: string }> | null;
        setTeamMemberId(rows?.[0]?.id ?? null);
      });
  }, [auth.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Global keyboard shortcuts
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setSearchOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setCaptureOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function showToast(text: string) {
    setToast(text);
    setTimeout(() => setToast(null), 3000);
  }

  return (
    <div className="relative w-full">
      {/* v3 sub-tab nav — Run a skill default, then Today / Activity / Digest */}
      <div className="flex gap-1 px-2 sm:px-7 pt-1 border-b border-border-default">
        {([
          { id: 'today',    label: 'Today',       Icon: AtriumIcon.Now },
          { id: 'skills',   label: 'Run a skill', Icon: AtriumIcon.Bolt },
          { id: 'activity', label: 'Activity',    Icon: AtriumIcon.Pulse },
          { id: 'digest',   label: 'Digest',      Icon: AtriumIcon.Inbox },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setNowTab(tab.id)}
            className={`px-3.5 py-3 -mb-px text-[13px] font-medium border-b-2 transition-colors inline-flex items-center gap-1.5 ${
              nowTab === tab.id
                ? 'border-[#6081BE] text-[#6081BE]'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <tab.Icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="px-2 sm:px-7 py-5">
      {/* Run a skill — default sub-tab */}
      {nowTab === 'skills' && (
        <div className="now-layout grid gap-5" style={{ gridTemplateColumns: 'minmax(0, 1fr) 340px', alignItems: 'start' }}>
          <style>{`
            @media (max-width: 1023px) { .now-layout { grid-template-columns: 1fr !important; } .now-rail { display: none !important; } }
          `}</style>

          <div className="flex flex-col gap-5 min-w-0">
            {/* Hero: free-form skill prompt */}
            <div className="bg-white border border-border-default rounded-xl p-5 sm:p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex w-7 h-7 rounded-md items-center justify-center" style={{ background: 'rgba(232,118,58,0.12)', color: '#E8763A' }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8 1L2 8h4l-1.5 5L11 6H7l1-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
                </span>
                <h2 className="text-[18px] font-semibold text-text-primary tracking-tight">Run a skill</h2>
              </div>
              <textarea
                value={skillPrompt}
                onChange={(e) => setSkillPrompt(e.target.value)}
                placeholder="Describe what you want, or pick a skill below…"
                rows={3}
                className="w-full bg-[#F6F7F9] border border-border-subtle rounded-lg px-3 py-2.5 text-[13.5px] text-text-primary placeholder:text-text-muted outline-none focus:border-[#6081BE] resize-none"
              />
              <div className="flex items-center justify-end gap-2 mt-3">
                <button
                  onClick={() => setSkillPrompt('')}
                  className="px-3 py-2 text-[13px] font-medium rounded-md border border-border-default text-text-secondary hover:bg-bg-raised transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={() => {
                    if (!skillPrompt.trim()) return;
                    setCaptureOpen(true);
                    showToast('Routed to Quick Capture — skill router in Sprint 6');
                  }}
                  disabled={!skillPrompt.trim()}
                  className="px-3.5 py-2 text-[13px] font-semibold rounded-md text-white disabled:opacity-40 transition-opacity"
                  style={{ background: '#6081BE' }}
                >
                  Run
                </button>
              </div>
            </div>

            {/* Skills library (existing SkillsSurface) */}
            <SkillsSurface onOpenQuickCapture={() => setCaptureOpen(true)} />
          </div>

          {/* Right rail: real-data charts (Pass 2 R1) */}
          <div className="now-rail flex flex-col gap-4 sticky top-0">
            <ActionItemsDailyChart />
            <IngestYieldChart />
          </div>
        </div>
      )}

      {/* Today — editorial pass 2026-05-11: action-driving default.
          CUT: HeroStrip ("company is calm"), YesterdayDigest (Digest sub-tab owns it),
               IngestYield card (jargon), Listening-for-activity placeholder.
          Calendar panel gated on per-user OAuth connection — see Bug Fix card
          "Calendar connection — per-user OAuth + shared team availability". */}
      {nowTab === 'today' && (
      <div className="now-layout grid gap-5" style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px', alignItems: 'start' }}>
        <style>{`
          @media (max-width: 1023px) { .now-layout { grid-template-columns: 1fr !important; } .now-rail { display: none !important; } }
        `}</style>

        {/* LEFT column — header + primary action list + (calendar gated) */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* Greeting */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted mb-1.5">
                {formatDate()} · {time}
              </div>
              <h1 className="text-[26px] sm:text-[32px] font-semibold text-text-primary tracking-tight leading-tight" style={{ fontFamily: 'var(--font-display)', letterSpacing: -0.5 }}>
                {greeting(name)}
              </h1>
            </div>
          </div>

          {/* PRIMARY: What needs you today — irreversible + high priority items
              where the signed-in user is DRI. Honest empty state. */}
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-text-secondary mb-3">
              What needs you today
            </div>
            <TopOfMind teamMemberId={teamMemberId} />
          </div>

          {/* SECONDARY: Today's calendar — gated on per-user calendar OAuth.
              Until that ships, do not render anything (no fake "connect" CTA). */}
        </div>

        {/* RIGHT rail — three real metric cards, then chart, then LLM spend
            (if real), then ActivityFeed only when an event hit in the last 60s. */}
        <div className="now-rail flex flex-col gap-4 sticky top-0">
          <OpenItemsCard teamMemberId={teamMemberId} />
          <RefusalsCard />
          <DecisionsCard />
          <ActionItemsDailyChart />
          <AgentLlmSpendCard />
          <RecentActivityFeed />
        </div>
      </div>
      )}

      {/* Activity sub-tab — full width, no rail */}
      {nowTab === 'activity' && <ActivityTab />}

      {/* Digest sub-tab — full width, date picker + 2-col sections */}
      {nowTab === 'digest' && <DigestTab />}
      </div>

      {/* ─── Modals ─── */}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <QuickCapture
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onToast={showToast}
        teamMemberId={teamMemberId}
      />

      {/* ─── Mobile FAB ─── */}
      <button
        onClick={() => setCaptureOpen(true)}
        title="Quick Capture"
        className="sm:hidden fixed bottom-4 right-4 z-50 flex items-center gap-1.5 px-4 py-3 bg-[var(--accent)] rounded-2xl shadow-lg hover:opacity-90 transition-colors"
        aria-label="Quick Capture"
      >
        <span className="mono text-[11px] uppercase tracking-[0.12em] text-white">+ Capture</span>
      </button>

      {/* ─── Toast ─── */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 mono text-[11px] uppercase tracking-[0.18em] text-white bg-bg-card border border-border-hover rounded-lg px-4 py-2 z-[200] pointer-events-none animate-toastUp">
          {toast}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono text-[9px] uppercase tracking-[0.22em] text-text-muted mb-2">
      {children}
    </div>
  );
}
