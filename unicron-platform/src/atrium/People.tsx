// People.tsx — Sprint 5 Stream E
// Atrium People tab root. Sub-navigation: Customers | Team | Network | Hiring.
// Follows the same pattern as Work.tsx.

import { useState } from 'react';
import { CustomersPipeline } from './people/CustomersPipeline';
import { TeamMyDay } from './people/TeamMyDay';
import { Network } from './people/Network';
import { Hiring } from './people/Hiring';

// ─── Constants ────────────────────────────────────────────────────────────────

const PEOPLE_TABS = [
  'customers',
  'team',
  'network',
  'hiring',
] as const;

type PeopleTab = (typeof PEOPLE_TABS)[number];

const PEOPLE_TAB_LABELS: Record<PeopleTab, string> = {
  customers: 'Customers',
  team: 'Team',
  network: 'Network',
  hiring: 'Hiring',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function People() {
  const [active, setActive] = useState<PeopleTab>('customers');

  return (
    <div className="max-w-5xl w-full">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="mono text-[18px] text-[#E5E5E7] font-semibold">People</h1>
        <p className="mono text-[11px] text-[rgba(229,229,231,0.5)] mt-1">
          Customers, team, network, and hiring — all in one surface.
        </p>
      </div>

      {/* Sub-tab nav — scrollable on mobile */}
      <nav className="flex gap-0.5 border-b border-[#1F1F23] mb-6 overflow-x-auto">
        {PEOPLE_TABS.map((tab) => {
          const isActive = active === tab;
          return (
            <button
              key={tab}
              onClick={() => setActive(tab)}
              className="mono text-[11px] uppercase tracking-[0.12em] px-4 py-2.5 rounded-t-lg transition-colors relative shrink-0 whitespace-nowrap"
              style={{
                color: isActive ? '#E5E5E7' : 'rgba(229,229,231,0.45)',
                background: isActive ? '#141416' : 'transparent',
              }}
            >
              {PEOPLE_TAB_LABELS[tab]}
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                  style={{ backgroundColor: '#FF6B2B' }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Sub-tab content */}
      <div>
        {active === 'customers' && <CustomersPipeline />}
        {active === 'team' && <TeamMyDay />}
        {active === 'network' && <Network />}
        {active === 'hiring' && <Hiring forceShow />}
      </div>
    </div>
  );
}
