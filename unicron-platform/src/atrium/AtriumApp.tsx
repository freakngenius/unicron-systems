// Atrium root — rendered when window.location.hostname === 'atrium.unicron.systems'.
//
// Feature-flag: VITE_ATRIUM_ENABLED must be 'true' or the component returns a
// 404 shell, preventing accidental exposure on other hostnames.
//
// Auth flow:
//  - If not signed in → <AtriumLogin />
//  - If signed in → <AtriumLayout> with tab routing

import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { AtriumLogin } from './AtriumLogin';
import { AtriumLayout, AtriumPlaceholder, type AtriumTab } from './AtriumLayout';
import { AtriumNow } from './AtriumNow';
import { Library } from './Library';
import { Marketing } from './Marketing';
import { Money } from './Money';
import { People } from './People';
import { Products } from './Products';
import { Settings } from './Settings';
import { Skills } from './Skills';
import { System } from './System';
import { Work } from './Work';

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
    </AtriumLayout>
  );
}
