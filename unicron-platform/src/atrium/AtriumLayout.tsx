// Atrium layout shell — persistent header + 8-tab nav + content area.
//
// Tab list: Now, People, Work, Money, Marketing, Products, System, Library
// All tabs except "Now" render a "Coming soon" placeholder.

import { useState, useEffect } from 'react';
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
  | 'library';

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

type Props = {
  activeTab: AtriumTab;
  onTabChange: (tab: AtriumTab) => void;
  children: ReactNode;
};

const MOBILE_TABS: AtriumTab[] = ['now', 'people', 'work', 'money'];

export function AtriumLayout({ activeTab, onTabChange, children }: Props) {
  const auth = useAuth();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

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
  const initials = displayName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const tabLabel = (id: AtriumTab) =>
    TABS.find((t) => t.id === id)?.label ?? id;

  return (
    <div className="atrium-shell min-h-screen bg-bg-base text-text-primary flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-border-default bg-bg-panel sticky top-0 z-50">
        <span className="mono text-[13px] uppercase tracking-[0.22em] text-accent-gold font-semibold">
          Atrium
        </span>

        {/* Status pulse — 4 grey circles */}
        <div className="status-pulse flex items-center gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-border-hover"
              style={{ animationDelay: `${i * 0.4}s` }}
            />
          ))}
        </div>

        {/* User avatar + sign out */}
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-bg-card border border-border-default flex items-center justify-center mono text-[10px] text-text-secondary">
            {initials || '?'}
          </div>
          <button
            onClick={handleSignOut}
            className="mono text-[10px] uppercase tracking-[0.16em] text-text-secondary hover:text-text-primary transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="atrium-body flex flex-1 min-h-0">
        {/* Sidebar nav (hidden on mobile) */}
        <nav className="atrium-nav hidden md:flex w-44 shrink-0 border-r border-border-default bg-bg-panel py-4 flex-col gap-1 px-2">
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={[
                  'w-full text-left px-3 py-2 rounded-md mono text-[11px] uppercase tracking-[0.14em] transition-colors',
                  active
                    ? 'bg-bg-card text-text-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-card/50',
                ].join(' ')}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Main content — pb-20 on mobile clears the 60px bottom nav */}
        <main className="atrium-content flex-1 overflow-auto p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar (visible < md) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-[60px] bg-bg-panel border-t border-border-default flex items-stretch z-50">
        {MOBILE_TABS.slice(0, 2).map((id) => {
          const active = id === activeTab;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={[
                'relative flex-1 flex flex-col items-center justify-center gap-0.5 mono text-[9px] uppercase tracking-[0.14em] transition-colors',
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
              className={[
                'relative flex-1 flex flex-col items-center justify-center gap-0.5 mono text-[9px] uppercase tracking-[0.14em] transition-colors',
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
