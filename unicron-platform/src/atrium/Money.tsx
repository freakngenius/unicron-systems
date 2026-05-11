// Money.tsx — v3 redesign Pass 1 (R4 of Atrium Total Tab Rewrite)
// v3-money.jsx IA: Geist display title, 4 metric cards (Cash / Runway / Net MRR / Burn 30d),
// v3 blue underline sub-tabs. Sub-tab content (Accounts/Runway/Revenue/Expenses/CostSpikes)
// preserved verbatim — internal visual fidelity is follow-up Pass 2.

import { useState, useEffect } from 'react';
import { getSupabase } from '../lib/supabase';
import { Accounts } from './money/Accounts';
import { Runway } from './money/Runway';
import { Revenue } from './money/Revenue';
import { Expenses } from './money/Expenses';
import { CostSpikes } from './money/CostSpikes';

const MONEY_TABS = [
  { id: 'runway',   label: 'Runway' },
  { id: 'revenue',  label: 'Revenue' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'spikes',   label: 'Cost spikes' },
  { id: 'accounts', label: 'Accounts' },
] as const;

type MoneyTab = (typeof MONEY_TABS)[number]['id'];

// ─── Money metrics (drives 4 cards) ──────────────────────────────────────────

interface MoneyMetrics {
  cashOnHandUsd: number | null;
  runwayMonths: number | null;
  netMrrUsd: number | null;
  burn30dUsd: number | null;
}

function useMoneyMetrics(): MoneyMetrics {
  const [m, setM] = useState<MoneyMetrics>({
    cashOnHandUsd: null, runwayMonths: null, netMrrUsd: null, burn30dUsd: null,
  });
  useEffect(() => {
    let cancelled = false;
    getSupabase()
      .rpc('ns_money_metrics')
      .then(({ data }) => {
        if (cancelled) return;
        const row = (data as Array<{ cash_on_hand_usd: number; runway_months: number; net_mrr_usd: number; burn_30d_usd: number }> | null)?.[0];
        if (row) {
          setM({
            cashOnHandUsd: row.cash_on_hand_usd,
            runwayMonths: row.runway_months,
            netMrrUsd: row.net_mrr_usd,
            burn30dUsd: row.burn_30d_usd,
          });
        }
      })
      .catch(() => {/* RPC may not exist yet */});
    return () => { cancelled = true; };
  }, []);
  return m;
}

function fmtUsd(n: number | null, compact = true): string {
  if (n === null) return '—';
  if (!compact) return `$${n.toLocaleString()}`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

function MetricCard({ label, value, sublabel, change, sparkline, accent }: {
  label: string; value: string; sublabel?: string;
  change?: { value: string; tone: 'up' | 'down' | 'flat' };
  sparkline?: number[]; accent?: string;
}) {
  const max = sparkline ? Math.max(...sparkline, 1) : 1;
  const toneColor = change?.tone === 'up' ? '#2E8E66' : change?.tone === 'down' ? '#E14B4B' : '#7E8AA3';
  return (
    <div className="bg-white border border-border-default rounded-xl px-4 py-3.5 shadow-sm">
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

export function Money() {
  const [active, setActive] = useState<MoneyTab>('runway');
  const m = useMoneyMetrics();

  return (
    <div className="w-full">
      <div className="px-7 pt-6 pb-3 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11.5px] text-text-muted mb-1.5">Cash, revenue, burn</div>
          <h1 className="text-[36px] font-semibold text-text-primary leading-none tracking-tight" style={{ fontFamily: 'var(--font-display)', letterSpacing: -0.7 }}>
            Money
          </h1>
        </div>
      </div>

      {/* 4 metric cards — always visible above sub-tabs */}
      <div className="px-7 pb-4 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <MetricCard
          label="Cash on hand"
          value={fmtUsd(m.cashOnHandUsd)}
          sublabel={m.cashOnHandUsd === null ? 'DEMO · wire ns_money_metrics' : undefined}
          change={{ value: 'flat', tone: 'flat' }}
          sparkline={[1, 1, 1, 1, 1, 1, 1]}
        />
        <MetricCard
          label="Runway"
          value={m.runwayMonths === null ? '—' : `${m.runwayMonths}mo`}
          sublabel={m.runwayMonths === null ? 'DEMO' : undefined}
          change={{ value: 'flat', tone: 'flat' }}
        />
        <MetricCard
          label="Net MRR"
          value={fmtUsd(m.netMrrUsd)}
          sublabel={m.netMrrUsd === null || m.netMrrUsd === 0 ? 'Pre-revenue' : undefined}
          change={{ value: 'flat', tone: 'flat' }}
        />
        <MetricCard
          label="Burn (30d)"
          value={fmtUsd(m.burn30dUsd)}
          sublabel={m.burn30dUsd === null ? 'DEMO' : undefined}
          change={{ value: 'flat', tone: 'flat' }}
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
          {active === 'runway' && <Runway />}
          {active === 'revenue' && <Revenue />}
          {active === 'expenses' && <Expenses />}
          {active === 'spikes' && <CostSpikes />}
          {active === 'accounts' && <Accounts />}
        </section>
      </div>
    </div>
  );
}
