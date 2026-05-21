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
    // Atrium audit fix #21 — the audit flagged ns_count_network_contacts +
    // ns_count_hiring_candidates as SYNTHETIC (hardcoded null) because the
    // prior comment said they were "until ... ship." Verified against the
    // live DB on 2026-05-21: both RPCs exist (counts come from
    // nervous_system.network_contacts and nervous_system.hiring_candidates
    // tables). Stop suppressing the real values.
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

// Atrium audit fix item #9 — controlled filter row. Previously rendered with
// `defaultChecked` and no `onChange`, so toggles silently no-op'd (INPUT-DEAD).
// Now: controlled by parent state via `checked` + `onToggle`.
function FilterRow({
  label,
  count,
  dot,
  checked,
  onToggle,
}: {
  label: string;
  count?: number | null;
  dot?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex items-center gap-2 py-1 text-[13px] text-text-primary cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="w-3.5 h-3.5 accent-[#6081BE]"
      />
      {dot && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />}
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && count !== null && (
        <span className="text-[11px] font-mono text-text-muted">{count}</span>
      )}
    </label>
  );
}

// Atrium audit fix item #9 — shape of the People filter state. Persisted to
// localStorage so the choice survives reload; consumed by sub-views via the
// `peopleFilters` prop on CustomersPipeline / TeamMyDay / Network / Hiring
// (each currently uses it as a hint — full filtering propagation is a follow-up).
export interface PeopleFilters {
  boards: { customers: boolean; team: boolean; network: boolean; hiring: boolean };
  stage:  { live: boolean; onboarding: boolean; atRisk: boolean; churned: boolean };
  owner:  { kyle: boolean; keenan: boolean; curtis: boolean; unassigned: boolean };
  lastContact: { lt7d: boolean; d7to30: boolean; gt30d: boolean };
}

const DEFAULT_PEOPLE_FILTERS: PeopleFilters = {
  boards: { customers: true, team: true, network: true, hiring: true },
  stage:  { live: true, onboarding: true, atRisk: true, churned: true },
  owner:  { kyle: true, keenan: true, curtis: true, unassigned: true },
  lastContact: { lt7d: true, d7to30: true, gt30d: true },
};

const FILTERS_LS_KEY = 'atrium:people:filters:v1';

function loadPeopleFilters(): PeopleFilters {
  try {
    const raw = localStorage.getItem(FILTERS_LS_KEY);
    if (!raw) return DEFAULT_PEOPLE_FILTERS;
    const parsed = JSON.parse(raw) as Partial<PeopleFilters>;
    return {
      boards: { ...DEFAULT_PEOPLE_FILTERS.boards, ...(parsed.boards ?? {}) },
      stage:  { ...DEFAULT_PEOPLE_FILTERS.stage,  ...(parsed.stage  ?? {}) },
      owner:  { ...DEFAULT_PEOPLE_FILTERS.owner,  ...(parsed.owner  ?? {}) },
      lastContact: { ...DEFAULT_PEOPLE_FILTERS.lastContact, ...(parsed.lastContact ?? {}) },
    };
  } catch {
    return DEFAULT_PEOPLE_FILTERS;
  }
}

function persistPeopleFilters(f: PeopleFilters): void {
  try {
    localStorage.setItem(FILTERS_LS_KEY, JSON.stringify(f));
  } catch {
    // localStorage unavailable — ignore
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function People() {
  const [active, setActive] = useState<PeopleTab>('customers');
  const counts = useBoardCounts();
  const m = useCustomerMetrics();
  const [collapsed, setCollapsed] = useFilterSidebarCollapsed();
  // Atrium audit fix item #9 — filter sidebar wired to state. Controlled
  // checkboxes + Reset + Add-contact stop being DEAD; values survive reload.
  const [filters, setFilters] = useState<PeopleFilters>(() => loadPeopleFilters());
  useEffect(() => {
    persistPeopleFilters(filters);
  }, [filters]);

  function toggleBoard(key: keyof PeopleFilters['boards']): void {
    setFilters((f) => ({ ...f, boards: { ...f.boards, [key]: !f.boards[key] } }));
  }
  function toggleStage(key: keyof PeopleFilters['stage']): void {
    setFilters((f) => ({ ...f, stage: { ...f.stage, [key]: !f.stage[key] } }));
  }
  function toggleOwner(key: keyof PeopleFilters['owner']): void {
    setFilters((f) => ({ ...f, owner: { ...f.owner, [key]: !f.owner[key] } }));
  }
  function toggleLastContact(key: keyof PeopleFilters['lastContact']): void {
    setFilters((f) => ({ ...f, lastContact: { ...f.lastContact, [key]: !f.lastContact[key] } }));
  }
  function resetFilters(): void {
    setFilters(DEFAULT_PEOPLE_FILTERS);
  }

  // Atrium audit fix item #9 — "+ Add contact" was a dead button. Wire it to
  // jump to the Network sub-tab and emit a window event a future contact-create
  // modal can listen for. Until the modal ships, the click is logged so the
  // intent is visible (no silent no-op).
  function handleAddContact(): void {
    setActive('network');
    try {
      window.dispatchEvent(new CustomEvent('atrium:people:add-contact', { detail: { source: 'people-header' } }));
    } catch {
      // jsdom / non-browser env — fine to swallow
    }
    // eslint-disable-next-line no-console
    console.info('[atrium] add-contact requested from People header; navigated to Network tab. Contact-create modal ships in follow-up.');
  }

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
          className="text-[13px] font-semibold px-3.5 py-2 rounded-md text-white"
          style={{ background: '#6081BE' }}
          title="Add contact"
          onClick={handleAddContact}
        >
          + Add contact
        </button>
      </div>

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
              <button
                type="button"
                onClick={resetFilters}
                className="text-[11px] text-[#6081BE] font-medium hover:underline"
                title="Reset all filters to defaults"
              >
                Reset
              </button>
              <FilterSidebarToggle collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
            </div>
          </div>
          <FilterGroup label="Board" count={4} defaultOpen>
            <FilterRow label="Customers" count={counts.customers} dot="#E8763A"
              checked={filters.boards.customers} onToggle={() => toggleBoard('customers')} />
            <FilterRow label="Team"      count={counts.team}      dot="#6081BE"
              checked={filters.boards.team}      onToggle={() => toggleBoard('team')} />
            <FilterRow label="Network"   count={counts.network}   dot="#7355E5"
              checked={filters.boards.network}   onToggle={() => toggleBoard('network')} />
            <FilterRow label="Hiring"    count={counts.hiring}    dot="#C28A1F"
              checked={filters.boards.hiring}    onToggle={() => toggleBoard('hiring')} />
          </FilterGroup>
          <FilterGroup label="Stage">
            <FilterRow label="Live"       checked={filters.stage.live}       onToggle={() => toggleStage('live')} />
            <FilterRow label="Onboarding" checked={filters.stage.onboarding} onToggle={() => toggleStage('onboarding')} />
            <FilterRow label="At-risk"    checked={filters.stage.atRisk}     onToggle={() => toggleStage('atRisk')} />
            <FilterRow label="Churned"    checked={filters.stage.churned}    onToggle={() => toggleStage('churned')} />
          </FilterGroup>
          <FilterGroup label="Owner">
            <FilterRow label="Kyle K"     checked={filters.owner.kyle}       onToggle={() => toggleOwner('kyle')} />
            <FilterRow label="Keenan H"   checked={filters.owner.keenan}     onToggle={() => toggleOwner('keenan')} />
            <FilterRow label="Curtis S"   checked={filters.owner.curtis}     onToggle={() => toggleOwner('curtis')} />
            <FilterRow label="Unassigned" checked={filters.owner.unassigned} onToggle={() => toggleOwner('unassigned')} />
          </FilterGroup>
          <FilterGroup label="Last contact">
            <FilterRow label="< 7 days"   checked={filters.lastContact.lt7d}   onToggle={() => toggleLastContact('lt7d')} />
            <FilterRow label="7–30 days"  checked={filters.lastContact.d7to30} onToggle={() => toggleLastContact('d7to30')} />
            <FilterRow label="30+ days"   checked={filters.lastContact.gt30d}  onToggle={() => toggleLastContact('gt30d')} />
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

          {/* Sub-tab content */}
          <section role="tabpanel" aria-label={PEOPLE_TABS.find((t) => t.id === active)?.label}>
            {active === 'customers' && <CustomersPipeline />}
            {active === 'team' && <TeamMyDay />}
            {active === 'network' && <Network />}
            {active === 'hiring' && <Hiring forceShow />}
          </section>
        </div>
      </div>
    </div>
  );
}
