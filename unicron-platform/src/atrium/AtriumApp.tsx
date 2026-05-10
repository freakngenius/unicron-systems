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
import { Marketing } from './Marketing';
import { Money } from './Money';
import { People } from './People';
import { Products } from './Products';
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
};

export function AtriumApp() {
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState<AtriumTab>('now');

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

  return (
    <AtriumLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'now' ? (
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
      ) : (
        <AtriumPlaceholder
          tab={activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
          sprint={TAB_SPRINT[activeTab]}
        />
      )}
    </AtriumLayout>
  );
}
