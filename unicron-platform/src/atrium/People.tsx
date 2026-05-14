// People.tsx — v3 redesign Pass 1 (R2 of Atrium Total Tab Rewrite)
// IA + shell match v3-work-fills.jsx (People portion): page title + 4 metric cards
// + filter sidebar + sub-tab nav (blue underline) + content panel.
// Sub-tab content (CustomersPipeline, TeamMyDay, Network, Hiring) preserved as-is;
// internal visual fidelity is a follow-up Bug Fix card.

import { useState, useEffect } from 'react';
import { getSupabase } from '../lib/supabase';
import { CustomersPipeline } from './people/CustomersPipeline';
import { TeamMyDay } from './people/TeamMyDay';
import { Network } from './people/Network';
import { Hiring } from './people/Hiring';
import { AddPersonModal, type PeopleAddTab } from './people/AddPersonModal';
import { useFilterSidebarCollapsed } from './useFilterSidebarCollapsed';
import { FilterSidebarToggle, FilterSidebarExpandStrip } from './components/FilterSidebarToggle';
import { AtriumIcon, type AtriumIconName } from './icons';

type PeopleTab = 'customers' | 'team' | 'network' | 'hiring';

const PEOPLE_TABS: { id: PeopleTab; label: string; icon: AtriumIconName }[] = [
  { id: 'customers', label: 'Customers', icon: 'Heart'  },
  { id: 'team',      label: 'Team',      icon: 'People' },
  { id: 'network',   label: 'Network',   icon: 'Globe'  },
  { id: 'hiring',    label: 'Hiring',    icon: 'Tag'    },
];

interface BoardCounts {
  customers: number | null;
  team: number | null;
  network: number | null;
  hiring: number | null;
}

function useBoardCounts(): BoardCounts {
  const [counts, setCounts] = useState<BoardCounts>({
    customers: null, team: null, network: null, hiring: null,
  });

  useEffect(() => {
    let cancelled = false;
    const sb = getSupabase();
    // SLOT: Board counts · STATUS: real (customers, team) / null (network, hiring
    // until ns_count_network_contacts + ns_count_hiring_candidates ship).
    Promise.all([
      sb.rpc('ns_count_customers'),
      sb.rpc('ns_count_team_members'),
      sb.rpc('ns_count_network_contacts'),
      sb.rpc('ns_count_hiring_candidates'),
    ]).then(([c, t, n, h]) => {
      if (cancelled) return;
      setCounts({
        customers: typeof c.data === 'number' ? c.data : null,
        team:      typeof t.data === 'number' ? t.data : null,
        network:   typeof n.data === 'number' ? n.data : null,
        hiring:    typeof h.data === 'number' ? h.data : null,
      });
    }).catch(() => {/* leave nulls */});
    return () => { cancelled = true; };
  }, []);

  return counts;
}

// SLOT: Customer metrics (ARR / At-risk / Renewal exposure) · STATUS: real
// SOURCE: ns_customers_arr_total / ns_count_at_risk_customers /
//         ns_renewal_exposure_30d RPCs over nervous_system.customers
//         (schema extended in migration customers_extend_for_atrium_pass2).
interface CustomerMetrics {
  arrTotal: number | null;
  atRiskCount: number | null;
  renewalExposure30d: number | null;
}

function useCustomerMetrics(): CustomerMetrics {
  const [m, setM] = useState<CustomerMetrics>({
    arrTotal: null, atRiskCount: null, renewalExposure30d: null,
  });
  useEffect(() => {
    let cancelled = false;
    const sb = getSupabase();
    Promise.all([
      sb.rpc('ns_customers_arr_total'),
      sb.rpc('ns_count_at_risk_customers'),
      sb.rpc('ns_renewal_exposure_30d'),
    ]).then(([arr, atRisk, ren]) => {
      if (cancelled) return;
      setM({
        arrTotal:           typeof arr.data === 'number' ? arr.data : null,
        atRiskCount:        typeof atRisk.data === 'number' ? atRisk.data : null,
        renewalExposure30d: typeof ren.data === 'number' ? ren.data : null,
      });
    }).catch(() => {/* leave nulls */});
    return () => { cancelled = true; };
  }, []);
  return m;
}

function fmtUsdCompact(n: number | null): string {
  if (n === null) return '—';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

// ─── Metric card ──────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: string;
  sublabel?: string;
  change?: { value: string; tone: 'up' | 'down' | 'flat' };
  sparkline?: number[];
}

function MetricCard({ label, value, sublabel, change, sparkline }: MetricCardProps) {
  const max = sparkline ? Math.max(...sparkline, 1) : 1;
  const toneColor =
    change?.tone === 'up' ? '#2E8E66' : change?.tone === 'down' ? '#E14B4B' : '#7E8AA3';
  return (
    <div className="bg-white border border-border-default rounded-xl px-4 py-3.5 shadow-sm">
      <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted font-semibold">{label}</div>
      <div className="flex items-baseline justify-between gap-3 mt-2">
        <div className="text-[26px] font-semibold text-text-primary tracking-tight" style={{ fontFamily: 'var(--font-display)', letterSpacing: -0.5, lineHeight: 1 }}>
          {value}
        </div>
        {change && (
          <span className="text-[11.5px] font-semibold" style={{ color: toneColor }}>
            {change.tone === 'up' ? '↑' : change.tone === 'down' ? '↓' : '·'} {change.value}
          </span>
        )}
      </div>
      {(sublabel || sparkline) && (
        <div className="flex items-end justify-between gap-3 mt-2.5 min-h-[20px]">
          {sublabel && <div className="text-[12px] text-text-muted truncate">{sublabel}</div>}
          {sparkline && (
            <svg width="80" height="20" viewBox="0 0 80 20" className="shrink-0">
              <polyline
                points={sparkline.map((v, i) => `${(i / (sparkline.length - 1)) * 80},${20 - (v / max) * 18}`).join(' ')}
                fill="none"
                stroke="#6081BE"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Filter sidebar ──────────────────────────────────────────────────────────

interface FilterGroupProps {
  label: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function FilterGroup({ label, count, defaultOpen, children }: FilterGroupProps) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border-t border-border-subtle py-2.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full text-[13px] font-semibold text-text-primary"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>
          <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="flex-1 text-left">{label}</span>
        {count !== undefined && count > 0 && (
          <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: '#6081BE', background: 'rgba(96,129,190,0.10)' }}>{count}</span>
        )}
      </button>
      {open && <div className="mt-1.5 pl-4">{children}</div>}
    </div>
  );
}

function FilterRow({ label, count, dot }: { label: string; count?: number | null; dot?: string }) {
  return (
    <label className="flex items-center gap-2 py-1 text-[13px] text-text-primary cursor-pointer">
      <input type="checkbox" defaultChecked className="w-3.5 h-3.5 accent-[#6081BE]" />
      {dot && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />}
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && count !== null && (
        <span className="text-[11px] font-mono text-text-muted">{count}</span>
      )}
    </label>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

// Atrium People (2026-05-14): the page-level Add button is context-aware —
// label + modal fields change with the active sub-tab.
const ADD_BUTTON_LABEL: Record<PeopleTab, string> = {
  customers: '+ Add Customer',
  team:      '+ Add Team member',
  network:   '+ Add Contact',
  hiring:    '+ Add Applicant',
};

export function People() {
  const [active, setActive] = useState<PeopleTab>('customers');
  const counts = useBoardCounts();
  const m = useCustomerMetrics();
  const [collapsed, setCollapsed] = useFilterSidebarCollapsed();
  // The single Add modal adapts its title + fields + RPC based on `active`.
  const [addOpen, setAddOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // After any successful insert, bump reloadKey so child views can re-fetch.
  useEffect(() => {
    const handler = () => setReloadKey((k) => k + 1);
    window.addEventListener('atrium:people-record-added', handler);
    return () => window.removeEventListener('atrium:people-record-added', handler);
  }, []);

  return (
    <div className="w-full">
      {/* Page title row */}
      <div className="px-7 pt-6 pb-3 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11.5px] text-text-muted mb-1.5">Relationships & roster</div>
          <h1 className="text-[36px] font-semibold text-text-primary leading-none tracking-tight" style={{ fontFamily: 'var(--font-display)', letterSpacing: -0.7 }}>
            People
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="text-[13px] font-semibold px-3.5 py-2 rounded-md text-white hover:opacity-90 transition-opacity"
          style={{ background: '#6081BE' }}
          title={ADD_BUTTON_LABEL[active].replace(/^\+\s*/, '')}
        >
          {ADD_BUTTON_LABEL[active]}
        </button>
      </div>

      <AddPersonModal
        open={addOpen}
        tab={active as PeopleAddTab}
        onClose={() => setAddOpen(false)}
      />

      {/* Sub-tab nav — v3 blue underline */}
      <div className="flex gap-1 px-7 border-b border-border-default">
        {PEOPLE_TABS.map((tab) => {
          const isActive = active === tab.id;
          const Icon = AtriumIcon[tab.icon];
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`px-3.5 py-3 -mb-px text-[13px] font-medium border-b-2 transition-colors inline-flex items-center gap-1.5 ${
                isActive ? 'border-[#6081BE] text-[#6081BE]' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
              role="tab"
              aria-selected={isActive}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Body grid: filter sidebar + main column */}
      <div className="px-7 py-5 grid gap-5" style={{ gridTemplateColumns: collapsed ? '32px minmax(0, 1fr)' : '240px minmax(0, 1fr)' }}>
        <style>{`
          @media (max-width: 1023px) { .people-filters { display: none !important; } .people-body { grid-template-columns: 1fr !important; } }
        `}</style>

        {collapsed ? (
          <FilterSidebarExpandStrip onExpand={() => setCollapsed(false)} />
        ) : (
        /* Filter sidebar */
        <aside className="people-filters flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11.5px] uppercase tracking-[0.14em] text-text-muted font-semibold">Filters</span>
            <div className="flex items-center gap-3">
              <button className="text-[11px] text-[#6081BE] font-medium">Reset</button>
              <FilterSidebarToggle collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
            </div>
          </div>
          <FilterGroup label="Board" count={4} defaultOpen>
            <FilterRow label="Customers" count={counts.customers} dot="#E8763A" />
            <FilterRow label="Team"      count={counts.team}      dot="#6081BE" />
            <FilterRow label="Network"   count={counts.network}   dot="#7355E5" />
            <FilterRow label="Hiring"    count={counts.hiring}    dot="#C28A1F" />
          </FilterGroup>
          <FilterGroup label="Stage">
            <FilterRow label="Live" />
            <FilterRow label="Onboarding" />
            <FilterRow label="At-risk" />
            <FilterRow label="Churned" />
          </FilterGroup>
          <FilterGroup label="Owner">
            <FilterRow label="Kyle K" />
            <FilterRow label="Keenan H" />
            <FilterRow label="Curtis S" />
            <FilterRow label="Unassigned" />
          </FilterGroup>
          <FilterGroup label="Last contact">
            <FilterRow label="< 7 days" />
            <FilterRow label="7–30 days" />
            <FilterRow label="30+ days" />
          </FilterGroup>
          <FilterGroup label="Tags"><div className="text-[12px] text-text-muted py-1">No tags yet</div></FilterGroup>
          <FilterGroup label="Location"><div className="text-[12px] text-text-muted py-1">No locations yet</div></FilterGroup>
        </aside>
        )}

        {/* Main column */}
        <div className="people-body flex flex-col gap-4 min-w-0">
          {/* Metric cards (Customers tab only — others show context-appropriate metrics in Pass 2) */}
          {active === 'customers' && (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <MetricCard
                label="Active customers"
                value={counts.customers === null ? '—' : String(counts.customers)}
              />
              <MetricCard
                label="ARR"
                value={fmtUsdCompact(m.arrTotal)}
                sublabel={m.arrTotal === 0 ? 'Pre-revenue · enter ARR per customer' : undefined}
              />
              <MetricCard
                label="At-risk"
                value={m.atRiskCount === null ? '—' : String(m.atRiskCount)}
                sublabel={m.atRiskCount === 0 ? 'None flagged' : undefined}
              />
              <MetricCard
                label="Renewal exposure (30d)"
                value={fmtUsdCompact(m.renewalExposure30d)}
                sublabel={m.renewalExposure30d === 0 ? 'No renewals in next 30d' : undefined}
              />
            </div>
          )}

          {/* Sub-tab content. `key={reloadKey}` forces a remount after an Add
              succeeds so the list refetches without each view needing its own
              event subscription. */}
          <section role="tabpanel" aria-label={PEOPLE_TABS.find((t) => t.id === active)?.label}>
            {active === 'customers' && <CustomersPipeline key={`customers-${reloadKey}`} />}
            {active === 'team' && <TeamMyDay key={`team-${reloadKey}`} />}
            {active === 'network' && <Network key={`network-${reloadKey}`} />}
            {active === 'hiring' && <Hiring forceShow key={`hiring-${reloadKey}`} />}
          </section>
        </div>
      </div>
    </div>
  );
}
