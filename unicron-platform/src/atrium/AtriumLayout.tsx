// Atrium layout shell — v3 Stellate-inspired design.
// Dark navy rail (68px) + dark navy topbar + light gray content area.

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { getSupabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { QuickCapture } from './QuickCapture';
import { AtriumIcon } from './icons';

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

function CmdKPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQ(''); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!open) return null;

  const GROUPS = [
    { label: 'Action items', items: ['Reply to Zenith Labs proposal', 'Send Q2 forecast to board'] },
    { label: 'Calls', items: ['Zedcor discovery call — May 6', 'HCFCD procurement review — May 8'] },
    { label: 'Vault', items: ['Pathfinder pricing model v3', 'Internal Nervous System SPEC'] },
    { label: 'Skills', items: ['Run · Daily digest', 'Run · Customer health sweep'] },
  ].map(g => ({
    ...g,
    items: q ? g.items.filter(i => i.toLowerCase().includes(q.toLowerCase())) : g.items,
  })).filter(g => g.items.length);

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
          {GROUPS.length === 0 ? (
            <div className="py-8 text-center text-[11px] text-text-muted">No matches</div>
          ) : GROUPS.map((g, gi) => (
            <div key={gi}>
              <div className="px-4 py-2 text-[9px] uppercase tracking-[0.18em] text-text-muted">{g.label}</div>
              {g.items.map((item, ii) => (
                <button key={ii} onClick={onClose}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-bg-raised transition-colors text-left text-[12px] text-text-primary">
                  {item}
                </button>
              ))}
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
  const [statusItems, setStatusItems] = useState<StatusItem[]>(DEFAULT_STATUS);
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

  // StatusPulse live data — v3 indicators (Agents/Escalations/Budget/Decay/Voice)
  // Polls every 30s. PGRST106 fix: use public.ns_* SECURITY DEFINER RPCs.
  const fetchStatus = useCallback(async () => {
    try {
      const sb = getSupabase();
      const since24h = new Date(Date.now() - 86_400_000).toISOString();
      const [agentsRes, escalationsRes, decayRes] = await Promise.all([
        sb.rpc('ns_list_agents_active'),
        sb.rpc('ns_count_audit_log_escalations', { p_since: since24h }),
        sb.rpc('ns_count_ledger_decay'),
      ]);

      const agents = (agentsRes.data as AgentRow[] | null) ?? [];
      const agentCount = agents.length;
      const hasAgentError = agents.some((a) => a.status === 'error');
      const escalationCount = Number(escalationsRes.data ?? 0);
      const decayCount = Number(decayRes.data ?? 0);

      // Budget burn — aggregate across active agents with budget jsonb
      let totalSpent = 0;
      let totalLimit = 0;
      agents.forEach((a) => {
        if (a.budget) {
          totalSpent += a.budget.current_spent_usd ?? 0;
          totalLimit += a.budget.limit_usd_per_period ?? 0;
        }
      });
      const budgetPct = totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : null;

      setStatusItems([
        {
          label: 'Agents',
          tone: hasAgentError ? 'error' : agentCount > 0 ? 'ok' : 'warn',
          detail: agentCount > 0 ? `${agentCount} healthy` : 'No agents',
        },
        {
          label: 'Escalations',
          tone: escalationCount > 0 ? 'warn' : 'ok',
          detail: `${escalationCount} open`,
        },
        {
          label: 'Budget',
          tone: budgetPct === null ? 'ok' : budgetPct >= 80 ? 'error' : budgetPct >= 60 ? 'warn' : 'ok',
          detail: budgetPct === null ? '—%' : `${budgetPct}%`,
        },
        {
          label: 'Decay',
          tone: decayCount > 2 ? 'error' : decayCount > 0 ? 'warn' : 'ok',
          detail: `${decayCount} stale`,
        },
        {
          label: 'Voice',
          tone: 'ok',
          detail: '0 in flight',
        },
      ]);
    } catch {
      // Keep defaults on error
    }
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
  const RAIL_TEXT = '#7C87A0';
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
                className="relative group flex flex-col items-center gap-1 w-full py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                style={{ color: active ? RAIL_TEXT_ACTIVE : RAIL_TEXT }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = RAIL_HOVER; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
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

          {/* Right — status pulse + capture */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="hidden sm:flex">
              <StatusPulse items={statusItems} />
            </div>

            {/* Quick capture button */}
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
