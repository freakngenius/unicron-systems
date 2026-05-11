// Products.tsx — v3 redesign Pass 1 (R6 of Atrium Total Tab Rewrite)
// v3-products.jsx IA: Geist display title, 4 always-visible metric cards
// (Active tenants / Leads ranked·wk / Reply rate / Verifier accuracy),
// v3 blue underline sub-tabs Pathfinder | Metacron. Sub-tab content
// preserved verbatim; tenant table styling is Pass 2.

import { useState, useEffect } from 'react';
import { getSupabase } from '../lib/supabase';
import { PathfinderProduct } from './products/PathfinderProduct';
import { MetacronProduct } from './products/MetacronProduct';

const PRODUCTS_TABS = [
  { id: 'pathfinder', label: 'Pathfinder' },
  { id: 'metacron',   label: 'Metacron' },
] as const;

type ProductsTab = (typeof PRODUCTS_TABS)[number]['id'];

interface ProductsMetrics {
  activeTenants: number | null;
  leadsRankedWk: number | null;
  replyRatePct: number | null;
  verifierAccuracyPct: number | null;
}

function useProductsMetrics(): ProductsMetrics {
  const [m, setM] = useState<ProductsMetrics>({
    activeTenants: null, leadsRankedWk: null, replyRatePct: null, verifierAccuracyPct: null,
  });
  useEffect(() => {
    let cancelled = false;
    getSupabase()
      .rpc('ns_products_metrics')
      .then(({ data }) => {
        if (cancelled) return;
        const row = (data as Array<{ active_tenants: number; leads_ranked_wk: number; reply_rate_pct: number; verifier_accuracy_pct: number }> | null)?.[0];
        if (row) {
          setM({
            activeTenants: row.active_tenants,
            leadsRankedWk: row.leads_ranked_wk,
            replyRatePct: row.reply_rate_pct,
            verifierAccuracyPct: row.verifier_accuracy_pct,
          });
        }
      })
      .catch(() => {/* RPC may not exist yet */});
    return () => { cancelled = true; };
  }, []);
  return m;
}

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

export function Products() {
  const [active, setActive] = useState<ProductsTab>('pathfinder');
  const m = useProductsMetrics();

  return (
    <div className="w-full">
      <div className="px-7 pt-6 pb-3">
        <div className="text-[11.5px] text-text-muted mb-1.5">Tenants, leads, accuracy</div>
        <h1 className="text-[36px] font-semibold text-text-primary leading-none tracking-tight" style={{ fontFamily: 'var(--font-display)', letterSpacing: -0.7 }}>
          Products
        </h1>
      </div>

      <div className="px-7 pb-4 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <MetricCard
          label="Active tenants"
          value={m.activeTenants === null ? '—' : String(m.activeTenants)}
          sublabel={m.activeTenants === null ? 'DEMO · wire ns_products_metrics' : undefined}
          demo={m.activeTenants === null}
          change={{ value: 'flat', tone: 'flat' }}
        />
        <MetricCard
          label="Leads ranked (wk)"
          value={m.leadsRankedWk === null ? '—' : String(m.leadsRankedWk)}
          sublabel={m.leadsRankedWk === null ? 'DEMO' : undefined}
          demo={m.leadsRankedWk === null}
          change={{ value: 'flat', tone: 'flat' }}
        />
        <MetricCard
          label="Reply rate"
          value={m.replyRatePct === null ? '—' : `${m.replyRatePct}%`}
          sublabel={m.replyRatePct === null ? 'DEMO' : undefined}
          demo={m.replyRatePct === null}
          change={{ value: 'flat', tone: 'flat' }}
          accent="#2E8E66"
        />
        <MetricCard
          label="Verifier accuracy"
          value={m.verifierAccuracyPct === null ? '—' : `${m.verifierAccuracyPct}%`}
          sublabel={m.verifierAccuracyPct === null ? 'DEMO' : undefined}
          demo={m.verifierAccuracyPct === null}
          change={{ value: 'flat', tone: 'flat' }}
        />
      </div>

      <div className="flex gap-1 px-7 border-b border-border-default overflow-x-auto">
        {PRODUCTS_TABS.map((tab) => {
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
        <section role="tabpanel" aria-label={PRODUCTS_TABS.find((t) => t.id === active)?.label}>
          {active === 'pathfinder' && <PathfinderProduct />}
          {active === 'metacron' && <MetacronProduct />}
        </section>
      </div>
    </div>
  );
}
