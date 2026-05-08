// Atrium Now tab — Sprint 4 Stream C upgrade.
//
// Upgrades over Sprint 2:
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
  type KeyboardEvent,
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

interface SkillRow {
  id: string;
  name: string;
  description: string;
  domain: string;
  active: boolean;
  refusal_gate: boolean;
}

interface FeedEvent {
  id: string;
  source_type: string;
  content_summary: string | null;
  created_at: string;
  count: number;
  table: 'ledger' | 'audit_log';
}

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

interface SkillDispatchState {
  prompt: string;
  result: string | null;
  running: boolean;
  error: string | null;
}

const FUTURE_SKILL_STUBS: { label: string; key: string; names: string[]; sprint: number }[] = [
  {
    label: 'Productivity',
    key: 'productivity',
    names: ['Morning Brief', 'Inbox Triage', 'Quick Capture'],
    sprint: 3,
  },
  {
    label: 'Research',
    key: 'research',
    names: ['Deep Research', 'LightRAG Query', 'Morning Trend'],
    sprint: 3,
  },
  {
    label: 'Discovery',
    key: 'discovery',
    names: ['Schedule Call', 'Extract Signals'],
    sprint: 4,
  },
  {
    label: 'Sales',
    key: 'sales',
    names: ['Pipeline Stage', 'Generate Proposal'],
    sprint: 4,
  },
  {
    label: 'Marketing',
    key: 'marketing',
    names: ['Blog Post', 'Social Post'],
    sprint: 6,
  },
];

function formatSkillName(name: string): string {
  return name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function useSkills() {
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

function SkillsSurface() {
  const skills = useSkills();
  const [state, setState] = useState<SkillDispatchState>({
    prompt: '',
    result: null,
    running: false,
    error: null,
  });

  const byDomain = skills.reduce<Record<string, SkillRow[]>>((acc, s) => {
    (acc[s.domain] ??= []).push(s);
    return acc;
  }, {});

  const registeredNames = new Set(skills.map((s) => s.name));

  async function handleRun(skillName?: string) {
    const prompt = skillName ?? state.prompt;
    if (!prompt.trim() || state.running) return;
    if (skillName) setState((s) => ({ ...s, prompt: skillName }));
    setState((s) => ({ ...s, running: true, result: null, error: null }));
    try {
      const res = await fetch('/api/skills/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_name: skillName ?? null, prompt }),
      });
      const json: { status?: string; sprint?: number } = await res.json().catch(() => ({}));
      setState((s) => ({ ...s, running: false, result: json.status ?? 'dispatched' }));
    } catch (e) {
      setState((s) => ({
        ...s,
        running: false,
        error: e instanceof Error ? e.message : 'Unknown error',
      }));
    }
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
              onClick={() => setState({ prompt: '', result: null, running: false, error: null })}
              className="mono text-[11px] uppercase tracking-[0.14em] px-3 sm:px-4 py-2 rounded-lg border border-[#1F1F23] text-[rgba(229,229,231,0.5)] hover:text-[#E5E5E7] hover:border-[#2A2A2E] transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
        {state.result && (
          <div className="mt-3 bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2">
            <div className="mono text-[10px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.5)] mb-1">Result</div>
            <div className="mono text-[12px] text-[#E5E5E7]">{state.result}</div>
          </div>
        )}
        {state.error && (
          <div className="mt-3 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg px-3 py-2">
            <div className="mono text-[11px] text-[#EF4444]">{state.error}</div>
          </div>
        )}
      </div>

      {/* Domain grid — Sprint 4: 2-col on mobile, up to 4-col on desktop */}
      <div className="px-4 sm:px-5 py-4 space-y-4">
        {Object.entries(byDomain).map(([domain, domainSkills]) => (
          <div key={domain}>
            <div className="mono text-[9px] uppercase tracking-[0.22em] text-[rgba(229,229,231,0.35)] mb-2">
              {domain}:
            </div>
            {/* 2-col mobile, 3-col sm, 4-col lg */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
              {domainSkills.map((skill) => (
                <button
                  key={skill.id}
                  title={skill.description}
                  onClick={() => void handleRun(skill.name)}
                  disabled={state.running}
                  className="text-left px-3 py-2 rounded-lg border mono text-[11px] tracking-[0.08em] transition-colors border-[#2A2A2E] text-[#E5E5E7] hover:border-[#FF6B2B] hover:text-[#FF6B2B] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {formatSkillName(skill.name)}
                  {skill.refusal_gate && (
                    <span
                      className="ml-1 mono text-[8px] text-orange-400"
                      title="Requires human approval before running"
                    >
                      &#x1F6E1;
                    </span>
                  )}
                </button>
              ))}
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
    <div className="relative max-w-3xl w-full mx-auto px-2 sm:px-0">
      {/* ─── Top bar row ─── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.5)] mb-1">
            {formatDate()} · {time}
          </div>
          <h1 className="text-[20px] sm:text-[26px] font-semibold text-[#E5E5E7] tracking-tight leading-tight">
            {greeting(name)}
          </h1>
        </div>

        {/* Search button (sm+); capture always visible */}
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
          {/* Sprint 4 mobile: capture button is static in header (fixed FAB added below for mobile) */}
          <button
            onClick={() => setCaptureOpen(true)}
            title="Quick Capture"
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-[#FF6B2B] rounded-lg hover:bg-[#e55a1a] transition-colors"
          >
            <span className="mono text-[11px] uppercase tracking-[0.12em] text-white">+ Capture</span>
          </button>
        </div>
      </div>

      {/* ─── Status Pulse ─── */}
      <section className="mb-6">
        <SectionLabel>System Status</SectionLabel>
        <StatusPulse />
      </section>

      {/* ─── Top of Mind — attention scored ─── */}
      <section className="mb-6">
        <SectionLabel>Top of Mind</SectionLabel>
        {/* Pass teamMemberId for future DRI-scoped filtering; scorer is user-agnostic for now */}
        <TopOfMind />
      </section>

      {/* ─── Calendar + Digest side-by-side on md+; stacked on mobile ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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
      <section className="mb-6">
        <SectionLabel>Live Activity</SectionLabel>
        <ActivityFeed />
      </section>

      {/* ─── Skills Surface ─── */}
      {/* Sprint 4 mobile: extra bottom margin to clear the FAB */}
      <section className="mb-24 sm:mb-8">
        <SectionLabel>Skills</SectionLabel>
        <SkillsSurface />
      </section>

      {/* ─── Modals ─── */}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <QuickCapture
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onToast={showToast}
        teamMemberId={teamMemberId}
      />

      {/* ─── Mobile FAB: fixed bottom-right quick capture ─── */}
      {/* Sprint 4: fixed on mobile (sm:hidden), static in header on desktop */}
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
