// Money.tsx — Sprint 5 Stream F
// Atrium Money tab root. 5 sub-views: Accounts | Runway | Revenue | Expenses | Spikes.
// Follows the same pattern as Work.tsx (sub-tab nav + lazy-mounted panels).

import { useState } from 'react';
import { Accounts } from './money/Accounts';
import { Runway } from './money/Runway';
import { Revenue } from './money/Revenue';
import { Expenses } from './money/Expenses';
import { CostSpikes } from './money/CostSpikes';

// ── Constants ─────────────────────────────────────────────────────────────────

const MONEY_TABS = [
  'accounts',
  'runway',
  'revenue',
  'expenses',
  'spikes',
] as const;

type MoneyTab = (typeof MONEY_TABS)[number];

const MONEY_TAB_LABELS: Record<MoneyTab, string> = {
  accounts: 'Accounts',
  runway:   'Runway',
  revenue:  'Revenue',
  expenses: 'Expenses',
  spikes:   'Cost Spikes',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function Money() {
  const [active, setActive] = useState<MoneyTab>('accounts');

  return (
    <div className="max-w-5xl w-full">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="mono text-[18px] text-[#E5E5E7] font-semibold">Money</h1>
        <p className="mono text-[11px] text-[rgba(229,229,231,0.5)] mt-1">
          Connected services, runway projection, revenue pipeline, expense tracking, and cost anomalies.
        </p>
      </div>

      {/* Sub-tab nav — scrollable on mobile */}
      <nav
        className="flex gap-0.5 border-b border-[#1F1F23] mb-6 overflow-x-auto"
        aria-label="Money sub-tabs"
        role="tablist"
      >
        {MONEY_TABS.map((tab) => {
          const isActive = active === tab;
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={isActive}
              aria-controls={`money-panel-${tab}`}
              onClick={() => setActive(tab)}
              className="mono text-[11px] uppercase tracking-[0.12em] px-4 py-2.5 rounded-t-lg transition-colors relative shrink-0 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-zinc-500"
              style={{
                color: isActive ? '#E5E5E7' : 'rgba(229,229,231,0.45)',
                background: isActive ? '#141416' : 'transparent',
              }}
            >
              {MONEY_TAB_LABELS[tab]}
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
      <section id={`money-panel-${active}`} role="tabpanel" aria-label={MONEY_TAB_LABELS[active]}>
        {active === 'accounts'  && <Accounts />}
        {active === 'runway'    && <Runway />}
        {active === 'revenue'   && <Revenue />}
        {active === 'expenses'  && <Expenses />}
        {active === 'spikes'    && <CostSpikes />}
      </section>
    </div>
  );
}
