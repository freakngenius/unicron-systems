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
        <h1 className="mono text-[18px] text-[#E5E5E7] font-semibold">Marketing</h1>
        <p className="mono text-[11px] text-[rgba(229,229,231,0.5)] mt-1">
          Campaigns, content pipeline, analytics, and brand assets — all in one surface.
        </p>
      </div>

      {/* Sub-tab nav — scrollable on mobile */}
      <nav className="flex gap-0.5 border-b border-[#1F1F23] mb-6 overflow-x-auto">
        {MARKETING_TABS.map((tab) => {
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
              {MARKETING_TAB_LABELS[tab]}
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
        {active === 'campaigns'    && <Campaigns />}
        {active === 'content'      && <Content />}
        {active === 'analytics'    && <Analytics />}
        {active === 'brand-assets' && <BrandAssets />}
      </div>
    </div>
  );
}
