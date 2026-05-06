// Atrium layout shell — persistent header + 8-tab nav + content area.
//
// Tab list: Now, People, Work, Money, Marketing, Products, System, Library
// All tabs except "Now" render a "Coming soon" placeholder.

import type { ReactNode } from 'react';
import { getSupabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

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

export function AtriumLayout({ activeTab, onTabChange, children }: Props) {
  const auth = useAuth();

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

      {/* Mobile tab strip (visible < md) */}
      <nav className="md:hidden flex overflow-x-auto border-b border-border-default bg-bg-panel px-2 py-1 gap-1 shrink-0">
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={[
                'shrink-0 px-3 py-1.5 rounded-md mono text-[10px] uppercase tracking-[0.14em] transition-colors whitespace-nowrap',
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

        {/* Main content */}
        <main className="atrium-content flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </div>
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
