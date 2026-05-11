// Atrium layout shell — persistent header + 8-tab nav + content area.
//
// Tab list: Now, People, Work, Money, Marketing, Products, System, Library
// S-2: header now shows greeting + date/time, labeled StatusPulse pill (live),
//      ⌘K search button, and Mic+Plus capture button.
// S-7B: user avatar menu with Settings access added.

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { getSupabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { QuickCapture } from './QuickCapture';

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
  { id: 'skills',    label: 'Skills',    sprint: 4 },
];

type StatusTone = 'ok' | 'warn' | 'info' | 'error';
type StatusItem = { label: string; tone: StatusTone; detail: string };

function toneColor(tone: StatusTone) {
  if (tone === 'ok')    return '#2E8E66';
  if (tone === 'warn')  return '#C28A1F';
  if (tone === 'error') return '#E14B4B';
  return '#6081BE';
}

function StatusPulseHeader({ items }: { items: StatusItem[] }) {
  return (
    <div className="hidden md:flex items-center gap-1 bg-bg-card border border-border-default rounded-full px-3 py-1">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5 group relative">
          {i > 0 && <span className="w-px h-3 bg-border-subtle mx-1" />}
          <div
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: toneColor(item.tone), boxShadow: `0 0 4px ${toneColor(item.tone)}60` }}
          />
          <span className="mono text-[9px] uppercase tracking-[0.14em] text-text-secondary">{item.label}</span>
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-bg-elevated border border-border-default rounded-md px-2 py-1 mono text-[10px] text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
            {item.detail}
          </div>
        </div>
      ))}
    </div>
  );
}

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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[640px] bg-bg-elevated border border-border-default rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-text-secondary flex-shrink-0">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M9.5 9.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search ledger, vault, calls, agents…"
            className="flex-1 bg-transparent mono text-[13px] text-text-primary placeholder:text-text-secondary outline-none"
          />
          <span className="mono text-[9px] text-text-secondary bg-bg-raised px-1.5 py-0.5 rounded">esc</span>
        </div>
        <div className="max-h-[380px] overflow-y-auto py-1">
          {GROUPS.length === 0 ? (
            <div className="py-8 text-center mono text-[11px] text-text-secondary">No matches</div>
          ) : GROUPS.map((g, gi) => (
            <div key={gi}>
              <div className="px-4 py-2 mono text-[9px] uppercase tracking-[0.18em] text-text-secondary">{g.label}</div>
              {g.items.map((item, ii) => (
                <button key={ii} onClick={onClose}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-bg-raised transition-colors text-left mono text-[12px] text-text-primary">
                  {item}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-border-subtle flex items-center gap-4 mono text-[9px] text-text-secondary">
          <span><span className="text-text-primary">↵</span> open</span>
          <span><span className="text-text-primary">↑↓</span> navigate</span>
          <span><span className="text-text-primary">esc</span> close</span>
        </div>
      </div>
    </div>
  );
}

type Props = {
  activeTab: AtriumTab;
  onTabChange: (tab: AtriumTab) => void;
  children: ReactNode;
  onOpenSettings?: () => void;
};

const MOBILE_TABS: AtriumTab[] = ['now', 'people', 'work', 'money'];

const DEFAULT_STATUS: StatusItem[] = [
  { label: 'Vault',     tone: 'ok',   detail: 'Loading…' },
  { label: 'Agents',    tone: 'ok',   detail: 'Loading…' },
  { label: 'Refusals',  tone: 'ok',   detail: 'Loading…' },
  { label: 'Decay',     tone: 'info', detail: 'Loading…' },
];

export function AtriumLayout({ activeTab, onTabChange, children, onOpenSettings }: Props) {
  const auth = useAuth();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [statusItems, setStatusItems] = useState<StatusItem[]>(DEFAULT_STATUS);
  const [now, setNow] = useState(new Date());

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

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

  // StatusPulse live data — poll every 30s
  const fetchStatus = useCallback(async () => {
    try {
      const sb = getSupabase();
      const [agentsRes, refusalsRes, decayRes] = await Promise.all([
        sb.from('agents').select('id', { count: 'exact', head: true }).eq('is_active', true),
        sb.from('audit_log').select('id', { count: 'exact', head: true })
          .like('action', 'refusal%')
          .gte('created_at', new Date(Date.now() - 86_400_000).toISOString()),
        sb.from('signals').select('id', { count: 'exact', head: true })
          .lt('decay_score', 0.4),
      ]);
      const agentCount = agentsRes.count ?? 0;
      const refusalCount = refusalsRes.count ?? 0;
      const decayCount = decayRes.count ?? 0;
      setStatusItems([
        { label: 'Vault',    tone: 'ok',                              detail: 'Knowledge vault connected' },
        { label: 'Agents',   tone: agentCount > 0 ? 'ok' : 'warn',  detail: `${agentCount} active` },
        { label: 'Refusals', tone: refusalCount > 0 ? 'warn' : 'ok', detail: `${refusalCount} in last 24h` },
        { label: 'Decay',    tone: decayCount > 0 ? 'info' : 'ok',   detail: `${decayCount} signals aging` },
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

  const userEmail =
    auth.status === 'signed-in' ? (auth.user.email ?? '') : '';
  const displayName =
    auth.status === 'signed-in'
      ? ((auth.user.user_metadata as Record<string, string> | undefined)?.full_name ??
         (auth.user.user_metadata as Record<string, string> | undefined)?.name ??
         userEmail.split('@')[0])
      : '';
  const firstName = displayName.split(' ')[0] || displayName;
  const initials = displayName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const greeting = (() => {
    const h = now.getHours();
    if (h < 5)  return 'Late night';
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const tabLabel = (id: AtriumTab) =>
    TABS.find((t) => t.id === id)?.label ?? id;

  function TabIcon({ id, active }: { id: AtriumTab; active: boolean }) {
    const c = active ? 'var(--accent)' : 'var(--text-lo)';
    const w = 16;
    switch (id) {
      case 'now':       return <svg width={w} height={w} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke={c} strokeWidth="1.4"/><path d="M8 5v3.2l2 1.5" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
      case 'people':    return <svg width={w} height={w} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="6" r="2.5" stroke={c} strokeWidth="1.4"/><path d="M3.5 14c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" stroke={c} strokeWidth="1.4" strokeLinecap="round"/></svg>;
      case 'work':      return <svg width={w} height={w} viewBox="0 0 16 16" fill="none"><rect x="2" y="6.5" width="12" height="7.5" rx="1.5" stroke={c} strokeWidth="1.4"/><path d="M5.5 6.5V5C5.5 4 6.2 3 7.5 3h1c1.3 0 2 1 2 2v1.5" stroke={c} strokeWidth="1.4" strokeLinecap="round"/></svg>;
      case 'money':     return <svg width={w} height={w} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke={c} strokeWidth="1.4"/><path d="M8 5v1m0 4v1" stroke={c} strokeWidth="1.4" strokeLinecap="round"/><path d="M6.5 9.5a1.5 1.5 0 003 0c0-1-1.5-1.5-1.5-1.5S6.5 7.5 6.5 6.5a1.5 1.5 0 013 0" stroke={c} strokeWidth="1.2" strokeLinecap="round"/></svg>;
      case 'marketing': return <svg width={w} height={w} viewBox="0 0 16 16" fill="none"><path d="M12.5 3L4 6.5V9.5L12.5 13V3z" stroke={c} strokeWidth="1.4" strokeLinejoin="round"/><path d="M4 8H2.5" stroke={c} strokeWidth="1.4" strokeLinecap="round"/><path d="M5 9.5L3.5 13.5" stroke={c} strokeWidth="1.4" strokeLinecap="round"/></svg>;
      case 'products':  return <svg width={w} height={w} viewBox="0 0 16 16" fill="none"><path d="M8 2L14 5.5v5L8 14l-6-3.5v-5L8 2z" stroke={c} strokeWidth="1.4" strokeLinejoin="round"/><path d="M8 2v12M2.5 5.5l5.5 3 5.5-3" stroke={c} strokeWidth="1.3"/></svg>;
      case 'system':    return <svg width={w} height={w} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2" stroke={c} strokeWidth="1.4"/><path d="M8 2v1.5m0 9V14m4.2-1.8-1-1M4.8 4.8l-1-1M14 8h-1.5m-9 0H2m9.2 2.2-1 1M4.8 11.2l-1 1" stroke={c} strokeWidth="1.3" strokeLinecap="round"/></svg>;
      case 'library':   return <svg width={w} height={w} viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="4" height="10" rx="1" stroke={c} strokeWidth="1.4"/><rect x="7" y="3" width="4" height="10" rx="1" stroke={c} strokeWidth="1.4"/><path d="M12.5 3.5l2 9" stroke={c} strokeWidth="1.4" strokeLinecap="round"/></svg>;
      case 'skills':    return <svg width={w} height={w} viewBox="0 0 16 16" fill="none"><path d="M9.5 2L4 9h5l-2 5 7-7H9l2.5-5z" stroke={c} strokeWidth="1.4" strokeLinejoin="round"/></svg>;
    }
  }

  return (
    <div className="atrium-shell min-h-screen bg-bg-base text-text-primary flex flex-col">
      {/* Skip to main content — keyboard a11y */}
      <a
        href="#atrium-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[300] focus:px-3 focus:py-2 focus:bg-bg-elevated focus:border focus:border-border-default focus:rounded-md focus:mono focus:text-[11px] focus:text-text-primary focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border-default bg-bg-panel sticky top-0 z-50" role="banner">
        {/* Greeting + date (desktop) */}
        <div className="hidden md:flex items-baseline gap-2 flex-shrink-0">
          <span className="mono text-[13px] font-semibold text-text-primary">{greeting}, {firstName}</span>
          <span className="mono text-[11px] text-text-secondary">{dateStr}</span>
        </div>

        {/* Logo mark (mobile only) */}
        <div className="md:hidden w-7 h-7 rounded-lg bg-gradient-to-br from-accent-gold to-[#B5532A] flex items-center justify-center mono text-[13px] font-bold text-white flex-shrink-0">A</div>

        {/* StatusPulse pill */}
        <StatusPulseHeader items={statusItems} />

        <div className="flex-1" />

        {/* ⌘K search button (desktop) */}
        <button
          onClick={() => setCmdkOpen(true)}
          className="hidden md:flex items-center gap-2 bg-bg-card border border-border-default rounded-md px-3 py-1.5 mono text-[11px] text-text-secondary hover:border-border-hover transition-colors w-[220px] focus:outline-none focus:ring-2 focus:ring-zinc-500"
          aria-label="Open search palette"
          aria-keyshortcuts="Meta+k"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M8.5 8.5l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <span className="flex-1 text-left">Search…</span>
          <span className="bg-bg-raised px-1 py-0.5 rounded text-[9px]">⌘K</span>
        </button>

        {/* Mic+Plus capture button */}
        <button
          onClick={() => setCaptureOpen(true)}
          className="flex items-center gap-1 bg-bg-card border border-border-default rounded-md px-2.5 py-1.5 text-text-secondary hover:border-accent-gold hover:text-accent-gold transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500"
          aria-label="Quick capture — voice or text note"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="4" y="1" width="5" height="8" rx="2.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M2 7.5a4.5 4.5 0 009 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M6.5 12v-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M5.5 2v7M2 5.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>

        {/* User avatar + dropdown menu */}
        <div className="flex items-center gap-2 flex-shrink-0 relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(o => !o)}
            className="w-7 h-7 rounded-full bg-bg-card border border-border-default flex items-center justify-center mono text-[10px] text-text-secondary hover:border-border-hover transition-colors"
            aria-label="User menu"
            aria-expanded={userMenuOpen}
          >
            {initials || '?'}
          </button>
          <button
            onClick={handleSignOut}
            className="hidden md:block mono text-[10px] uppercase tracking-[0.16em] text-text-secondary hover:text-text-primary transition-colors"
          >
            Sign out
          </button>
          {/* User dropdown */}
          {userMenuOpen && (
            <div className="absolute top-full right-0 mt-2 w-44 bg-bg-elevated border border-border-default rounded-lg shadow-xl z-[100] overflow-hidden">
              <div className="px-3 py-2 border-b border-border-subtle">
                <p className="mono text-[10px] text-text-primary truncate">{userEmail}</p>
              </div>
              {onOpenSettings && (
                <button
                  onClick={() => { setUserMenuOpen(false); onOpenSettings(); }}
                  className="w-full text-left px-3 py-2 mono text-[11px] text-text-secondary hover:text-text-primary hover:bg-bg-raised transition-colors"
                >
                  Settings
                </button>
              )}
              <button
                onClick={() => { setUserMenuOpen(false); void handleSignOut(); }}
                className="w-full text-left px-3 py-2 mono text-[11px] text-text-secondary hover:text-text-primary hover:bg-bg-raised transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="atrium-body flex flex-1 min-h-0">
        {/* Sidebar nav (hidden on mobile) — 64px icon-only rail */}
        <nav
          className="atrium-nav hidden md:flex w-16 shrink-0 py-3 flex-col items-center"
          style={{ background: 'var(--v3-rail)', borderRight: '1px solid var(--v3-rail-2)' }}
          aria-label="Atrium main navigation"
        >
          {/* Gradient A logo tile */}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center mono text-[13px] font-bold text-white mb-4 flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #E8763A, #B5532A)' }}
          >
            A
          </div>

          {/* Tab icon buttons */}
          <div className="flex flex-col gap-0.5 w-full px-1.5 flex-1">
            {TABS.map((tab) => {
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className="relative group flex items-center justify-center w-full h-9 rounded-md transition-colors hover:bg-bg-card/60 focus:outline-none focus:ring-2 focus:ring-zinc-500"
                  style={{ background: active ? 'rgba(229,229,231,0.06)' : undefined }}
                  aria-label={tab.label}
                  aria-current={active ? 'page' : undefined}
                >
                  {/* 2px accent active bar */}
                  {active && (
                    <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r" style={{ background: 'var(--accent)' }} />
                  )}
                  <TabIcon id={tab.id} active={active} />
                  {/* Hover tooltip */}
                  <span className="absolute left-full ml-2.5 px-2 py-1 bg-bg-elevated border border-border-default rounded-md mono text-[10px] font-medium text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[60]">
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* User avatar at bottom — click to open settings */}
          <button
            onClick={() => onOpenSettings?.()}
            className="mt-auto mb-2 w-7 h-7 rounded-full bg-bg-card border border-border-default flex items-center justify-center mono text-[10px] text-text-secondary flex-shrink-0 hover:border-border-hover transition-colors group relative"
            aria-label="Open settings"
          >
            {initials || '?'}
            <span className="absolute left-full ml-2.5 px-2 py-1 bg-bg-elevated border border-border-default rounded-md mono text-[10px] font-medium text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[60]">
              Settings
            </span>
          </button>
        </nav>

        {/* Main content — pb-20 on mobile clears the 60px bottom nav */}
        <main className="atrium-content flex-1 overflow-auto p-4 md:p-6 pb-20 md:pb-6" id="atrium-main">
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar (visible < md) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-[60px] bg-bg-panel border-t border-border-default flex items-stretch z-50" aria-label="Atrium mobile navigation">
        {MOBILE_TABS.slice(0, 2).map((id) => {
          const active = id === activeTab;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              aria-label={tabLabel(id)}
              aria-current={active ? 'page' : undefined}
              className={[
                'relative flex-1 flex flex-col items-center justify-center gap-0.5 mono text-[9px] uppercase tracking-[0.14em] transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500',
                active ? 'text-accent-gold' : 'text-text-secondary',
              ].join(' ')}
            >
              {active && (
                <span className="absolute top-0 h-[2px] w-8 bg-accent-gold rounded-b" />
              )}
              {tabLabel(id)}
            </button>
          );
        })}

        {/* Center Capture FAB */}
        <div className="flex items-center justify-center px-2">
          <button
            onClick={() => setCaptureOpen(true)}
            className="w-11 h-11 rounded-full bg-accent-gold flex items-center justify-center text-white shadow-lg hover:opacity-90 transition-opacity"
            aria-label="Quick capture"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 3.5v11M3.5 9h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {MOBILE_TABS.slice(2).map((id) => {
          const active = id === activeTab;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              aria-label={tabLabel(id)}
              aria-current={active ? 'page' : undefined}
              className={[
                'relative flex-1 flex flex-col items-center justify-center gap-0.5 mono text-[9px] uppercase tracking-[0.14em] transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500',
                active ? 'text-accent-gold' : 'text-text-secondary',
              ].join(' ')}
            >
              {active && (
                <span className="absolute top-0 h-[2px] w-8 bg-accent-gold rounded-b" />
              )}
              {tabLabel(id)}
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
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 md:bottom-6 z-[200] bg-bg-card border border-border-default rounded-lg px-4 py-2 mono text-[11px] text-text-primary shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// Placeholder used by all non-Now tabs
export function AtriumPlaceholder({ tab, sprint }: { tab: string; sprint: number }) {
  return (
    <div className="atrium-placeholder flex items-center justify-center h-64">
      <div className="text-center">
        <div className="mono text-[11px] uppercase tracking-[0.18em] text-text-secondary mb-2">
          {tab}
        </div>
        <div className="mono text-[12px] text-border-hover">
          Coming soon in Sprint {sprint}
        </div>
      </div>
    </div>
  );
}
