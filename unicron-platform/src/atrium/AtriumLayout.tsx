// Atrium layout shell — v3 Stellate-inspired design.
// Dark navy rail (68px) + dark navy topbar + light gray content area.

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { getSupabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { QuickCapture } from './QuickCapture';
import { AtriumIcon } from './icons';
import { navigateAtrium } from './navigation';
// Sprint 8 F9 fix (2026-05-14): the phone-icon Upload Call modal lives at the
// layout level so it can overlay any tab — no navigation away.
import { UploadCallModal } from './work/UploadCallModal';
import { useUploadDriver, UploadStatusBar } from './work/CallsLog';

export type AtriumTab =
  | 'now'
  | 'people'
  | 'work'
  | 'money'
  | 'marketing'
  | 'products'
  | 'system'
  | 'library'
  | 'skills';

const TABS: { id: AtriumTab; label: string; sprint: number }[] = [
  { id: 'now',       label: 'Now',       sprint: 1 },
  { id: 'people',    label: 'People',    sprint: 3 },
  { id: 'work',      label: 'Work',      sprint: 3 },
  { id: 'money',     label: 'Money',     sprint: 5 },
  { id: 'marketing', label: 'Marketing', sprint: 6 },
  { id: 'products',  label: 'Products',  sprint: 6 },
  { id: 'system',    label: 'System',    sprint: 2 },
  { id: 'library',   label: 'Library',   sprint: 6 },
];

const MOBILE_TABS: AtriumTab[] = ['now', 'people', 'work', 'money'];

// ─── Tab icons ────────────────────────────────────────────────────────────────

function TabIcon({ id, color = 'currentColor' }: { id: AtriumTab; color?: string }) {
  const size = 18;
  const style = { color };
  switch (id) {
    case 'now':       return <AtriumIcon.Now size={size} style={style} />;
    case 'people':    return <AtriumIcon.People size={size} style={style} />;
    case 'work':      return <AtriumIcon.Work size={size} style={style} />;
    case 'money':     return <AtriumIcon.Money size={size} style={style} />;
    case 'marketing': return <AtriumIcon.Megaphone size={size} style={style} />;
    case 'products':  return <AtriumIcon.Layers size={size} style={style} />;
    case 'system':    return <AtriumIcon.System size={size} style={style} />;
    case 'library':   return <AtriumIcon.Book size={size} style={style} />;
    case 'skills':    return <AtriumIcon.Zap size={size} style={style} />;
  }
}

// ─── Status pulse ─────────────────────────────────────────────────────────────

type StatusTone = 'ok' | 'warn' | 'info' | 'error';
type StatusItem = { label: string; tone: StatusTone; detail: string };

function dotColor(tone: StatusTone) {
  if (tone === 'ok')    return '#2E8E66';
  if (tone === 'warn')  return '#C28A1F';
  if (tone === 'error') return '#E14B4B';
  return '#6081BE';  // v3 blue for info tone
}

function StatusPulse({ items }: { items: StatusItem[] }) {
  return (
    <div className="flex items-center gap-1.5">
      {items.map((item, i) => (
        <div key={i} title={item.detail} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 8px', borderRadius: 7,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)',
          whiteSpace: 'nowrap',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: dotColor(item.tone), flexShrink: 0, display: 'block' }} />
          <span style={{ fontSize: 11, color: '#6E7A95', fontWeight: 500 }} className="hidden lg:block">{item.label}</span>
          <span style={{ fontSize: 11, color: '#C2CADB', fontWeight: 600 }} className="hidden xl:block">{item.detail.split(' ')[0]}</span>
        </div>
      ))}
    </div>
  );
}

// ─── CmdK palette ─────────────────────────────────────────────────────────────
// 2026-05-21 atrium-realtime-audit item #19: GROUPS used to be hardcoded mock
// strings. Now backed by live data via useCmdkItems() — action items, calls,
// wiki pages, and skills — wired to navigateAtrium for jump-to behaviour.

interface CmdkItem { label: string; onSelect: () => void }
interface CmdkGroup { label: string; items: CmdkItem[] }

interface ActionItemLite { id: string; title: string; status: string }
interface CallLite       { id: string; content_summary: string | null; created_at: string }
interface WikiPageLite   { slug: string; title: string }
interface SkillLite      { id: string; name: string }

// Module-level cache so we don't refetch on every palette open within a
// session. Cleared on full page reload.
let cmdkCache: { groups: CmdkGroup[]; ts: number } | null = null;

function formatCallDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function useCmdkItems(open: boolean): { groups: CmdkGroup[]; loading: boolean } {
  const [groups, setGroups] = useState<CmdkGroup[]>(() => cmdkCache?.groups ?? []);
  const [loading, setLoading] = useState<boolean>(() => cmdkCache === null);
  const loadedRef = useRef<boolean>(cmdkCache !== null);

  useEffect(() => {
    if (!open) return;
    if (loadedRef.current) return;
    loadedRef.current = true;

    let cancelled = false;
    setLoading(true);

    const sb = getSupabase();

    const actionItemsP: Promise<CmdkGroup> = sb
      .rpc('ns_list_action_items', { p_limit: 30 })
      .then(({ data, error }) => {
        if (error) throw error;
        const rows = (data as ActionItemLite[] | null) ?? [];
        const open = rows
          .filter((r) => r.status !== 'done' && r.status !== 'broken_off')
          .slice(0, 8);
        return {
          label: 'Action items',
          items: open.map((r) => ({
            label: r.title,
            onSelect: () =>
              navigateAtrium({ tab: 'work', subTab: 'items', filter: { id: r.id } }),
          })),
        };
      });

    const callsP: Promise<CmdkGroup> = sb
      .rpc('ns_list_ledger_calls', { p_search: null, p_limit: 5 })
      .then(({ data, error }) => {
        if (error) throw error;
        const rows = (data as CallLite[] | null) ?? [];
        return {
          label: 'Calls',
          items: rows.map((r) => {
            const summary = (r.content_summary ?? '').trim();
            const title = summary.length > 0
              ? (summary.length > 64 ? `${summary.slice(0, 61)}…` : summary)
              : 'Untitled call';
            const date = formatCallDate(r.created_at);
            return {
              label: date ? `${title} — ${date}` : title,
              onSelect: () =>
                navigateAtrium({ tab: 'work', subTab: 'calls', filter: { id: r.id } }),
            };
          }),
        };
      });

    const wikiP: Promise<CmdkGroup> = fetch('/api/atrium/wiki')
      .then((r) => {
        if (!r.ok) throw new Error(`wiki ${r.status}`);
        return r.json() as Promise<{ pages?: WikiPageLite[] }>;
      })
      .then((body) => {
        const pages = (body.pages ?? [])
          .filter((p) => !p.slug.startsWith('_'))
          .slice(0, 5);
        return {
          label: 'Wiki pages',
          items: pages.map((p) => ({
            label: p.title || p.slug,
            onSelect: () =>
              navigateAtrium({ tab: 'library', subTab: 'wiki', filter: { slug: p.slug } }),
          })),
        };
      });

    const skillsP: Promise<CmdkGroup> = fetch('/api/atrium/skills')
      .then((r) => {
        if (!r.ok) throw new Error(`skills ${r.status}`);
        return r.json() as Promise<SkillLite[] | { error: string }>;
      })
      .then((body) => {
        if (!Array.isArray(body)) throw new Error('skills payload not array');
        const rows = body.slice(0, 6);
        return {
          label: 'Skills',
          items: rows.map((s) => ({
            label: s.name,
            onSelect: () =>
              navigateAtrium({ tab: 'now', subTab: 'skills', filter: { id: s.id } }),
          })),
        };
      });

    void Promise.allSettled([actionItemsP, callsP, wikiP, skillsP]).then((results) => {
      if (cancelled) return;
      const next: CmdkGroup[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.items.length > 0) next.push(r.value);
      }
      cmdkCache = { groups: next, ts: Date.now() };
      setGroups(next);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [open]);

  return { groups, loading };
}

function CmdKPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { groups, loading } = useCmdkItems(open);

  useEffect(() => {
    if (open) { setQ(''); setActiveIdx(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  // Reset selection when query changes
  useEffect(() => { setActiveIdx(0); }, [q]);

  // Filter groups by query (operates on the live label, not mock strings)
  const filteredGroups: CmdkGroup[] = groups
    .map((g) => ({
      ...g,
      items: q
        ? g.items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()))
        : g.items,
    }))
    .filter((g) => g.items.length > 0);

  // Flatten for keyboard navigation
  const flat: CmdkItem[] = filteredGroups.flatMap((g) => g.items);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => (flat.length === 0 ? 0 : (i + 1) % flat.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => (flat.length === 0 ? 0 : (i - 1 + flat.length) % flat.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = flat[activeIdx];
        if (target) { target.onSelect(); onClose(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, flat, activeIdx]);

  if (!open) return null;

  // Build (group, item, flatIdx) tuples so we can highlight the active row.
  let runningIdx = 0;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh] px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-[rgba(11,21,48,0.55)] backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[640px] bg-white border border-border-default rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
          <AtriumIcon.Search size={14} strokeWidth={1.7} className="text-text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search ledger, vault, calls, agents…"
            className="flex-1 bg-transparent text-[13px] text-text-primary placeholder:text-text-muted outline-none"
          />
          <span className="text-[9px] text-text-muted bg-bg-raised px-1.5 py-0.5 rounded font-mono">esc</span>
        </div>
        <div className="max-h-[380px] overflow-y-auto py-1">
          {loading && filteredGroups.length === 0 ? (
            <div className="py-8 text-center text-[11px] text-text-muted">Loading recent items…</div>
          ) : filteredGroups.length === 0 ? (
            <div className="py-8 text-center text-[11px] text-text-muted">No matches</div>
          ) : filteredGroups.map((g, gi) => (
            <div key={gi}>
              <div className="px-4 py-2 text-[9px] uppercase tracking-[0.18em] text-text-muted">{g.label}</div>
              {g.items.map((item, ii) => {
                const myIdx = runningIdx++;
                const isActive = myIdx === activeIdx;
                return (
                  <button
                    key={ii}
                    onMouseEnter={() => setActiveIdx(myIdx)}
                    onClick={() => { item.onSelect(); onClose(); }}
                    className={`w-full flex items-center gap-3 px-4 py-2 transition-colors text-left text-[12px] text-text-primary ${isActive ? 'bg-bg-raised' : 'hover:bg-bg-raised'}`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-border-subtle flex items-center gap-4 text-[9px] text-text-muted">
          <span><span className="text-text-primary">↵</span> open</span>
          <span><span className="text-text-primary">↑↓</span> navigate</span>
          <span><span className="text-text-primary">esc</span> close</span>
        </div>
      </div>
    </div>
  );
}

// ─── Layout shell ─────────────────────────────────────────────────────────────

type Props = {
  activeTab: AtriumTab;
  onTabChange: (tab: AtriumTab) => void;
  children: ReactNode;
  onOpenSettings?: () => void;
};

const DEFAULT_STATUS: StatusItem[] = [
  { label: 'Agents',      tone: 'ok',   detail: '— healthy' },
  { label: 'Escalations', tone: 'ok',   detail: '— open' },
  { label: 'Budget',      tone: 'ok',   detail: '—%' },
  { label: 'Decay',       tone: 'ok',   detail: '— stale' },
  { label: 'Voice',       tone: 'ok',   detail: '— in flight' },
];

interface AgentRow {
  status: string | null;
  budget: { limit_usd_per_period: number; current_spent_usd: number } | null;
}

export function AtriumLayout({ activeTab, onTabChange, children, onOpenSettings }: Props) {
  const auth = useAuth();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  // Sprint 8 F9 (2026-05-13): the prior statusItems state (Agents / Escalations
  // / Budget / Decay / Voice) is replaced by per-pill state above. The legacy
  // StatusPulse type definitions remain at module top so any other importer
  // keeps building.
  const [searchQ, setSearchQ] = useState('');

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ⌘K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdkOpen(o => !o);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Sprint 8 F9 — action-driving top-bar pills (5 of them, left → right):
  //   (a) My Action Items count → Now > Action Items
  //   (b) Customers Needing Attention count → People (filtered)
  //   (c) Today's Calls count + next call HH:MM → Work > Calls
  //   (d) Escalations — render ONLY when > 0, in red
  //   (e) New Since Last Visit count — click marks all seen
  // Replaces the prior Agents/Escalations/Budget/Decay/Voice pills.
  const [myActionItems, setMyActionItems] = useState(0);
  const [customersAttention, setCustomersAttention] = useState(0);
  const [todaysCalls, setTodaysCalls] = useState(0);
  const [nextCallTime, setNextCallTime] = useState<string | null>(null);
  const [escalationCount, setEscalationCount] = useState(0);
  const [newSinceLastVisit, setNewSinceLastVisit] = useState(0);

  const lastVisitKey = 'atrium:last_visit';
  const userEmailKey =
    auth.status === 'signed-in' ? (auth.user.email ?? '') : '';

  const fetchTopBarPills = useCallback(async () => {
    try {
      const sb = getSupabase();
      const since24h = new Date(Date.now() - 86_400_000).toISOString();
      const startOfTodayPT = (() => {
        // 00:00 PT for today, expressed as UTC ISO.
        const fmt = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Los_Angeles',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(new Date());
        const y = fmt.find((p) => p.type === 'year')?.value;
        const m = fmt.find((p) => p.type === 'month')?.value;
        const d = fmt.find((p) => p.type === 'day')?.value;
        // Treat as PT midnight ISO; the offset is approximate (PST/PDT differ
        // by an hour) but is fine for "today's calls" semantics — the calendar
        // pull window is intentionally generous.
        return new Date(`${y}-${m}-${d}T00:00:00-08:00`).toISOString();
      })();
      const endOfTodayPT = new Date(
        new Date(startOfTodayPT).getTime() + 24 * 60 * 60 * 1000,
      ).toISOString();

      const lastVisit =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(lastVisitKey) ?? since24h
          : since24h;

      // Resolve current operator team_member_id via email RPC (matches Now.tsx pattern).
      let memberId: string | null = null;
      if (userEmailKey) {
        const { data } = await sb.rpc('ns_get_team_member_by_email', {
          p_email: userEmailKey,
        });
        const rows = data as Array<{ id: string }> | null;
        memberId = rows?.[0]?.id ?? null;
      }

      // (a) My Action Items — open + assigned to current operator.
      // Sprint 8 F5 added the completed bool; we filter on completed=false.
      let myAi = 0;
      if (memberId) {
        const { count } = await sb
          .schema('nervous_system')
          .from('action_items')
          .select('id', { count: 'exact', head: true })
          .eq('completed', false)
          .eq('dri', memberId);
        myAi = count ?? 0;
      } else {
        const { count } = await sb
          .schema('nervous_system')
          .from('action_items')
          .select('id', { count: 'exact', head: true })
          .eq('completed', false);
        myAi = count ?? 0;
      }
      setMyActionItems(myAi);

      // (b) Customers Needing Attention — naive: customers without a touch in 14d.
      // Falls back to 0 silently if the table isn't present in this env.
      try {
        const fourteenDaysAgo = new Date(
          Date.now() - 14 * 86_400_000,
        ).toISOString();
        const { count } = await sb
          .schema('nervous_system')
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .lt('last_touch_at', fourteenDaysAgo);
        setCustomersAttention(count ?? 0);
      } catch {
        setCustomersAttention(0);
      }

      // (c) Today's Calls — count + next start_at in HH:MM PT.
      try {
        const { data: calRows } = await sb
          .schema('nervous_system')
          .from('calendar_events')
          .select('start_at')
          .gte('start_at', startOfTodayPT)
          .lt('start_at', endOfTodayPT)
          .order('start_at', { ascending: true })
          .limit(20);
        const rows = (calRows ?? []) as Array<{ start_at: string }>;
        setTodaysCalls(rows.length);
        const upcoming = rows.find(
          (r) => new Date(r.start_at).getTime() >= Date.now(),
        );
        if (upcoming) {
          const hhmm = new Date(upcoming.start_at).toLocaleTimeString('en-US', {
            timeZone: 'America/Los_Angeles',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          setNextCallTime(hhmm);
        } else {
          setNextCallTime(null);
        }
      } catch {
        setTodaysCalls(0);
        setNextCallTime(null);
      }

      // (d) Escalations — re-use existing RPC, render ONLY when > 0.
      const { data: escData } = await sb.rpc('ns_count_audit_log_escalations', {
        p_since: since24h,
      });
      setEscalationCount(Number(escData ?? 0));

      // (e) New Since Last Visit — ledger rows since the persisted timestamp.
      try {
        const { count } = await sb
          .schema('nervous_system')
          .from('ledger')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', lastVisit);
        setNewSinceLastVisit(count ?? 0);
      } catch {
        setNewSinceLastVisit(0);
      }
    } catch {
      // Keep defaults on error
    }
  }, [userEmailKey]);
  const fetchStatus = fetchTopBarPills; // shim — old name still referenced below

  const markAllSeen = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(lastVisitKey, new Date().toISOString());
    setNewSinceLastVisit(0);
  }, []);

  // Sprint 8 F9 fix (2026-05-14): the phone-icon now opens a layout-level
  // modal so the operator can upload a call from any tab without losing their
  // current view. Reuses the same useUploadDriver pipeline that CallsLog runs
  // for its in-tab Upload button — two independent instances are fine because
  // each drives its own stage state.
  const [uploadCallOpen, setUploadCallOpen] = useState(false);
  const {
    stage: uploadCallStage,
    startUpload: startUploadCall,
    dismiss: dismissUploadCall,
  } = useUploadDriver(() => {
    // Layout-level upload doesn't own a list to refresh; CallsLog (if mounted)
    // will pick up the new row through its own data fetch on next mount/poll.
  });
  const openUploadCallModal = useCallback(() => {
    setUploadCallOpen(true);
  }, []);

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 30_000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    function handler(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  async function handleSignOut() {
    await getSupabase().auth.signOut();
  }

  const userEmail = auth.status === 'signed-in' ? (auth.user.email ?? '') : '';
  const displayName =
    auth.status === 'signed-in'
      ? ((auth.user.user_metadata as Record<string, string> | undefined)?.full_name ??
         (auth.user.user_metadata as Record<string, string> | undefined)?.name ??
         userEmail.split('@')[0])
      : '';
  const initials = displayName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const now = new Date();
  const greeting = (() => {
    const h = now.getHours();
    if (h < 5)  return 'Late night';
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  const RAIL = '#1D2D4F';
  const RAIL_HOVER = '#243861';
  const TOPBAR = '#1D2D4F';
  // Bumped from #7C87A0 → #9098B0 so inactive rail labels clear WCAG AA 4.5:1
  // against the dark navy rail (#1D2D4F). Old value computed ≈3.9:1.
  const RAIL_TEXT = '#9098B0';
  const RAIL_TEXT_ACTIVE = '#FFFFFF';

  return (
    <div className="flex overflow-hidden" style={{ height: '100dvh', fontFamily: 'var(--font-ui)', background: RAIL }}>
      {/* Skip link */}
      <a
        href="#atrium-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[300] focus:px-3 focus:py-2 focus:bg-white focus:border focus:border-border-default focus:rounded-md focus:text-[11px] focus:text-text-primary focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Left rail — dark navy, 68px, hidden on mobile */}
      <style>{`
        /* Pure CSS hover/active for the rail. State exclusion via [data-active].
           Avoids React-state-based hover residue: clicking a tab flips its
           data-active to "true", the hover rule excludes data-active="true",
           and any prior hover background drops on next paint. */
        .atrium-rail-tab { background: transparent; transition: background 120ms ease; }
        .atrium-rail-tab:hover:not([data-active="true"]) { background: ${RAIL_HOVER}; }
        .atrium-rail-tab:focus { outline: none; }
        .atrium-rail-tab:focus-visible { box-shadow: 0 0 0 2px rgba(255,255,255,0.20); }
      `}</style>
      <nav
        className="hidden md:flex flex-col items-center flex-shrink-0 py-3"
        style={{ width: 68, background: RAIL }}
        aria-label="Atrium main navigation"
      >
        {/* Logo tile — Atrium gold heart */}
        <img
          src="/favicon.png"
          alt="Atrium"
          className="w-10 h-10 mb-4 flex-shrink-0 object-contain"
          aria-hidden="true"
        />

        {/* Nav items */}
        <div className="flex flex-col gap-0.5 w-full px-1.5 flex-1">
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="atrium-rail-tab relative group flex flex-col items-center gap-1 w-full py-2 rounded-lg"
                style={{ color: active ? RAIL_TEXT_ACTIVE : RAIL_TEXT }}
                data-active={active ? 'true' : 'false'}
                aria-label={tab.label}
                aria-current={active ? 'page' : undefined}
              >
                <span
                  className="flex items-center justify-center rounded-lg transition-all"
                  style={{
                    width: 36, height: 36,
                    background: active ? '#FFFFFF' : 'transparent',
                    color: active ? RAIL : 'inherit',
                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.18)' : 'none',
                  }}
                >
                  <TabIcon id={tab.id} color={active ? RAIL : 'currentColor'} />
                </span>
                <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: 0.1 }}>{tab.label}</span>

                {/* Tooltip (not needed since we show labels, but keep for accessibility) */}
              </button>
            );
          })}
        </div>

        {/* User avatar at rail bottom */}
        <div className="mt-auto flex flex-col items-center gap-2 mb-1" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(o => !o)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-white/20"
            style={{ background: 'linear-gradient(135deg, #5b6580, #1B2542)', color: '#C2CADB' }}
            aria-label="User menu"
            aria-expanded={userMenuOpen}
          >
            {initials || '?'}
          </button>

          {/* User dropdown */}
          {userMenuOpen && (
            <div className="absolute bottom-14 left-16 w-44 bg-white border border-border-default rounded-lg shadow-xl z-[100] overflow-hidden">
              <div className="px-3 py-2 border-b border-border-subtle">
                <p className="text-[10px] text-text-primary truncate">{userEmail}</p>
              </div>
              {onOpenSettings && (
                <button
                  onClick={() => { setUserMenuOpen(false); onOpenSettings(); }}
                  className="w-full text-left px-3 py-2 text-[11px] text-text-secondary hover:text-text-primary hover:bg-bg-raised transition-colors"
                >
                  Settings
                </button>
              )}
              <button
                onClick={() => { setUserMenuOpen(false); void handleSignOut(); }}
                className="w-full text-left px-3 py-2 text-[11px] text-text-secondary hover:text-text-primary hover:bg-bg-raised transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Right side — topbar + content */}
      <div className="flex flex-col flex-1 min-w-0" style={{ background: TOPBAR }}>

        {/* Dark navy topbar */}
        <div
          className="flex-shrink-0 flex items-center gap-3 px-5"
          style={{ height: 68, background: TOPBAR, color: '#C2CADB' }}
          role="banner"
        >
          {/* Wordmark (desktop) */}
          <div className="hidden md:flex flex-col leading-none flex-shrink-0" style={{ minWidth: 120 }}>
            <span className="font-bold text-white uppercase tracking-[0.14em]" style={{ fontSize: 14, fontFamily: 'var(--font-display)' }}>
              Atrium
            </span>
            <span style={{ fontSize: 11, color: '#6E7A95', marginTop: 3 }}>Unicron Systems</span>
          </div>

          {/* Mobile logo — Atrium gold heart */}
          <img
            src="/favicon.png"
            alt="Atrium"
            className="md:hidden w-8 h-8 flex-shrink-0 object-contain"
            aria-hidden="true"
          />

          {/* Intelligent search bar (center) */}
          <div className="flex-1 max-w-md mx-auto md:mx-4">
            <button
              onClick={() => setCmdkOpen(true)}
              className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left focus:outline-none"
              style={{
                background: 'rgba(0,0,0,0.22)',
                border: '1px solid rgba(255,255,255,0.10)',
                color: '#6E7A95',
              }}
              aria-label="Open search"
              aria-keyshortcuts="Meta+k"
            >
              <AtriumIcon.Search size={14} strokeWidth={1.5} />
              {searchQ ? (
                <span style={{ fontSize: 13, color: '#fff', flex: 1 }}>{searchQ}</span>
              ) : (
                <span className="hidden md:block flex-1" style={{ fontSize: 13 }}>Ask anything</span>
              )}
              <span className="hidden md:block font-mono" style={{ fontSize: 11, color: '#6E7A95', background: 'rgba(255,255,255,0.06)', padding: '2px 5px', borderRadius: 4 }}>⌘K</span>
            </button>
          </div>

          {/* Sprint 8 F9: action-driving pills + mic + phone-icon upload-call button */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full"
              style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.10)' }}
            >
              {/* (a) My Action Items → Now > Action Items */}
              <button
                onClick={() => navigateAtrium({ tab: 'now', subTab: 'action-items' })}
                title="My open action items"
                className="topbar-pill flex items-center gap-1 px-2 py-0.5 rounded-full transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
              >
                <span className="mono text-[11px] font-semibold text-white">{myActionItems}</span>
                <span className="mono text-[9px] uppercase tracking-[0.10em] text-[#C2CADB]">my AI</span>
              </button>

              {/* (b) Customers Needing Attention → People (filtered) */}
              <button
                onClick={() => navigateAtrium({ tab: 'people', filter: { attention: 'true' } })}
                title="Customers needing attention"
                className="topbar-pill flex items-center gap-1 px-2 py-0.5 rounded-full transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
              >
                <span className="mono text-[11px] font-semibold text-white">{customersAttention}</span>
                <span className="mono text-[9px] uppercase tracking-[0.10em] text-[#C2CADB]">cust attn</span>
              </button>

              {/* (c) Today's Calls + next HH:MM → Work > Calls */}
              <button
                onClick={() => navigateAtrium({ tab: 'work', subTab: 'calls' })}
                title={nextCallTime ? `Today's calls (next ${nextCallTime} PT)` : "Today's calls"}
                className="topbar-pill flex items-center gap-1 px-2 py-0.5 rounded-full transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
              >
                <span className="mono text-[11px] font-semibold text-white">{todaysCalls}</span>
                <span className="mono text-[9px] uppercase tracking-[0.10em] text-[#C2CADB]">calls</span>
                {nextCallTime && (
                  <span className="mono text-[9px] text-[#E8763A]">{nextCallTime}</span>
                )}
              </button>

              {/* (d) Escalations — render only when > 0, in red */}
              {escalationCount > 0 && (
                <button
                  onClick={() => navigateAtrium({ tab: 'system', subTab: 'refusal-log' })}
                  title="Escalations in last 24h"
                  className="topbar-pill flex items-center gap-1 px-2 py-0.5 rounded-full transition-colors hover:bg-red-500/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-300"
                  style={{ background: 'rgba(220,38,38,0.18)', border: '1px solid rgba(220,38,38,0.45)' }}
                >
                  <span className="mono text-[11px] font-semibold text-[#FECACA]">{escalationCount}</span>
                  <span className="mono text-[9px] uppercase tracking-[0.10em] text-[#FCA5A5]">esc</span>
                </button>
              )}

              {/* (e) New Since Last Visit — click marks all seen */}
              <button
                onClick={markAllSeen}
                title="New since last visit (click to mark all seen)"
                className="topbar-pill flex items-center gap-1 px-2 py-0.5 rounded-full transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
              >
                <span className="mono text-[11px] font-semibold text-white">{newSinceLastVisit}</span>
                <span className="mono text-[9px] uppercase tracking-[0.10em] text-[#C2CADB]">new</span>
              </button>
            </div>

            {/* Quick capture button (mic + plus) */}
            <button
              onClick={() => setCaptureOpen(true)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 transition-colors focus:outline-none"
              style={{
                background: 'rgba(232,118,58,0.15)',
                border: '1px solid rgba(232,118,58,0.35)',
                color: '#FFE4D2',
              }}
              aria-label="Quick capture"
            >
              <AtriumIcon.Mic size={13} strokeWidth={1.5} />
              <AtriumIcon.Plus size={11} strokeWidth={1.8} />
            </button>

            {/* Sprint 8 F9: phone-icon button — opens Work > Calls Upload modal */}
            <button
              onClick={openUploadCallModal}
              aria-label="Upload call"
              title="Upload call transcript"
              className="flex items-center justify-center rounded-lg px-2.5 py-2 transition-colors focus:outline-none"
              style={{
                background: 'rgba(46,142,102,0.15)',
                border: '1px solid rgba(46,142,102,0.35)',
                color: '#D6F0E5',
              }}
            >
              <AtriumIcon.Phone size={14} strokeWidth={1.5} />
            </button>

            {/* Greeting (mobile) */}
            <span className="md:hidden text-[12px] font-medium text-white">{greeting}</span>
          </div>
        </div>

        {/* Light gray content area — rounded top-left corner */}
        <main
          id="atrium-main"
          className="flex-1 overflow-auto"
          style={{
            background: '#F6F7F9',
            borderTopLeftRadius: 15,
            borderTopRightRadius: 0,
          }}
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 flex items-stretch z-50"
        style={{ height: 60, background: RAIL, borderTop: '1px solid rgba(255,255,255,0.06)' }}
        aria-label="Atrium mobile navigation"
      >
        {MOBILE_TABS.slice(0, 2).map((id) => {
          const active = id === activeTab;
          const label = TABS.find(t => t.id === id)?.label ?? id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className="relative flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors focus:outline-none"
              style={{ color: active ? '#FFFFFF' : RAIL_TEXT, fontSize: 10 }}
            >
              {active && <span className="absolute top-0 h-[2px] w-8 rounded-b" style={{ background: '#E8763A' }} />}
              <TabIcon id={id} color={active ? '#FFFFFF' : RAIL_TEXT} />
              <span style={{ fontSize: 9, fontWeight: 500 }}>{label}</span>
            </button>
          );
        })}

        {/* Center Capture FAB */}
        <div className="flex items-center justify-center px-2">
          <button
            onClick={() => setCaptureOpen(true)}
            className="w-11 h-11 rounded-full flex items-center justify-center text-white shadow-lg hover:opacity-90 transition-opacity"
            style={{ background: '#E8763A' }}
            aria-label="Quick capture"
          >
            <AtriumIcon.Plus size={18} strokeWidth={2} />
          </button>
        </div>

        {MOBILE_TABS.slice(2).map((id) => {
          const active = id === activeTab;
          const label = TABS.find(t => t.id === id)?.label ?? id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className="relative flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors focus:outline-none"
              style={{ color: active ? '#FFFFFF' : RAIL_TEXT, fontSize: 10 }}
            >
              {active && <span className="absolute top-0 h-[2px] w-8 rounded-b" style={{ background: '#E8763A' }} />}
              <TabIcon id={id} color={active ? '#FFFFFF' : RAIL_TEXT} />
              <span style={{ fontSize: 9, fontWeight: 500 }}>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Quick Capture modal */}
      <QuickCapture
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onToast={setToast}
      />

      {/* ⌘K palette */}
      <CmdKPalette open={cmdkOpen} onClose={() => setCmdkOpen(false)} />

      {/* Sprint 8 F9 fix: Upload Call modal lives at the layout level so the
          topbar phone-icon overlays the current tab instead of navigating
          away. The same UploadCallModal component is also mounted inside
          CallsLog for the in-tab Upload button — independent state, no
          conflict. */}
      <UploadCallModal
        open={uploadCallOpen}
        onClose={() => setUploadCallOpen(false)}
        onSubmit={(payload) => {
          setUploadCallOpen(false);
          void startUploadCall(payload);
        }}
      />
      {uploadCallStage && (
        <UploadStatusBar stage={uploadCallStage} onDismiss={dismissUploadCall} />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 md:bottom-6 z-[200] bg-white border border-border-default rounded-lg px-4 py-2 text-[11px] text-text-primary shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// Placeholder used by non-implemented tabs
export function AtriumPlaceholder({ tab, sprint }: { tab: string; sprint: number }) {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted mb-2">{tab}</div>
        <div className="text-[12px] text-text-faint">Coming in Sprint {sprint}</div>
      </div>
    </div>
  );
}
