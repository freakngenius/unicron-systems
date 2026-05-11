// Money.tsx — Pass 2 (R4): cut fiction, wire what's real.
//
// SLOT MATRIX (Pass 2 R4):
//  - Cash on hand · status: CUT · no bank integration / cash table.
//  - Runway months · status: CUT · depends on cash on hand (cut).
//  - 12-month runway projection chart · status: CUT (lived inside Runway
//    subcomponent, not the shell — Bug Fix card stands until cash lands).
//  - Net MRR · status: real · literal $0 with "Pre-revenue · Zedcor pilot
//    in flight" label until Stripe Connect wires revenue.
//  - Burn (30d) · status: real · ns_money_burn_from_services — sum of
//    connected_services.monthly_cost_usd. The accurate operational burn
//    proxy until expense_tracking ships.
//  - Sub-tabs: Runway / Revenue / Expenses / Cost spikes / Accounts — kept
//    as-is. Runway sub-tab content cut to a "Requires bank integration"
//    empty state (the 12-month chart card belongs there).

import { useState, useEffect } from 'react';
import { getSupabase } from '../lib/supabase';
import { Accounts } from './money/Accounts';
import { Revenue } from './money/Revenue';
import { Expenses } from './money/Expenses';
import { CostSpikes } from './money/CostSpikes';

const MONEY_TABS = [
  { id: 'revenue',  label: 'Revenue' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'spikes',   label: 'Cost spikes' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'runway',   label: 'Runway' },
] as const;

type MoneyTab = (typeof MONEY_TABS)[number]['id'];

// ─── Burn metric (real) ──────────────────────────────────────────────────────

function useBurnFromServices(): { monthly: number | null; services: number | null } {
  const [s, setS] = useState<{ monthly: number | null; services: number | null }>({
    monthly: null, services: null,
  });
  useEffect(() => {
    let cancelled = false;
    getSupabase()
      .rpc('ns_money_burn_from_services')
      .then(({ data }) => {
        if (cancelled) return;
        const row = (data as Array<{ monthly_burn_usd: number; services_count: number }> | null)?.[0];
        if (row) setS({ monthly: Number(row.monthly_burn_usd), services: Number(row.services_count) });
      })
      .catch(() => {/* leave nulls */});
    return () => { cancelled = true; };
  }, []);
  return s;
}

function fmtUsd(n: number | null, compact = true): string {
  if (n === null) return '—';
  if (!compact) return `$${n.toLocaleString()}`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

function MetricCard({ label, value, sublabel, accent }: {
  label: string; value: string; sublabel?: string; accent?: string;
}) {
  return (
    <div className="bg-white border border-border-default rounded-xl px-4 py-3.5 shadow-sm">
      <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted font-semibold">{label}</div>
      <div className="text-[26px] font-semibold text-text-primary mt-2" style={{ fontFamily: 'var(--font-display)', letterSpacing: -0.5, lineHeight: 1, color: accent ?? undefined }}>
        {value}
      </div>
      {sublabel && (
        <div className="text-[12px] text-text-muted mt-2.5 truncate">{sublabel}</div>
      )}
    </div>
  );
}

export function Money() {
  const [active, setActive] = useState<MoneyTab>('accounts');
  const burn = useBurnFromServices();

  return (
    <div className="w-full">
      <div className="px-7 pt-6 pb-3">
        <div className="text-[11.5px] text-text-muted mb-1.5">Burn from connected services, revenue, accounts</div>
        <h1 className="text-[36px] font-semibold text-text-primary leading-none tracking-tight" style={{ fontFamily: 'var(--font-display)', letterSpacing: -0.7 }}>
          Money
        </h1>
      </div>

      {/* 2 real metric cards — Cash on hand + Runway months CUT, will return when bank integration lands */}
      <div className="px-7 pb-4 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <MetricCard
          label="Net MRR"
          value="$0"
          sublabel="Pre-revenue · Zedcor pilot in flight"
        />
        <MetricCard
          label="Burn (30d, services)"
          value={fmtUsd(burn.monthly)}
          sublabel={burn.services === null ? '—' : `${burn.services} connected services`}
          accent="#E14B4B"
        />
      </div>

      <div className="flex gap-1 px-7 border-b border-border-default overflow-x-auto">
        {MONEY_TABS.map((tab) => {
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
        <section role="tabpanel" aria-label={MONEY_TABS.find((t) => t.id === active)?.label}>
          {active === 'revenue' && <Revenue />}
          {active === 'expenses' && <Expenses />}
          {active === 'spikes' && <CostSpikes />}
          {active === 'accounts' && <Accounts />}
          {active === 'runway' && (
            <div className="bg-white border border-border-default rounded-xl px-6 py-12 text-center">
              <div className="text-[14px] text-text-primary font-semibold mb-1.5" style={{ fontFamily: 'var(--font-display)' }}>
                Runway needs bank integration
              </div>
              <div className="text-[12px] text-text-muted max-w-md mx-auto leading-relaxed">
                Cash on hand and runway months require a connected bank or cash-balance source.
                Pass 2 cut the static placeholder — the 12-month projection chart will return
                when the integration ships.
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
