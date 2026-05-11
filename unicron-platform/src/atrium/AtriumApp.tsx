// Atrium root — rendered when window.location.hostname === 'atrium.unicron.systems'.
//
// Feature-flag: VITE_ATRIUM_ENABLED must be 'true' or the component returns a
// 404 shell, preventing accidental exposure on other hostnames.
//
// Auth flow:
//  - If not signed in → <AtriumLogin />
//  - If signed in → <AtriumLayout> with tab routing
//
// Sprint 7 Stream D: lazy-load all non-Now tabs to reduce initial bundle size.

import { useState, lazy, Suspense } from 'react';
// Tokens are now loaded globally from src/main.tsx so Metacron + Atrium share
// the same :root custom properties. (Pass 1 rebrand — see SPEC.)
import { useAuth } from '../lib/auth';
import { AtriumLogin } from './AtriumLogin';
import { AtriumLayout, AtriumPlaceholder, type AtriumTab } from './AtriumLayout';
import { AtriumNow } from './AtriumNow';
import { Skeleton } from './ui-primitives';

// Heavy tabs — lazy-loaded so they're split into separate chunks
const Library   = lazy(() => import('./Library').then(m => ({ default: m.Library })));
const Marketing = lazy(() => import('./Marketing').then(m => ({ default: m.Marketing })));
const Money     = lazy(() => import('./Money').then(m => ({ default: m.Money })));
const People    = lazy(() => import('./People').then(m => ({ default: m.People })));
const Products  = lazy(() => import('./Products').then(m => ({ default: m.Products })));
const Settings  = lazy(() => import('./Settings').then(m => ({ default: m.Settings })));
const Skills    = lazy(() => import('./Skills').then(m => ({ default: m.Skills })));
const System    = lazy(() => import('./System').then(m => ({ default: m.System })));
const Work      = lazy(() => import('./Work').then(m => ({ default: m.Work })));

const ATRIUM_ENABLED = import.meta.env.VITE_ATRIUM_ENABLED === 'true';

const TAB_SPRINT: Record<AtriumTab, number> = {
  now:       1,
  people:    3,
  work:      3,
  money:     5,
  marketing: 6,
  products:  6,
  system:    2,
  library:   6,
  skills:    4,
};

// Fallback shown while a lazy tab chunk loads
function TabSkeleton() {
  return (
    <div className="max-w-5xl w-full space-y-3 pt-2" aria-live="polite">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-3 w-64" />
      <div className="mt-6 space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

export function AtriumApp() {
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState<AtriumTab>('now');
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!ATRIUM_ENABLED) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="mono text-[11px] uppercase tracking-[0.22em] text-text-secondary">
          Not found
        </div>
      </div>
    );
  }

  if (auth.status === 'loading') {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="mono text-[11px] uppercase tracking-[0.22em] text-text-secondary animate-pulse">
          loading…
        </div>
      </div>
    );
  }

  if (auth.status === 'signed-out') {
    return <AtriumLogin />;
  }

  // Signed in
  const userEmail = auth.user.email ?? '';
  const displayName =
    (auth.user.user_metadata as Record<string, string> | undefined)?.full_name ??
    (auth.user.user_metadata as Record<string, string> | undefined)?.name ??
    userEmail.split('@')[0];

  // member_id is the Supabase auth user ID — used by the preferences API.
  // The team_members table is keyed by uuid that matches auth.user.id when
  // team members are seeded with the correct IDs. Falls back gracefully if
  // no match (Settings still renders, save is disabled).
  const memberId = auth.user.id;

  return (
    <AtriumLayout
      activeTab={activeTab}
      onTabChange={(tab) => { setSettingsOpen(false); setActiveTab(tab); }}
      onOpenSettings={() => setSettingsOpen(true)}
    >
      <Suspense fallback={<TabSkeleton />}>
        {settingsOpen ? (
          <Settings
            memberId={memberId}
            onClose={() => setSettingsOpen(false)}
          />
        ) : activeTab === 'now' ? (
          <AtriumNow name={displayName} />
        ) : activeTab === 'people' ? (
          <People />
        ) : activeTab === 'system' ? (
          <System />
        ) : activeTab === 'work' ? (
          <Work />
        ) : activeTab === 'money' ? (
          <Money />
        ) : activeTab === 'marketing' ? (
          <Marketing />
        ) : activeTab === 'products' ? (
          <Products />
        ) : activeTab === 'library' ? (
          <Library />
        ) : activeTab === 'skills' ? (
          <Skills />
        ) : (
          <AtriumPlaceholder
            tab={(activeTab as string).charAt(0).toUpperCase() + (activeTab as string).slice(1)}
            sprint={TAB_SPRINT[activeTab as AtriumTab]}
          />
        )}
      </Suspense>
    </AtriumLayout>
  );
}
