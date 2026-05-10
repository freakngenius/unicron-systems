// Products.tsx — Sprint 6 Stream B
// Atrium Products tab root. Two sub-views: Pathfinder | Metacron.
// Follows the same pattern as Money.tsx and People.tsx.

import { useState } from 'react';
import { PathfinderProduct } from './products/PathfinderProduct';
import { MetacronProduct } from './products/MetacronProduct';

// ── Constants ─────────────────────────────────────────────────────────────────

const PRODUCTS_TABS = ['pathfinder', 'metacron'] as const;

type ProductsTab = (typeof PRODUCTS_TABS)[number];

const PRODUCTS_TAB_LABELS: Record<ProductsTab, string> = {
  pathfinder: 'Pathfinder',
  metacron:   'Metacron',
};

const PRODUCTS_TAB_DESCRIPTIONS: Record<ProductsTab, string> = {
  pathfinder: 'Customer-facing lead intelligence. Tenant health, agent pipeline, cross-pollination signals.',
  metacron:   'Operator platform. Agent fleet, Architect proposals, sprint velocity.',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function Products() {
  const [active, setActive] = useState<ProductsTab>('pathfinder');

  return (
    <div className="max-w-5xl w-full">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="mono text-[18px] text-[#E5E5E7] font-semibold">Products</h1>
        <p className="mono text-[11px] text-[rgba(229,229,231,0.5)] mt-1">
          {PRODUCTS_TAB_DESCRIPTIONS[active]}
        </p>
      </div>

      {/* Sub-tab nav — scrollable on mobile */}
      <nav
        className="flex gap-0.5 border-b border-[#1F1F23] mb-6 overflow-x-auto"
        aria-label="Products sub-tabs"
        role="tablist"
      >
        {PRODUCTS_TABS.map((tab) => {
          const isActive = active === tab;
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={isActive}
              aria-controls={`products-panel-${tab}`}
              onClick={() => setActive(tab)}
              className="mono text-[11px] uppercase tracking-[0.12em] px-4 py-2.5 rounded-t-lg transition-colors relative shrink-0 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-zinc-500"
              style={{
                color: isActive ? '#E5E5E7' : 'rgba(229,229,231,0.45)',
                background: isActive ? '#141416' : 'transparent',
              }}
            >
              {PRODUCTS_TAB_LABELS[tab]}
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
      <section id={`products-panel-${active}`} role="tabpanel" aria-label={PRODUCTS_TAB_LABELS[active]}>
        {active === 'pathfinder' && <PathfinderProduct />}
        {active === 'metacron' && <MetacronProduct />}
      </section>
    </div>
  );
}
