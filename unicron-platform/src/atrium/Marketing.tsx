// Marketing.tsx — v3 redesign Pass 1 (R5 of Atrium Total Tab Rewrite)
// v3-marketing.jsx IA: Geist display title, 4 always-visible metric cards
// (Site visits 30d / Waitlist / Manifesto reads / Reply rate), v3 blue
// underline sub-tabs. Sub-tab content preserved verbatim; metric cards use
// DEMO data flagged inline until traffic + email backend wires up.

import { useState } from 'react';
import { Campaigns } from './marketing/Campaigns';
import { Content } from './marketing/Content';
import { Analytics } from './marketing/Analytics';
import { BrandAssets } from './marketing/BrandAssets';

const MARKETING_TABS = [
  { id: 'campaigns',    label: 'Campaigns' },
  { id: 'content',      label: 'Content' },
  { id: 'analytics',    label: 'Analytics' },
  { id: 'brand-assets', label: 'Brand assets' },
] as const;

type MarketingTab = (typeof MARKETING_TABS)[number]['id'];

function MetricCard({ label, value, sublabel, change, sparkline, accent, demo }: {
  label: string; value: string; sublabel?: string;
  change?: { value: string; tone: 'up' | 'down' | 'flat' };
  sparkline?: number[]; accent?: string; demo?: boolean;
}) {
  const max = sparkline ? Math.max(...sparkline, 1) : 1;
  const toneColor = change?.tone === 'up' ? '#2E8E66' : change?.tone === 'down' ? '#E14B4B' : '#7E8AA3';
  return (
    <div className="bg-white border border-border-default rounded-xl px-4 py-3.5 shadow-sm relative">
      {demo && (
        <span className="absolute top-2 right-2 text-[9px] uppercase tracking-[0.12em] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(96,129,190,0.10)', color: '#6081BE' }}>
          DEMO
        </span>
      )}
      <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted font-semibold">{label}</div>
      <div className="flex items-baseline justify-between gap-3 mt-2">
        <div className="text-[26px] font-semibold text-text-primary" style={{ fontFamily: 'var(--font-display)', letterSpacing: -0.5, lineHeight: 1, color: accent ?? undefined }}>{value}</div>
        {change && <span className="text-[11.5px] font-semibold" style={{ color: toneColor }}>{change.tone === 'up' ? '↑' : change.tone === 'down' ? '↓' : '·'} {change.value}</span>}
      </div>
      {(sublabel || sparkline) && (
        <div className="flex items-end justify-between gap-3 mt-2.5 min-h-[20px]">
          {sublabel && <div className="text-[12px] text-text-muted truncate">{sublabel}</div>}
          {sparkline && (
            <svg width="80" height="20" viewBox="0 0 80 20" className="shrink-0">
              <polyline
                points={sparkline.map((v, i) => `${(i / (sparkline.length - 1)) * 80},${20 - (v / max) * 18}`).join(' ')}
                fill="none" stroke={accent ?? '#6081BE'} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      )}
    </div>
  );
}

export function Marketing() {
  const [active, setActive] = useState<MarketingTab>('campaigns');

  return (
    <div className="w-full">
      <div className="px-7 pt-6 pb-3 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11.5px] text-text-muted mb-1.5">Reach, voice, attribution</div>
          <h1 className="text-[36px] font-semibold text-text-primary leading-none tracking-tight" style={{ fontFamily: 'var(--font-display)', letterSpacing: -0.7 }}>
            Marketing
          </h1>
        </div>
        <button className="text-[13px] font-semibold px-3.5 py-2 rounded-md text-white" style={{ background: '#6081BE' }}>
          + New campaign
        </button>
      </div>

      <div className="px-7 pb-4 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <MetricCard label="Site visits (30d)" value="—"   sublabel="Wire analytics provider" demo change={{ value: 'flat', tone: 'flat' }} sparkline={[1, 1, 1, 1, 1, 1, 1]} />
        <MetricCard label="Waitlist"          value="—"   sublabel="Wire signup endpoint"    demo change={{ value: 'flat', tone: 'flat' }} />
        <MetricCard label="Manifesto reads"   value="—"   sublabel="Wire page-view counter"  demo change={{ value: 'flat', tone: 'flat' }} />
        <MetricCard label="Reply rate"        value="—"   sublabel="Wire email reply tracker" demo change={{ value: 'flat', tone: 'flat' }} accent="#2E8E66" />
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
          {active === 'analytics'    && <Analytics />}
          {active === 'brand-assets' && <BrandAssets />}
        </section>
      </div>
    </div>
  );
}
