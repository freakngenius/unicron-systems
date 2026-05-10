// Atrium Now tab — Sprint 5 Stream G upgrade (extends Sprint 4 Stream C).
//
// Sprint 5 upgrades:
//  1. SkillsSurface — Research + Sales skills from DB; active skills show run modals;
//                     scaffolded skills show dimmed disabled button ("Coming in Sprint 6")
//  2. FUTURE_SKILL_STUBS — Research/Sales/Discovery domains removed (now in DB)
//  3. SkillRow type — extended with status + run_endpoint from updated ns_list_skills()
//
// Sprint 4 upgrades (preserved):
//  1. StatusPulse   — fully wired: agents (status field), escalations (audit_log 24h),
//                     budget (budget jsonb), decay (ledger decay_at)
//  2. TopOfMind     — replaced with attention-scored list (AttentionScorer)
//  3. YesterdayDigest — explicit "No digest yet" on 404; vault path unchanged
//  4. ActivityFeed  — dedupe window 30s, throttle 2s
//  5. Mobile        — full 320–768px Tailwind responsive pass

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
import { scoreAttentionItems, type ScoredItem } from './now/AttentionScorer';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentRow {
  id: string;
  name: string;
  active: boolean;
  status: string | null;
  budget: { limit_usd_per_period: number; current_spent_usd: number } | null;
}

export interface SkillRow {
  id: string;
  name: string;
  description: string;
  domain: string;
  active: boolean;
  refusal_gate: boolean;
  // Sprint 5: status distinguishes live vs. scaffolded skills
  status?: 'active' | 'scaffolded' | 'deprecated' | null;
  // Sprint 5: explicit routing metadata
  run_endpoint?: string | null;
  // config is an opaque JSON column — we only read ui_trigger here
  config?: { ui_trigger?: boolean } | null;
}

interface FeedEvent {
  id: string;
  source_type: string;
  content_summary: string | null;
  created_at: string;
  count: number;
  table: 'ledger' | 'audit_log';
}

type NowTab = 'overview' | 'activity';
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

// ─── StatusPulse — Sprint 4 fully wired ───────────────────────────────────────

interface PulseData {
  agentStatus: 'green' | 'yellow' | 'red' | 'loading';
  agentCount: number;
  escalationCount: number;
  budgetPct: number | null;
  decayCount: number;
  loading: boolean;
}

function usePulseData(): PulseData {
  const [data, setData] = useState<PulseData>({
    agentStatus: 'loading',
    agentCount: 0,
    escalationCount: 0,
    budgetPct: null,
    decayCount: 0,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    const sb = getSupabase();

    async function load() {
      try {
        // 1. Agent fleet — active agents, check status field for errors
        const { data: agents } = await sb
          .schema('nervous_system')
          .from('agents')
          .select('id, name, active, status, budget')
          .eq('active', true)
          .returns<AgentRow[]>();

        const activeAgents = agents ?? [];
        const hasError = activeAgents.some((a) => a.status === 'error');
        const agentStatus: 'green' | 'yellow' | 'red' =
          hasError ? 'red' : activeAgents.length === 0 ? 'yellow' : 'green';

        // 2. Escalations — audit_log action contains 'escalation' in last 24h
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count: escalationCount } = await sb
          .schema('nervous_system')
          .from('audit_log')
          .select('id', { count: 'exact', head: true })
          .like('action', '%escalation%')
          .gte('created_at', since24h);

        // 3. Decay alerts — ledger rows where decay_at < now and status != 'archived'
        const { count: decayCount } = await sb
          .schema('nervous_system')
          .from('ledger')
          .select('id', { count: 'exact', head: true })
          .lt('decay_at', new Date().toISOString())
          .neq('status', 'archived');

        if (cancelled) return;

        // 4. Budget burn — aggregate across active agents with budget jsonb
        let totalSpent = 0;
        let totalLimit = 0;
        activeAgents.forEach((a) => {
          if (a.budget) {
            totalSpent += a.budget.current_spent_usd ?? 0;
            totalLimit += a.budget.limit_usd_per_period ?? 0;
          }
        });
        const budgetPct = totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : null;

        setData({
          agentStatus,
          agentCount: activeAgents.length,
          escalationCount: escalationCount ?? 0,
          budgetPct,
          decayCount: decayCount ?? 0,
          loading: false,
        });
      } catch {
        if (!cancelled) setData((d) => ({ ...d, loading: false, agentStatus: 'red' }));
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  return data;
}

const STATUS_COLORS = {
  green: '#22C55E',
  yellow: '#F59E0B',
  red: '#EF4444',
  loading: '#2A2A2E',
};

function StatusPulse() {
  const { agentStatus, agentCount, escalationCount, budgetPct, decayCount, loading } = usePulseData();

  const indicators = [
    {
      label: 'Agent Fleet',
      color: STATUS_COLORS[agentStatus],
      value: agentStatus === 'loading'
        ? '—'
        : agentStatus === 'green'
          ? `${agentCount} Active`
          : agentStatus === 'yellow'
            ? 'No agents'
            : 'Error',
    },
    {
      label: 'Escalations',
      color: escalationCount > 0 ? STATUS_COLORS.red : STATUS_COLORS.green,
      value: loading ? '—' : String(escalationCount),
    },
    {
      label: 'Budget Burn',
      color:
        budgetPct === null
          ? STATUS_COLORS.loading
          : budgetPct >= 80
          ? STATUS_COLORS.red
          : budgetPct >= 60
          ? STATUS_COLORS.yellow
          : STATUS_COLORS.green,
      value: loading ? '—' : budgetPct === null ? '—' : `${budgetPct}%`,
    },
    {
      label: 'Decay Alerts',
      color: decayCount > 2 ? STATUS_COLORS.red : decayCount > 0 ? STATUS_COLORS.yellow : STATUS_COLORS.green,
      value: loading ? '—' : String(decayCount),
    },
  ];

  return (
    // Sprint 4 mobile: stack 2-up on xs, 4-across on sm+
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {indicators.map((ind) => (
        <div
          key={ind.label}
          className="bg-[#141416] border border-[#1F1F23] rounded-xl px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-3"
        >
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: ind.color, boxShadow: `0 0 6px ${ind.color}60` }}
          />
          <div className="min-w-0">
            <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.5)] truncate">
              {ind.label}
            </div>
            <div className="mono text-[12px] sm:text-[13px] text-[#E5E5E7] font-medium truncate">
              {ind.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── TopOfMind — Sprint 4 attention scoring ───────────────────────────────────

function useAttentionItems() {
  const [items, setItems] = useState<ScoredItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const scored = await scoreAttentionItems();
        if (!cancelled) {
          setItems(scored);
          // Infer calendar connectivity from returned items
          const hasCalendar = scored.some((i) => i.category === 'calendar');
          setCalendarConnected(hasCalendar);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  return { items, loading, calendarConnected };
}

const CATEGORY_COLORS: Record<ScoredItem['category'], string> = {
  escalation: '#EF4444',
  ingest: '#F59E0B',
  sprint: '#3B82F6',
  health: '#A78BFA',
  calendar: '#22C55E',
};

const CATEGORY_LABELS: Record<ScoredItem['category'], string> = {
  escalation: 'Escalation',
  ingest: 'Call',
  sprint: 'Sprint',
  health: 'Health',
  calendar: 'Calendar',
};

function TopOfMind() {
  const { items, loading, calendarConnected } = useAttentionItems();

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 bg-[#141416] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-4">
        <div className="mono text-[11px] text-[rgba(229,229,231,0.5)]">
          Nothing demanding attention right now.
        </div>
        {calendarConnected === false && (
          <div className="mono text-[10px] text-[rgba(229,229,231,0.35)] mt-1.5">
            Calendar not connected — Sprint 5
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          // Sprint 4 mobile: full width, comfortable padding
          className="w-full bg-[#141416] border border-[#1F1F23] rounded-xl px-4 sm:px-5 py-3 sm:py-4 hover:border-[#2A2A2E] transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                style={{ backgroundColor: CATEGORY_COLORS[item.category] }}
              />
              <div className="min-w-0">
                <div className="mono text-[13px] text-[#E5E5E7] truncate">{item.label}</div>
                {item.detail && (
                  <div className="mono text-[11px] text-[rgba(229,229,231,0.5)] mt-0.5 line-clamp-1">
                    {item.detail}
                  </div>
                )}
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  <span
                    className="mono text-[9px] uppercase tracking-[0.14em]"
                    style={{ color: CATEGORY_COLORS[item.category] }}
                  >
                    {CATEGORY_LABELS[item.category]}
                  </span>
                  {item.priority && (
                    <span className="mono text-[9px] uppercase tracking-[0.12em] text-[rgba(229,229,231,0.4)]">
                      {item.priority}
                    </span>
                  )}
                  {item.due_at && (
                    <span className="mono text-[9px] text-[rgba(229,229,231,0.4)]">
                      due {new Date(item.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                  <span className="mono text-[9px] text-[rgba(229,229,231,0.3)]">
                    score {item.score}
                  </span>
                </div>
              </div>
            </div>
            {/* Score badge */}
            <div
              className="shrink-0 mono text-[10px] px-2 py-0.5 rounded-md border"
              style={{
                color: CATEGORY_COLORS[item.category],
                borderColor: `${CATEGORY_COLORS[item.category]}40`,
                backgroundColor: `${CATEGORY_COLORS[item.category]}10`,
              }}
            >
              {item.score}
            </div>
          </div>
        </div>
      ))}
      {calendarConnected === false && (
        <div className="mono text-[9px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.25)] pt-1 pl-1">
          Calendar not connected — Sprint 5
        </div>
      )}
    </div>
  );
}

// ─── CalendarStub — Sprint 4 mobile-aware ─────────────────────────────────────

function CalendarStub() {
  return (
    <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-4 sm:px-5 py-4 sm:py-5">
      {/* Full calendar on sm+; just next event hint on xs */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-4 h-4 rounded border border-[#2A2A2E] flex items-center justify-center shrink-0">
          <div className="w-2 h-2 bg-[rgba(229,229,231,0.3)] rounded-sm" />
        </div>
        <div className="mono text-[11px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.5)]">
          {/* Mobile: abbreviated; sm+: full */}
          <span className="sm:hidden">Today</span>
          <span className="hidden sm:inline">Today's Calendar</span>
        </div>
      </div>

      {/* On xs: compact next-event stub */}
      <div className="sm:hidden mono text-[12px] text-[rgba(229,229,231,0.5)]">
        No upcoming events.
      </div>

      {/* On sm+: full placeholder */}
      <div className="hidden sm:block">
        <div className="mono text-[12px] text-[rgba(229,229,231,0.5)]">
          Connect Google Calendar to see today's events.
        </div>
        <div className="mono text-[9px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.3)] mt-2">
          Calendar integration — Sprint 5
        </div>
      </div>
    </div>
  );
}

// ─── YesterdayDigest — Sprint 4: explicit "No digest yet" ─────────────────────

function useYesterdayDigest() {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const yesterday = new Date(Date.now() - 86400000);
    const dateStr = yesterday.toISOString().split('T')[0];
    // Vault path: wiki/memory/analyst/YYYY-MM-DD.md
    const url = `https://raw.githubusercontent.com/freakngenius/unicron-knowledge/main/wiki/memory/analyst/${dateStr}.md`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) { setContent(text); setLoading(false); }
      })
      .catch(() => {
        // 404 or network failure → show "No digest yet" (not an error)
        if (!cancelled) { setContent(null); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, []);

  return { content, loading };
}

function YesterdayDigest() {
  const { content, loading } = useYesterdayDigest();

  if (loading) {
    return (
      <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-4 sm:px-5 py-4 sm:py-5">
        <div className="h-4 w-32 bg-[#1F1F23] rounded animate-pulse mb-2" />
        <div className="h-3 w-full bg-[#1A1A1D] rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-4 sm:px-5 py-4 sm:py-5">
      <div className="mono text-[11px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.5)] mb-3">
        Yesterday's Digest
      </div>
      {content ? (
        <div className="mono text-[12px] text-[rgba(229,229,231,0.8)] leading-relaxed whitespace-pre-line line-clamp-6">
          {content}
        </div>
      ) : (
        <div className="mono text-[12px] text-[rgba(229,229,231,0.5)]">
          No digest yet.
        </div>
      )}
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

function ActivityFeed() {
  const events = useActivityFeed();

  return (
    // Sprint 4 mobile: full width
    <div className="w-full bg-[#141416] border border-[#1F1F23] rounded-xl overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-[#1F1F23] flex items-center justify-between">
        <div className="mono text-[11px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.5)]">
          Live Activity
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
          <div className="mono text-[9px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.4)]">
            Live
          </div>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="px-4 sm:px-5 py-6 mono text-[11px] text-[rgba(229,229,231,0.4)]">
          Listening for activity… events will appear here in real time.
        </div>
      ) : (
        <div className="divide-y divide-[#1F1F23]">
          {events.map((evt) => (
            <div key={evt.id} className="px-4 sm:px-5 py-3 flex items-start gap-3">
              <div className="text-[14px] pt-0.5 shrink-0">
                {SOURCE_TYPE_ICONS[evt.source_type] ?? '⚡'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="mono text-[12px] text-[#E5E5E7] truncate">
                    {evt.content_summary ?? evt.source_type}
                    {(evt.count ?? 1) > 1 && (
                      <span className="ml-1.5 mono text-[10px] bg-[#1F1F23] text-[rgba(229,229,231,0.6)] px-1.5 py-0.5 rounded">
                        ×{evt.count}
                      </span>
                    )}
                  </div>
                  {/* Sprint 4 mobile: hide timestamps on xs */}
                  <div className="hidden sm:block mono text-[10px] text-[rgba(229,229,231,0.4)] shrink-0">
                    {formatRelativeTime(evt.created_at)}
                  </div>
                </div>
                <div className="mono text-[9px] uppercase tracking-[0.12em] text-[rgba(229,229,231,0.35)] mt-0.5">
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

// ─── HeroStrip — N-2: sentiment headline + context sentence ──────────────────

function HeroStrip() {
  const { agentStatus, agentCount, escalationCount, budgetPct, decayCount, loading } = usePulseData();

  const headline = loading
    ? ' '
    : escalationCount > 0
    ? 'There are escalations to address.'
    : budgetPct !== null && budgetPct > 80
    ? 'Budget pressure is high.'
    : agentStatus === 'red'
    ? 'The agent fleet needs attention.'
    : decayCount > 2
    ? 'Knowledge decay is accumulating.'
    : 'The company is calm.';

  const context = loading
    ? ''
    : ([
        agentCount > 0 ? `${agentCount} agent${agentCount !== 1 ? 's' : ''} active` : null,
        escalationCount > 0 ? `${escalationCount} escalation${escalationCount !== 1 ? 's' : ''}` : null,
        budgetPct !== null ? `budget at ${budgetPct}%` : null,
        decayCount > 0 ? `${decayCount} decay alert${decayCount !== 1 ? 's' : ''}` : null,
      ] as (string | null)[])
        .filter(Boolean)
        .join(' · ');

  return (
    <div className="w-full bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-4">
      <div
        className="mono font-medium text-[#E5E5E7] leading-tight mb-1"
        style={{ fontSize: 'clamp(16px, 3vw, 22px)' }}
      >
        {loading ? <span className="opacity-0">placeholder</span> : headline}
      </div>
      {context && (
        <div className="mono text-[12px] text-[rgba(229,229,231,0.5)]">{context}</div>
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
        <div className="flex gap-0.5 bg-[#141416] border border-[#1F1F23] rounded-lg p-0.5 mr-1">
          {(['1h', '24h', '7d', 'custom'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              className={`mono text-[10px] uppercase tracking-[0.12em] px-2.5 py-1 rounded transition-colors ${
                timeframe === t
                  ? 'bg-[#FF6B2B] text-white'
                  : 'text-[rgba(229,229,231,0.5)] hover:text-[rgba(229,229,231,0.8)]'
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
                ? 'border-[#FF6B2B] text-[#E5E5E7] bg-[#FF6B2B18]'
                : 'border-[#1F1F23] text-[rgba(229,229,231,0.4)] hover:text-[rgba(229,229,231,0.7)]'
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
                ? 'border-[#FF6B2B] text-[#E5E5E7] bg-[#FF6B2B18]'
                : 'border-[#1F1F23] text-[rgba(229,229,231,0.4)] hover:text-[rgba(229,229,231,0.7)]'
            }`}
          >
            {SOURCE_TYPE_ICONS[src] ?? '⚡'} {src}
          </button>
        ))}

        {/* DRI chip — Sprint 5+ */}
        <button
          disabled
          title="DRI filtering — Sprint 5"
          className="mono text-[10px] px-2.5 py-1 rounded-full border border-[#1F1F23] text-[rgba(229,229,231,0.2)] cursor-not-allowed"
        >
          DRI · Sprint 5
        </button>
      </div>

      {/* Feed */}
      <div className="bg-[#141416] border border-[#1F1F23] rounded-xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-[#1F1F23] flex items-center justify-between">
          <div className="mono text-[11px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.5)]">
            Activity Feed
          </div>
          <div className="flex items-center gap-3">
            <span className="mono text-[10px] text-[rgba(229,229,231,0.35)]">
              {filtered.length} event{filtered.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
              <span className="mono text-[9px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.4)]">Live</span>
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 sm:px-5 py-6 mono text-[11px] text-[rgba(229,229,231,0.4)]">
            No events matching the current filters.
          </div>
        ) : (
          <div className="divide-y divide-[#1F1F23]">
            {filtered.map((evt) => {
              const expanded = expandedId === evt.id;
              return (
                <div
                  key={evt.id}
                  className="cursor-pointer hover:bg-[#1A1A1D] transition-colors"
                  onClick={() => setExpandedId(expanded ? null : evt.id)}
                >
                  <div className="px-4 sm:px-5 py-3 flex items-start gap-3">
                    <div className="text-[14px] pt-0.5 shrink-0">
                      {SOURCE_TYPE_ICONS[evt.source_type] ?? '⚡'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="mono text-[12px] text-[#E5E5E7] truncate">
                          {evt.content_summary ?? evt.source_type}
                          {(evt.count ?? 1) > 1 && (
                            <span className="ml-1.5 mono text-[10px] bg-[#1F1F23] text-[rgba(229,229,231,0.6)] px-1.5 py-0.5 rounded">
                              ×{evt.count}
                            </span>
                          )}
                        </div>
                        <div className="mono text-[10px] text-[rgba(229,229,231,0.4)] shrink-0">
                          {formatRelativeTime(evt.created_at)}
                        </div>
                      </div>
                      <div className="mono text-[9px] uppercase tracking-[0.12em] text-[rgba(229,229,231,0.35)] mt-0.5">
                        {evt.source_type} · {evt.table}
                      </div>
                    </div>
                    <div className="mono text-[10px] text-[rgba(229,229,231,0.3)] shrink-0 pt-0.5">
                      {expanded ? '▾' : '▸'}
                    </div>
                  </div>

                  {expanded && (
                    <div className="px-4 sm:px-5 pb-3 bg-[#141416]">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 pl-7 pt-1">
                        <div>
                          <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.35)]">source</div>
                          <div className="mono text-[11px] text-[rgba(229,229,231,0.8)]">{evt.source_type}</div>
                        </div>
                        <div>
                          <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.35)]">surface</div>
                          <div className="mono text-[11px] text-[rgba(229,229,231,0.8)]">{evt.table}</div>
                        </div>
                        <div>
                          <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.35)]">count</div>
                          <div className="mono text-[11px] text-[rgba(229,229,231,0.8)]">{evt.count ?? 1}</div>
                        </div>
                        <div>
                          <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.35)]">timestamp</div>
                          <div className="mono text-[11px] text-[rgba(229,229,231,0.8)]">
                            {new Date(evt.created_at).toLocaleString()}
                          </div>
                        </div>
                        {evt.content_summary && (
                          <div className="col-span-2">
                            <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.35)]">payload</div>
                            <div className="mono text-[11px] text-[rgba(229,229,231,0.8)] mt-0.5 break-all leading-relaxed">
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

// ─── GlobalSearch stub ────────────────────────────────────────────────────────

function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center pt-[15vh] px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#141416] border border-[#2A2A2E] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1F1F23]">
          <div className="mono text-[rgba(229,229,231,0.4)]">⌘</div>
          <input
            autoFocus
            placeholder="Search coming in Sprint 3…"
            className="flex-1 bg-transparent mono text-[14px] text-[#E5E5E7] placeholder:text-[rgba(229,229,231,0.3)] outline-none"
            readOnly
          />
          <button
            onClick={onClose}
            className="mono text-[10px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.5)] hover:text-[#E5E5E7] transition-colors"
          >
            esc
          </button>
        </div>
        <div className="px-5 py-6 text-center">
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.4)] mb-2">
            Search not yet implemented
          </div>
          <div className="mono text-[10px] text-[rgba(229,229,231,0.3)]">
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
const PRODUCTIVITY_SLUGS = new Set(['morning-brief', 'inbox-triage']);

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

  const byDomain = skills.reduce<Record<string, SkillRow[]>>((acc, s) => {
    (acc[s.domain] ??= []).push(s);
    return acc;
  }, {});

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
        headers: { 'Content-Type': 'application/json' },
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

    // quick-capture: UI trigger — open the modal directly, no API call
    if (skill.name === 'quick-capture' || skill.config?.ui_trigger === true) {
      onOpenQuickCapture?.();
      return;
    }

    // Sprint 5: scaffolded skills — do nothing (button is disabled in the UI)
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
          headers: { 'Content-Type': 'application/json' },
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

    // Default: route to legacy /api/skills/dispatch
    const prompt = skill.name;
    setState((s) => ({
      ...s,
      prompt,
      running: true,
      runningSlug: skill.name,
      result: null,
      error: null,
      triageItems: null,
      triageMessage: null,
    }));
    try {
      const res = await fetch('/api/skills/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_name: skill.name, prompt }),
      });
      const json: { status?: string; sprint?: number } = await res.json().catch(() => ({}));
      setState((s) => ({
        ...s,
        running: false,
        runningSlug: null,
        result: json.status ?? 'dispatched',
      }));
    } catch (e) {
      setState((s) => ({
        ...s,
        running: false,
        runningSlug: null,
        error: e instanceof Error ? e.message : 'Unknown error',
      }));
    }
  }

  async function handleRun(skillName?: string) {
    const prompt = skillName ?? state.prompt;
    if (!prompt.trim() || state.running) return;
    if (skillName) setState((s) => ({ ...s, prompt: skillName }));
    setState((s) => ({
      ...s,
      running: true,
      runningSlug: skillName ?? null,
      result: null,
      error: null,
      triageItems: null,
      triageMessage: null,
    }));
    try {
      const res = await fetch('/api/skills/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_name: skillName ?? null, prompt }),
      });
      const json: { status?: string; sprint?: number } = await res.json().catch(() => ({}));
      setState((s) => ({
        ...s,
        running: false,
        runningSlug: null,
        result: json.status ?? 'dispatched',
      }));
    } catch (e) {
      setState((s) => ({
        ...s,
        running: false,
        runningSlug: null,
        error: e instanceof Error ? e.message : 'Unknown error',
      }));
    }
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
    <div className="bg-[#141416] border border-[#1F1F23] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 py-4 border-b border-[#1F1F23]">
        <div className="mono text-[10px] uppercase tracking-[0.22em] text-[rgba(229,229,231,0.4)]">
          Run a Skill to Begin
        </div>
        <div className="mono text-[9px] text-[rgba(229,229,231,0.3)] mt-0.5">
          Click a skill · press run · or type any prompt
        </div>
      </div>

      {/* Prompt area */}
      <div className="px-4 sm:px-5 py-4 border-b border-[#1F1F23]">
        <div className="flex gap-2">
          <textarea
            value={state.prompt}
            onChange={(e) => setState((s) => ({ ...s, prompt: e.target.value }))}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want the system to do…"
            rows={3}
            className="flex-1 bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2 mono text-[13px] text-[#E5E5E7] placeholder:text-[rgba(229,229,231,0.3)] focus:outline-none focus:border-[#2A2A2E] resize-none"
          />
          <div className="flex flex-col gap-2">
            <button
              onClick={() => void handleRun()}
              disabled={!state.prompt.trim() || state.running}
              className="mono text-[11px] uppercase tracking-[0.14em] bg-[#FF6B2B] text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-[#e55a1a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {state.running ? '…' : 'Run →'}
            </button>
            <button
              onClick={clearState}
              className="mono text-[11px] uppercase tracking-[0.14em] px-3 sm:px-4 py-2 rounded-lg border border-[#1F1F23] text-[rgba(229,229,231,0.5)] hover:text-[#E5E5E7] hover:border-[#2A2A2E] transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Morning Brief result — preformatted message */}
        {state.result && (
          <div className="mt-3 bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2">
            <div className="mono text-[10px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.5)] mb-1">Result</div>
            <div className="mono text-[12px] text-[#E5E5E7] whitespace-pre-wrap">{state.result}</div>
          </div>
        )}

        {/* Inbox Triage result — ordered list */}
        {state.triageItems !== null && (
          <div className="mt-3 bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2">
            <div className="mono text-[10px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.5)] mb-2">
              Inbox Triage — Top {state.triageItems.length} Items
            </div>
            {state.triageMessage && state.triageItems.length === 0 ? (
              <div className="mono text-[12px] text-[rgba(229,229,231,0.5)]">{state.triageMessage}</div>
            ) : (
              <div className="space-y-2">
                {state.triageItems.map((item, idx) => (
                  <div key={item.id} className="flex items-start gap-2">
                    <div className="mono text-[9px] text-[rgba(229,229,231,0.35)] w-4 shrink-0 pt-0.5">
                      {idx + 1}.
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mono text-[12px] text-[#E5E5E7] truncate">
                        {item.content_summary ?? `(${item.source_type} · no summary)`}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="mono text-[9px] uppercase tracking-[0.1em] text-[rgba(229,229,231,0.4)]">
                          {item.source_type}
                        </span>
                        <span className="mono text-[9px] text-[rgba(229,229,231,0.3)]">
                          score {item.score.toFixed(2)}
                        </span>
                        <span className="mono text-[9px] text-[rgba(229,229,231,0.3)]">
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
          <div className="mt-3 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg px-3 py-2">
            <div className="mono text-[11px] text-[#EF4444]">{state.error}</div>
          </div>
        )}
      </div>

      {/* Domain grid — DB-registered skills */}
      <div className="px-4 sm:px-5 py-4 space-y-4">
        {Object.entries(byDomain).map(([domain, domainSkills]) => (
          <div key={domain}>
            <div className="mono text-[9px] uppercase tracking-[0.22em] text-[rgba(229,229,231,0.35)] mb-2">
              {domain}:
            </div>
            {/* 2-col mobile, 3-col sm, 4-col lg */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
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
                      'text-left px-3 py-2 rounded-lg border mono text-[11px] tracking-[0.08em] transition-colors',
                      isThisRunning
                        ? 'border-[#FF6B2B] text-[#FF6B2B] opacity-70 cursor-wait'
                        : isScaffolded
                        ? 'border-[#1F1F23] text-[rgba(229,229,231,0.25)] cursor-not-allowed opacity-60'
                        : 'border-[#2A2A2E] text-[#E5E5E7] hover:border-[#FF6B2B] hover:text-[#FF6B2B] cursor-pointer',
                      isDisabled && !isThisRunning && !isScaffolded
                        ? 'disabled:opacity-50 disabled:cursor-not-allowed'
                        : '',
                    ].join(' ')}
                  >
                    {isThisRunning ? '…' : formatSkillName(skill.name)}
                    {isScaffolded && (
                      <span className="ml-1 mono text-[8px] text-[rgba(229,229,231,0.2)]">
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
              <div className="mono text-[9px] uppercase tracking-[0.22em] text-[rgba(229,229,231,0.25)] mb-2">
                {domain.label}:
              </div>
              {/* 2-col mobile, 3-col sm, 4-col lg */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                {unstubbed.map((skillName) => (
                  <button
                    key={skillName}
                    disabled
                    title={`Coming in Sprint ${domain.sprint}`}
                    className="text-left px-3 py-2 rounded-lg border mono text-[11px] tracking-[0.08em] transition-colors border-[#1F1F23] text-[rgba(229,229,231,0.25)] cursor-not-allowed"
                  >
                    {skillName}
                    <span className="ml-1 mono text-[8px] text-[rgba(229,229,231,0.2)]">
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
      <div className="px-4 sm:px-5 py-3 border-t border-[#1F1F23] flex items-center gap-4 sm:gap-6">
        {[
          { label: 'Registered', value: skills.length > 0 ? String(skills.length) : '—' },
          { label: 'Recent Runs', value: '—' },
          { label: 'Vault Pulse', value: '—' },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="mono text-[9px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.3)]">
              {stat.label}
            </div>
            <div className="mono text-[11px] text-[rgba(229,229,231,0.4)]">{stat.value}</div>
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
          <div className="relative bg-[#141416] border border-[#2A2A2E] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1F1F23]">
              <div>
                <div className="mono text-[12px] text-[#E5E5E7] font-medium">
                  {formatSkillName(modal.skill.name)}
                </div>
                <div className="mono text-[10px] text-[rgba(229,229,231,0.4)] mt-0.5 line-clamp-1">
                  {modal.skill.description}
                </div>
              </div>
              <button
                onClick={() => setModal({ open: false })}
                className="mono text-[10px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.5)] hover:text-[#E5E5E7] transition-colors ml-4"
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
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.5)] block mb-1.5">
                      Topic *
                    </label>
                    <textarea
                      autoFocus
                      required
                      rows={3}
                      placeholder="What should the system research? Be specific."
                      value={modal.topic ?? ''}
                      onChange={(e) => setModal((m) => m.open ? { ...m, topic: e.target.value } : m)}
                      className="w-full bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2 mono text-[13px] text-[#E5E5E7] placeholder:text-[rgba(229,229,231,0.3)] focus:outline-none focus:border-[#2A2A2E] resize-none"
                    />
                  </div>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.5)] block mb-1.5">
                      Depth
                    </label>
                    <select
                      value={modal.depth ?? 'standard'}
                      onChange={(e) => setModal((m) => m.open ? { ...m, depth: e.target.value } : m)}
                      className="w-full bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2 mono text-[13px] text-[#E5E5E7] focus:outline-none focus:border-[#2A2A2E]"
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
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.5)] block mb-1.5">
                      Question *
                    </label>
                    <textarea
                      autoFocus
                      required
                      rows={3}
                      placeholder="What question or decision should the council deliberate on?"
                      value={modal.question ?? ''}
                      onChange={(e) => setModal((m) => m.open ? { ...m, question: e.target.value } : m)}
                      className="w-full bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2 mono text-[13px] text-[#E5E5E7] placeholder:text-[rgba(229,229,231,0.3)] focus:outline-none focus:border-[#2A2A2E] resize-none"
                    />
                  </div>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.5)] block mb-1.5">
                      Evaluation Criteria (optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. speed, cost, risk, market fit"
                      value={modal.criteria ?? ''}
                      onChange={(e) => setModal((m) => m.open ? { ...m, criteria: e.target.value } : m)}
                      className="w-full bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2 mono text-[13px] text-[#E5E5E7] placeholder:text-[rgba(229,229,231,0.3)] focus:outline-none focus:border-[#2A2A2E]"
                    />
                  </div>
                </>
              )}

              {/* track-pipeline-stage fields */}
              {modal.skill.name === 'track-pipeline-stage' && (
                <>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.5)] block mb-1.5">
                      Customer ID *
                    </label>
                    <input
                      autoFocus
                      required
                      type="text"
                      placeholder="UUID of the customer record"
                      value={modal.customerId ?? ''}
                      onChange={(e) => setModal((m) => m.open ? { ...m, customerId: e.target.value } : m)}
                      className="w-full bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2 mono text-[13px] text-[#E5E5E7] placeholder:text-[rgba(229,229,231,0.3)] focus:outline-none focus:border-[#2A2A2E] font-mono"
                    />
                  </div>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.5)] block mb-1.5">
                      New Stage *
                    </label>
                    <select
                      required
                      value={modal.newStage ?? 'qualified'}
                      onChange={(e) => setModal((m) => m.open ? { ...m, newStage: e.target.value } : m)}
                      className="w-full bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2 mono text-[13px] text-[#E5E5E7] focus:outline-none focus:border-[#2A2A2E]"
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
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.5)] block mb-1.5">
                      Note (optional)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="What happened? Any context for this stage change."
                      value={modal.note ?? ''}
                      onChange={(e) => setModal((m) => m.open ? { ...m, note: e.target.value } : m)}
                      className="w-full bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2 mono text-[13px] text-[#E5E5E7] placeholder:text-[rgba(229,229,231,0.3)] focus:outline-none focus:border-[#2A2A2E] resize-none"
                    />
                  </div>
                </>
              )}

              {/* draft-blog-post fields */}
              {modal.skill.name === 'draft-blog-post' && (
                <>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.5)] block mb-1.5">
                      Topic *
                    </label>
                    <textarea
                      autoFocus
                      required
                      rows={2}
                      placeholder="e.g. How surveillance operators can win more bids with procurement intelligence"
                      value={modal.topic ?? ''}
                      onChange={(e) => setModal((m) => m.open ? { ...m, topic: e.target.value } : m)}
                      className="w-full bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2 mono text-[13px] text-[#E5E5E7] placeholder:text-[rgba(229,229,231,0.3)] focus:outline-none focus:border-[#2A2A2E] resize-none"
                    />
                  </div>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.5)] block mb-1.5">
                      Target Audience (optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. construction security buyers, investors"
                      value={modal.targetAudience ?? ''}
                      onChange={(e) => setModal((m) => m.open ? { ...m, targetAudience: e.target.value } : m)}
                      className="w-full bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2 mono text-[13px] text-[#E5E5E7] placeholder:text-[rgba(229,229,231,0.3)] focus:outline-none focus:border-[#2A2A2E]"
                    />
                  </div>
                </>
              )}

              {/* draft-social-post fields */}
              {modal.skill.name === 'draft-social-post' && (
                <>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.5)] block mb-1.5">
                      Topic / Milestone *
                    </label>
                    <textarea
                      autoFocus
                      required
                      rows={2}
                      placeholder="e.g. We just shipped procurement signal scoring for Zedcor"
                      value={modal.topic ?? ''}
                      onChange={(e) => setModal((m) => m.open ? { ...m, topic: e.target.value } : m)}
                      className="w-full bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2 mono text-[13px] text-[#E5E5E7] placeholder:text-[rgba(229,229,231,0.3)] focus:outline-none focus:border-[#2A2A2E] resize-none"
                    />
                  </div>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.5)] block mb-1.5">
                      Platform
                    </label>
                    <select
                      value={modal.platform ?? 'both'}
                      onChange={(e) => setModal((m) => m.open ? { ...m, platform: e.target.value } : m)}
                      className="w-full bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2 mono text-[13px] text-[#E5E5E7] focus:outline-none focus:border-[#2A2A2E]"
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
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.5)] block mb-1.5">
                      Audience Segment *
                    </label>
                    <input
                      autoFocus
                      required
                      type="text"
                      placeholder="e.g. construction security buyers, municipal procurement officers"
                      value={modal.audience ?? ''}
                      onChange={(e) => setModal((m) => m.open ? { ...m, audience: e.target.value } : m)}
                      className="w-full bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2 mono text-[13px] text-[#E5E5E7] placeholder:text-[rgba(229,229,231,0.3)] focus:outline-none focus:border-[#2A2A2E]"
                    />
                  </div>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.5)] block mb-1.5">
                      Product
                    </label>
                    <select
                      value={modal.product ?? 'pathfinder'}
                      onChange={(e) => setModal((m) => m.open ? { ...m, product: e.target.value } : m)}
                      className="w-full bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2 mono text-[13px] text-[#E5E5E7] focus:outline-none focus:border-[#2A2A2E]"
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
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.5)] block mb-1.5">
                      Page Slug *
                    </label>
                    <input
                      autoFocus
                      required
                      type="text"
                      placeholder="e.g. why-we-build, seven-generations, operating-principles"
                      value={modal.pageSlug ?? ''}
                      onChange={(e) => setModal((m) => m.open ? { ...m, pageSlug: e.target.value } : m)}
                      className="w-full bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2 mono text-[13px] text-[#E5E5E7] placeholder:text-[rgba(229,229,231,0.3)] focus:outline-none focus:border-[#2A2A2E]"
                    />
                  </div>
                  <div>
                    <label className="mono text-[9px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.5)] block mb-1.5">
                      Proposed Changes *
                    </label>
                    <textarea
                      required
                      rows={3}
                      placeholder="Describe what to add, remove, or reframe — e.g. 'Add a paragraph about Zedcor pilot outcomes to the proof section'"
                      value={modal.proposedChanges ?? ''}
                      onChange={(e) => setModal((m) => m.open ? { ...m, proposedChanges: e.target.value } : m)}
                      className="w-full bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2 mono text-[13px] text-[#E5E5E7] placeholder:text-[rgba(229,229,231,0.3)] focus:outline-none focus:border-[#2A2A2E] resize-none"
                    />
                  </div>
                </>
              )}

              {/* Modal actions */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setModal({ open: false })}
                  className="mono text-[11px] uppercase tracking-[0.14em] px-4 py-2 rounded-lg border border-[#1F1F23] text-[rgba(229,229,231,0.5)] hover:text-[#E5E5E7] hover:border-[#2A2A2E] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="mono text-[11px] uppercase tracking-[0.14em] bg-[#FF6B2B] text-white px-4 py-2 rounded-lg hover:bg-[#e55a1a] transition-colors"
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

// ─── N-1 Right rail panels ────────────────────────────────────────────────────

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex-1 flex items-end" style={{ height: 32 }}>
      <div className="w-full rounded-sm" style={{ height: `${Math.max(4, pct)}%`, background: color }} />
    </div>
  );
}

function BarChart({ data, color, labels }: { data: number[]; color: string; labels?: string[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-0.5" style={{ height: 32 }}>
      {data.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
          <MiniBar value={v} max={max} color={color} />
          {labels && <span className="mono text-[8px] text-text-secondary">{labels[i]}</span>}
        </div>
      ))}
    </div>
  );
}

function DistBar({ label, percent, color }: { label: string; percent: number; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="mono text-[11px] text-text-secondary">{label}</span>
        <span className="mono text-[11px] text-text-primary">{percent}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-bg-raised overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: color }} />
      </div>
    </div>
  );
}

function ForecastPanel() {
  return (
    <div className="bg-bg-card border border-border-default rounded-xl p-4">
      <div className="mono text-[12px] font-semibold text-text-primary mb-0.5">Forecast</div>
      <div className="mono text-[10px] text-text-secondary mb-3">Next 7 days</div>
      <div className="flex flex-col gap-4">
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="mono text-[11px] text-text-secondary">Calls scheduled</span>
            <span className="mono text-[11px] text-text-primary">11</span>
          </div>
          <BarChart data={[2,1,3,2,1,1,1]} color="#60a5fa" labels={['W','T','F','S','S','M','T']} />
        </div>
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="mono text-[11px] text-text-secondary">Renewal exposure</span>
            <span className="mono text-[11px] text-text-primary">$48k</span>
          </div>
          <BarChart data={[0,12,0,0,18,0,18]} color="#f59e0b" />
        </div>
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="mono text-[11px] text-text-secondary">Action items due</span>
            <span className="mono text-[11px] text-text-primary">9</span>
          </div>
          <BarChart data={[1,3,2,0,0,2,1]} color="#e8763a" />
        </div>
      </div>
    </div>
  );
}

const RECENT_AGENT_RUNS = [
  { name: 'Customer health sweep', status: 'ok',   t: '03:00', dur: '1m 12s' },
  { name: 'Daily digest',          status: 'ok',   t: '07:00', dur: '8s'     },
  { name: 'Inbox triage',          status: 'ok',   t: '07:14', dur: '22s'    },
  { name: 'Lead surface',          status: 'warn', t: '08:30', dur: '2m 04s' },
  { name: 'Calendar sweep',        status: 'ok',   t: '09:00', dur: '4s'     },
];

function RecentRunsPanel() {
  return (
    <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border-subtle">
        <div className="mono text-[12px] font-semibold text-text-primary">Recent runs</div>
        <div className="mono text-[10px] text-text-secondary">Last 5 skill executions</div>
      </div>
      {RECENT_AGENT_RUNS.map((r, i) => (
        <div key={i} className={`flex items-center gap-2.5 px-4 py-2 ${i > 0 ? 'border-t border-border-subtle' : ''}`}>
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{
            background: r.status === 'ok' ? '#22c55e' : '#f59e0b',
          }} />
          <span className="mono text-[11.5px] text-text-primary flex-1 truncate">{r.name}</span>
          <span className="mono text-[10.5px] text-text-secondary">{r.t}</span>
          <span className="mono text-[10.5px] text-text-secondary min-w-[44px] text-right">{r.dur}</span>
        </div>
      ))}
    </div>
  );
}

function VaultPulse() {
  return (
    <div className="bg-bg-card border border-border-default rounded-xl p-4">
      <div className="mono text-[12px] font-semibold text-text-primary mb-0.5">Vault pulse</div>
      <div className="mono text-[10px] text-text-secondary mb-3">Knowledge health</div>
      <div className="flex items-baseline justify-between mb-3">
        <span className="mono text-[11px] text-text-secondary">Total documents</span>
        <span className="mono text-[11px] text-text-primary">1,247</span>
      </div>
      <div className="flex flex-col gap-2.5">
        <DistBar label="Fresh (≤30d)"   percent={62} color="#22c55e" />
        <DistBar label="Aging (30–90d)" percent={26} color="#f59e0b" />
        <DistBar label="Decaying (90+)" percent={12} color="#ef4444" />
      </div>
      <div className="flex justify-between items-baseline mt-3 pt-2.5 border-t border-border-subtle">
        <span className="mono text-[10.5px] text-text-secondary">Embed coverage</span>
        <span className="mono text-[10.5px] text-[#22c55e]">98.3%</span>
      </div>
    </div>
  );
}

// ─── Now (main export) ────────────────────────────────────────────────────────

interface Props {
  name: string;
}

export function Now({ name }: Props) {
  const auth = useAuth();
  const time = useLocalTime();
  const [nowTab, setNowTab] = useState<NowTab>('overview');
  const [searchOpen, setSearchOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [teamMemberId, setTeamMemberId] = useState<string | null>(null);

  // Resolve team_member id from auth email
  useEffect(() => {
    if (auth.status !== 'signed-in') return;
    const email = auth.user.email;
    if (!email) return;
    const sb = getSupabase();
    sb
      .schema('nervous_system')
      .from('team_members')
      .select('id')
      .eq('email', email)
      .maybeSingle()
      .then(({ data }) => setTeamMemberId(data?.id ?? null));
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
      {/* N-4: sub-tab nav */}
      <div className="flex gap-0.5 mb-5 border-b border-[#1F1F23] -mt-1">
        {(['overview', 'activity'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setNowTab(tab)}
            className={`mono text-[11px] uppercase tracking-[0.16em] px-4 py-2 border-b-2 transition-colors ${
              nowTab === tab
                ? 'border-[#FF6B2B] text-[#E5E5E7]'
                : 'border-transparent text-[rgba(229,229,231,0.4)] hover:text-[rgba(229,229,231,0.7)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* N-4: Activity sub-tab — full width, no rail */}
      {nowTab === 'activity' && (
        <div className="px-2 sm:px-0">
          <ActivityTab />
        </div>
      )}

      {/* N-1: two-column grid at ≥1024px (Overview tab) */}
      {nowTab === 'overview' && (
      <div className="now-layout grid gap-5" style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px', alignItems: 'start' }}>
        <style>{`
          @media (max-width: 1023px) { .now-layout { grid-template-columns: 1fr !important; } .now-rail { display: none !important; } }
        `}</style>

        {/* LEFT column */}
        <div className="flex flex-col gap-6 min-w-0 px-2 sm:px-0">
          {/* ─── Top bar row ─── */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mono text-[10px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.5)] mb-1">
                {formatDate()} · {time}
              </div>
              <h1 className="text-[20px] sm:text-[26px] font-semibold text-[#E5E5E7] tracking-tight leading-tight">
                {greeting(name)}
              </h1>
            </div>

            <div className="flex items-center gap-2 shrink-0 pt-1">
              <button
                onClick={() => setSearchOpen(true)}
                title="Search (/ or ⌘K)"
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-[#141416] border border-[#1F1F23] rounded-lg hover:border-[#2A2A2E] transition-colors group"
              >
                <span className="mono text-[12px] text-[rgba(229,229,231,0.5)] group-hover:text-[#E5E5E7]">
                  ⌘K
                </span>
              </button>
              <button
                onClick={() => setCaptureOpen(true)}
                title="Quick Capture"
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-[#FF6B2B] rounded-lg hover:bg-[#e55a1a] transition-colors"
              >
                <span className="mono text-[11px] uppercase tracking-[0.12em] text-white">+ Capture</span>
              </button>
            </div>
          </div>

          {/* ─── N-2: Hero strip ─── */}
          <HeroStrip />

          {/* ─── Status Pulse ─── */}
          <section>
            <SectionLabel>System Status</SectionLabel>
            <StatusPulse />
          </section>

          {/* ─── Top of Mind ─── */}
          <section>
            <SectionLabel>Top of Mind</SectionLabel>
            <TopOfMind />
          </section>

          {/* ─── Calendar + Digest ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section>
              <SectionLabel>Today</SectionLabel>
              <CalendarStub />
            </section>
            <section>
              <SectionLabel>Yesterday</SectionLabel>
              <YesterdayDigest />
            </section>
          </div>

          {/* ─── Activity Feed ─── */}
          <section>
            <SectionLabel>Live Activity</SectionLabel>
            <ActivityFeed />
          </section>

          {/* ─── Skills Surface ─── */}
          <section className="mb-24 sm:mb-8">
            <SectionLabel>Skills</SectionLabel>
            <SkillsSurface onOpenQuickCapture={() => setCaptureOpen(true)} />
          </section>
        </div>

        {/* RIGHT rail (320px, hidden < 1024px) */}
        <div className="now-rail flex flex-col gap-4 sticky top-0 pt-2">
          <ForecastPanel />
          <RecentRunsPanel />
          <VaultPulse />
        </div>
      </div>
      )}

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
        className="sm:hidden fixed bottom-4 right-4 z-50 flex items-center gap-1.5 px-4 py-3 bg-[#FF6B2B] rounded-2xl shadow-lg hover:bg-[#e55a1a] transition-colors"
        aria-label="Quick Capture"
      >
        <span className="mono text-[11px] uppercase tracking-[0.12em] text-white">+ Capture</span>
      </button>

      {/* ─── Toast ─── */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 mono text-[11px] uppercase tracking-[0.18em] text-white bg-[#141416] border border-[#2A2A2E] rounded-lg px-4 py-2 z-[200] pointer-events-none animate-toastUp">
          {toast}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono text-[9px] uppercase tracking-[0.22em] text-[rgba(229,229,231,0.35)] mb-2">
      {children}
    </div>
  );
}
