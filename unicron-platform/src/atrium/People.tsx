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
        <h1 className="mono text-[18px] text-text-primary font-semibold">People</h1>
        <p className="mono text-[11px] text-text-secondary mt-1">
          Customers, team, network, and hiring — all in one surface.
        </p>
      </div>

      {/* Sub-tab nav — scrollable on mobile */}
      <nav
        className="flex gap-0.5 border-b border-border-default mb-6 overflow-x-auto"
        aria-label="People sub-tabs"
        role="tablist"
      >
        {PEOPLE_TABS.map((tab) => {
          const isActive = active === tab;
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={isActive}
              aria-controls={`people-panel-${tab}`}
              onClick={() => setActive(tab)}
              className="mono text-[11px] uppercase tracking-[0.12em] px-4 py-2.5 rounded-t-lg transition-colors relative shrink-0 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-zinc-500"
              style={{
                color: isActive ? 'var(--accent)' : 'var(--text-lo)',
                background: isActive ? 'var(--bg-elevated)' : 'transparent',
              }}
            >
              {PEOPLE_TAB_LABELS[tab]}
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                  style={{ backgroundColor: 'var(--accent)' }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Sub-tab content */}
      <section id={`people-panel-${active}`} role="tabpanel" aria-label={PEOPLE_TAB_LABELS[active]}>
        {active === 'customers' && <CustomersPipeline />}
        {active === 'team' && <TeamMyDay />}
        {active === 'network' && <Network />}
        {active === 'hiring' && <Hiring forceShow />}
      </section>
    </div>
  );
}
