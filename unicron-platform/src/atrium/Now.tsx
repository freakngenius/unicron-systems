// Atrium Now tab — Sprint 2 live implementation.
//
// Components:
//  1. Header — greeting, date, local time
//  2. StatusPulse — 4 indicators: agent fleet, escalations, budget burn, decay alerts
//  3. TopOfMind — up to 5 action_items for current user
//  4. CalendarStub — placeholder until Sprint 5
//  5. YesterdayDigest — attempts GitHub wiki read; placeholder if 404
//  6. ActivityFeed — Realtime sub on ledger + audit_log, throttled + deduped
//  7. GlobalSearch — cmd+k stub modal
//  8. QuickCaptureButton + QuickCapture modal
//  9. SkillsSurface — 7-domain skills grid, all disabled Sprint 2

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentRow {
  id: string;
  name: string;
  active: boolean;
  budget: { limit_usd_per_period: number; current_spent_usd: number } | null;
}

interface ActionItemRow {
  id: string;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | 'irreversible';
  due_at: string | null;
  status: 'open' | 'in_progress' | 'done' | 'blocked' | 'broken_off';
  break_off_signal_id: string | null;
  dri: string | null;
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

const THROTTLE_MS = 30_000;
const DEDUPE_WINDOW_MS = 5 * 60_000;
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

function priorityOrder(p: ActionItemRow['priority']): number {
  return { irreversible: 0, high: 1, medium: 2, low: 3 }[p];
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

// ─── StatusPulse ──────────────────────────────────────────────────────────────

interface PulseData {
  agentStatus: 'green' | 'yellow' | 'red' | 'loading';
  escalationCount: number;
  budgetPct: number | null;
  decayCount: number;
  loading: boolean;
}

function usePulseData(): PulseData {
  const [data, setData] = useState<PulseData>({
    agentStatus: 'loading',
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
        // Agent fleet health
        const { data: agents } = await sb
          .schema('nervous_system')
          .from('agents')
          .select('id, name, active, budget')
          .returns<AgentRow[]>();

        // Escalations: open action_items with irreversible priority or break_off_signal
        const { count: escalationCount } = await sb
          .schema('nervous_system')
          .from('action_items')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'open')
          .or('priority.eq.irreversible,break_off_signal_id.not.is.null');

        // Decay alerts: signals active but not touched in 14 days
        const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const { count: decayCount } = await sb
          .schema('nervous_system')
          .from('signals')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active')
          .lt('last_touched', fourteenDaysAgo);

        if (cancelled) return;

        // Budget burn: aggregate across all agents
        let totalSpent = 0;
        let totalLimit = 0;
        (agents ?? []).forEach((a) => {
          if (a.budget) {
            totalSpent += a.budget.current_spent_usd ?? 0;
            totalLimit += a.budget.limit_usd_per_period ?? 0;
          }
        });
        const budgetPct = totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : null;

        // Agent status
        const activeAgents = (agents ?? []).filter((a) => a.active);
        // In Sprint 2, no error tracking on agents yet — all active = green
        const agentStatus: 'green' | 'yellow' | 'red' =
          activeAgents.length === 0 ? 'yellow' : 'green';

        setData({
          agentStatus,
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
  const { agentStatus, escalationCount, budgetPct, decayCount, loading } = usePulseData();

  const indicators = [
    {
      label: 'Agent Fleet',
      color: STATUS_COLORS[agentStatus],
      value: agentStatus === 'loading' ? '—' : agentStatus === 'green' ? 'Healthy' : agentStatus === 'yellow' ? 'Degraded' : 'Error',
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
      value: loading ? '—' : budgetPct === null ? 'N/A' : `${budgetPct}%`,
    },
    {
      label: 'Decay Alerts',
      color: decayCount > 2 ? STATUS_COLORS.red : decayCount > 0 ? STATUS_COLORS.yellow : STATUS_COLORS.green,
      value: loading ? '—' : String(decayCount),
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {indicators.map((ind) => (
        <div
          key={ind.label}
          className="bg-[#141416] border border-[#1F1F23] rounded-xl px-4 py-3 flex items-center gap-3"
        >
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: ind.color, boxShadow: `0 0 6px ${ind.color}60` }}
          />
          <div className="min-w-0">
            <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.5)] truncate">
              {ind.label}
            </div>
            <div className="mono text-[13px] text-[#E5E5E7] font-medium">{ind.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── TopOfMind ────────────────────────────────────────────────────────────────

function useActionItems(teamMemberId: string | null) {
  const [items, setItems] = useState<ActionItemRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamMemberId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const sb = getSupabase();

    async function load() {
      const { data } = await sb
        .schema('nervous_system')
        .from('action_items')
        .select('id, title, description, priority, due_at, status, break_off_signal_id, dri')
        .in('status', ['open', 'in_progress'])
        .eq('dri', teamMemberId)
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(5)
        .returns<ActionItemRow[]>();
      if (!cancelled) {
        // Sort by priority desc then due_at asc
        const sorted = [...(data ?? [])].sort((a, b) => {
          const pd = priorityOrder(a.priority) - priorityOrder(b.priority);
          if (pd !== 0) return pd;
          if (!a.due_at && !b.due_at) return 0;
          if (!a.due_at) return 1;
          if (!b.due_at) return -1;
          return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
        });
        setItems(sorted.slice(0, 5));
        setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [teamMemberId]);

  return { items, loading };
}

const PRIORITY_COLORS: Record<string, string> = {
  irreversible: '#EF4444',
  high: '#F59E0B',
  medium: '#3B82F6',
  low: 'rgba(229,229,231,0.4)',
};

function TopOfMind({ teamMemberId }: { teamMemberId: string | null }) {
  const { items, loading } = useActionItems(teamMemberId);

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 bg-[#141416] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!teamMemberId) {
    return (
      <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-4">
        <div className="mono text-[11px] text-[rgba(229,229,231,0.5)]">
          No team member profile linked to this session yet.
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-4">
        <div className="mono text-[11px] text-[rgba(229,229,231,0.5)]">
          No open action items assigned to you. All clear.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-4 hover:border-[#2A2A2E] transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                style={{ backgroundColor: PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.medium }}
              />
              <div className="min-w-0">
                <div className="mono text-[13px] text-[#E5E5E7] truncate">{item.title}</div>
                {item.description && (
                  <div className="mono text-[11px] text-[rgba(229,229,231,0.5)] mt-0.5 line-clamp-1">
                    {item.description}
                  </div>
                )}
                <div className="flex items-center gap-3 mt-1.5">
                  <span
                    className="mono text-[9px] uppercase tracking-[0.14em]"
                    style={{ color: PRIORITY_COLORS[item.priority] }}
                  >
                    {item.priority}
                  </span>
                  {item.due_at && (
                    <span className="mono text-[9px] text-[rgba(229,229,231,0.4)]">
                      due {new Date(item.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                  <span className="mono text-[9px] uppercase tracking-[0.12em] text-[rgba(229,229,231,0.4)]">
                    {item.status}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => {/* TODO Sprint 3: navigate to Work tab */}}
                className="mono text-[10px] uppercase tracking-[0.12em] px-2.5 py-1 border border-[#1F1F23] rounded-lg text-[rgba(229,229,231,0.6)] hover:text-[#E5E5E7] hover:border-[#2A2A2E] transition-colors"
              >
                View
              </button>
              <button
                onClick={() => {/* no-op Sprint 2 */}}
                className="mono text-[10px] uppercase tracking-[0.12em] px-2.5 py-1 border border-[#1F1F23] rounded-lg text-[rgba(229,229,231,0.4)] hover:text-[rgba(229,229,231,0.6)] hover:border-[#2A2A2E] transition-colors"
              >
                Defer
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── CalendarStub ─────────────────────────────────────────────────────────────

function CalendarStub() {
  return (
    <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-4 h-4 rounded border border-[#2A2A2E] flex items-center justify-center">
          <div className="w-2 h-2 bg-[rgba(229,229,231,0.3)] rounded-sm" />
        </div>
        <div className="mono text-[11px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.5)]">
          Today's Calendar
        </div>
      </div>
      <div className="mono text-[12px] text-[rgba(229,229,231,0.5)]">
        Connect Google Calendar to see today's events.
      </div>
      <div className="mono text-[9px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.3)] mt-2">
        Calendar integration — Sprint 5
      </div>
    </div>
  );
}

// ─── YesterdayDigest ──────────────────────────────────────────────────────────

function useYesterdayDigest() {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const yesterday = new Date(Date.now() - 86400000);
    const dateStr = yesterday.toISOString().split('T')[0];
    const url = `https://raw.githubusercontent.com/freakngenius/unicron-knowledge/main/wiki/memory/analyst/${dateStr}.md`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('404');
        return res.text();
      })
      .then((text) => {
        if (!cancelled) { setContent(text); setLoading(false); }
      })
      .catch(() => {
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
      <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-5">
        <div className="h-4 w-32 bg-[#1F1F23] rounded animate-pulse mb-2" />
        <div className="h-3 w-full bg-[#1A1A1D] rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-5">
      <div className="mono text-[11px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.5)] mb-3">
        Yesterday's Digest
      </div>
      {content ? (
        <div className="mono text-[12px] text-[rgba(229,229,231,0.8)] leading-relaxed whitespace-pre-line line-clamp-6">
          {content}
        </div>
      ) : (
        <div className="mono text-[12px] text-[rgba(229,229,231,0.5)]">
          Analyst digest builds from Sprint 3.
        </div>
      )}
    </div>
  );
}

// ─── ActivityFeed ─────────────────────────────────────────────────────────────

function useActivityFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const lastDisplayedRef = useRef<number>(0);
  const pendingRef = useRef<FeedEvent[]>([]);

  // Throttle: flush pending events at most once per THROTTLE_MS
  const flushPending = useCallback(() => {
    const now = Date.now();
    if (now - lastDisplayedRef.current < THROTTLE_MS) return;
    if (pendingRef.current.length === 0) return;

    lastDisplayedRef.current = now;
    const toAdd = pendingRef.current.splice(0, pendingRef.current.length);
    pendingRef.current = [];

    setEvents((prev) => {
      const updated = [...prev];
      const cutoff = now - DEDUPE_WINDOW_MS;

      for (const evt of toAdd) {
        // Dedupe: collapse same source_type within DEDUPE_WINDOW
        const matchIdx = updated.findIndex(
          (e) =>
            e.source_type === evt.source_type &&
            new Date(e.created_at).getTime() > cutoff,
        );
        if (matchIdx >= 0) {
          updated[matchIdx] = { ...updated[matchIdx], count: (updated[matchIdx].count || 1) + 1 };
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
      // Schedule flush (respecting throttle)
      const delay = Math.max(0, THROTTLE_MS - (Date.now() - lastDisplayedRef.current));
      setTimeout(flushPending, delay);
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
    <div className="bg-[#141416] border border-[#1F1F23] rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[#1F1F23] flex items-center justify-between">
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
        <div className="px-5 py-6 mono text-[11px] text-[rgba(229,229,231,0.4)]">
          Listening for activity… events will appear here in real time.
        </div>
      ) : (
        <div className="divide-y divide-[#1F1F23]">
          {events.map((evt) => (
            <div key={evt.id} className="px-5 py-3 flex items-start gap-3">
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

// ─── SkillsSurface ────────────────────────────────────────────────────────────

interface SkillDispatchState {
  prompt: string;
  result: string | null;
  running: boolean;
  error: string | null;
}

// Future-sprint placeholder skills not yet in the DB (Sprint 4+).
// Shown as disabled stubs until seeded.
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
    // Use ns_list_skills() RPC — nervous_system schema is not exposed via
    // standard PostgREST routing, consistent with orchestrator access pattern.
    fetch('/api/atrium/skills')
      .then((r) => r.json() as Promise<SkillRow[]>)
      .then((data) => setSkills(Array.isArray(data) ? data : []))
      .catch(() => {
        // Fallback: direct Supabase RPC if Vercel function unavailable (dev)
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

  // Group DB skills by domain
  const byDomain = skills.reduce<Record<string, SkillRow[]>>((acc, s) => {
    (acc[s.domain] ??= []).push(s);
    return acc;
  }, {});

  // Build set of DB-registered skill names for stub deduplication
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
      setState((s) => ({
        ...s,
        running: false,
        result: json.status ?? 'dispatched',
      }));
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
      <div className="px-5 py-4 border-b border-[#1F1F23]">
        <div className="mono text-[10px] uppercase tracking-[0.22em] text-[rgba(229,229,231,0.4)]">
          Run a Skill to Begin
        </div>
        <div className="mono text-[9px] text-[rgba(229,229,231,0.3)] mt-0.5">
          Click a skill · press run · or type any prompt
        </div>
      </div>

      {/* Prompt area */}
      <div className="px-5 py-4 border-b border-[#1F1F23]">
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
              className="mono text-[11px] uppercase tracking-[0.14em] bg-[#FF6B2B] text-white px-4 py-2 rounded-lg hover:bg-[#e55a1a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {state.running ? '…' : 'Run →'}
            </button>
            <button
              onClick={() => setState({ prompt: '', result: null, running: false, error: null })}
              className="mono text-[11px] uppercase tracking-[0.14em] px-4 py-2 rounded-lg border border-[#1F1F23] text-[rgba(229,229,231,0.5)] hover:text-[#E5E5E7] hover:border-[#2A2A2E] transition-colors"
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

      {/* Domain grid — DB-registered skills (Sprint 3, active) */}
      <div className="px-5 py-4 space-y-4">
        {Object.entries(byDomain).map(([domain, domainSkills]) => (
          <div key={domain}>
            <div className="mono text-[9px] uppercase tracking-[0.22em] text-[rgba(229,229,231,0.35)] mb-2">
              {domain}:
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
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

        {/* Future-sprint stubs — shown only if not yet in the DB */}
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
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
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
      <div className="px-5 py-3 border-t border-[#1F1F23] flex items-center gap-6">
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
    <div className="relative max-w-3xl w-full mx-auto">
      {/* ─── Top bar row ─── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          {/* Date + time */}
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.5)] mb-1">
            {formatDate()} · {time}
          </div>
          {/* Greeting */}
          <h1 className="text-[22px] sm:text-[26px] font-semibold text-[#E5E5E7] tracking-tight leading-tight">
            {greeting(name)}
          </h1>
        </div>

        {/* Search + Capture buttons */}
        <div className="flex items-center gap-2 shrink-0 pt-1">
          <button
            onClick={() => setSearchOpen(true)}
            title="Search (/ or ⌘K)"
            className="flex items-center gap-1.5 px-3 py-2 bg-[#141416] border border-[#1F1F23] rounded-lg hover:border-[#2A2A2E] transition-colors group"
          >
            <span className="mono text-[12px] text-[rgba(229,229,231,0.5)] group-hover:text-[#E5E5E7]">
              ⌘K
            </span>
          </button>
          <button
            onClick={() => setCaptureOpen(true)}
            title="Quick Capture"
            className="flex items-center gap-1.5 px-3 py-2 bg-[#FF6B2B] rounded-lg hover:bg-[#e55a1a] transition-colors"
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

      {/* ─── Top of Mind ─── */}
      <section className="mb-6">
        <SectionLabel>Top of Mind</SectionLabel>
        <TopOfMind teamMemberId={teamMemberId} />
      </section>

      {/* ─── Calendar + Digest side-by-side on md+ ─── */}
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
      <section className="mb-8">
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
