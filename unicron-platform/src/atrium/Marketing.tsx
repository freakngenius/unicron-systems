// Marketing.tsx — Pass 2 (R5): cut analytics fiction, keep what's real.
//
// SLOT MATRIX (Pass 2 R5):
//  - Site visits (30d) · status: CUT · no traffic provider connected.
//  - Waitlist · status: CUT · no signup endpoint.
//  - Manifesto reads · status: CUT · no page-view counter.
//  - Reply rate · status: CUT · no email-reply tracker.
//  - Analytics sub-tab (funnel + traffic + attribution donut) · status:
//    CUT — all three components require traffic provider that isn't wired.
//  - Campaigns sub-tab · status: KEPT (real) · nervous_system.campaigns
//    table exists; Pass 1 Campaigns.tsx already queries it.
//  - Content sub-tab · status: KEPT (real) · vault-backed.
//  - Brand assets sub-tab · status: KEPT (real) · file-system backed.
//
// Result: Marketing shrinks from 4 sub-tabs + 4 stat cards to 3 sub-tabs +
// 0 stat cards + a top-line CTA flagging the missing analytics connector.

import { useState } from 'react';
import { Campaigns } from './marketing/Campaigns';
import { Content } from './marketing/Content';
import { BrandAssets } from './marketing/BrandAssets';

const MARKETING_TABS = [
  { id: 'campaigns',    label: 'Campaigns' },
  { id: 'content',      label: 'Content' },
  { id: 'brand-assets', label: 'Brand assets' },
] as const;

type MarketingTab = (typeof MARKETING_TABS)[number]['id'];

export function Marketing() {
  const [active, setActive] = useState<MarketingTab>('campaigns');

  return (
    <div className="w-full">
      <div className="px-7 pt-6 pb-3 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11.5px] text-text-muted mb-1.5">Campaigns, content, brand</div>
          <h1 className="text-[36px] font-semibold text-text-primary leading-none tracking-tight" style={{ fontFamily: 'var(--font-display)', letterSpacing: -0.7 }}>
            Marketing
          </h1>
        </div>
        <button className="text-[13px] font-semibold px-3.5 py-2 rounded-md text-white" style={{ background: '#6081BE' }}>
          + New campaign
        </button>
      </div>

      {/* Connector callout — replaces the 4 cut analytics stat cards */}
      <div className="px-7 pb-4">
        <div className="bg-white border border-border-default rounded-xl px-4 py-3.5 shadow-sm flex items-start gap-3">
          <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: '#7E8AA3' }} />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] text-text-primary font-medium">
              Analytics not connected
            </div>
            <div className="text-[11.5px] text-text-muted mt-0.5">
              Site visits, waitlist, manifesto reads, and reply rate require a traffic provider
              (e.g. Plausible) + signup + email tracking. Pass 2 cut the placeholder cards until
              a connector ships.
            </div>
          </div>
          <button className="text-[12px] font-semibold px-3 py-1.5 rounded-md border border-border-default text-text-secondary hover:bg-bg-raised whitespace-nowrap shrink-0">
            Connect Plausible
          </button>
        </div>
      </div>

      <div className="flex gap-1 px-7 border-b border-border-default overflow-x-auto">
        {MARKETING_TABS.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`px-3.5 py-3 -mb-px text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive ? 'border-[#6081BE] text-[#6081BE]' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
              role="tab"
              aria-selected={isActive}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="px-7 py-5">
        <section role="tabpanel" aria-label={MARKETING_TABS.find((t) => t.id === active)?.label}>
          {active === 'campaigns'    && <Campaigns />}
          {active === 'content'      && <Content />}
          {active === 'brand-assets' && <BrandAssets />}
        </section>
      </div>
    </div>
  );
}
