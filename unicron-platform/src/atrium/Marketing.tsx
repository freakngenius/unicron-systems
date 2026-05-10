// Marketing.tsx — Sprint 6 Stream A
// Atrium Marketing tab root. Sub-navigation: Campaigns | Content | Analytics | Brand Assets.
// Follows the same pattern as Money.tsx and People.tsx.

import { useState } from 'react';
import { Campaigns } from './marketing/Campaigns';
import { Content } from './marketing/Content';
import { Analytics } from './marketing/Analytics';
import { BrandAssets } from './marketing/BrandAssets';

// ── Constants ─────────────────────────────────────────────────────────────────

const MARKETING_TABS = [
  'campaigns',
  'content',
  'analytics',
  'brand-assets',
] as const;

type MarketingTab = (typeof MARKETING_TABS)[number];

const MARKETING_TAB_LABELS: Record<MarketingTab, string> = {
  campaigns:    'Campaigns',
  content:      'Content',
  analytics:    'Analytics',
  'brand-assets': 'Brand Assets',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function Marketing() {
  const [active, setActive] = useState<MarketingTab>('campaigns');

  return (
    <div className="max-w-5xl w-full">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="mono text-[18px] text-text-primary font-semibold">Marketing</h1>
        <p className="mono text-[11px] text-text-secondary mt-1">
          Campaigns, content pipeline, analytics, and brand assets — all in one surface.
        </p>
      </div>

      {/* Sub-tab nav — scrollable on mobile */}
      <nav
        className="flex gap-0.5 border-b border-border-default mb-6 overflow-x-auto"
        aria-label="Marketing sub-tabs"
        role="tablist"
      >
        {MARKETING_TABS.map((tab) => {
          const isActive = active === tab;
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={isActive}
              aria-controls={`marketing-panel-${tab}`}
              onClick={() => setActive(tab)}
              className="mono text-[11px] uppercase tracking-[0.12em] px-4 py-2.5 rounded-t-lg transition-colors relative shrink-0 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-zinc-500"
              style={{
                color: isActive ? '#C9A227' : 'var(--text-lo)',
                background: isActive ? 'var(--bg-elevated)' : 'transparent',
              }}
            >
              {MARKETING_TAB_LABELS[tab]}
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                  style={{ backgroundColor: '#C9A227' }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Sub-tab content */}
      <section id={`marketing-panel-${active}`} role="tabpanel" aria-label={MARKETING_TAB_LABELS[active]}>
        {active === 'campaigns'    && <Campaigns />}
        {active === 'content'      && <Content />}
        {active === 'analytics'    && <Analytics />}
        {active === 'brand-assets' && <BrandAssets />}
      </section>
    </div>
  );
}
