// Work.tsx — v3 redesign Pass 1 (R3 of Atrium Total Tab Rewrite)
// v3-work-fills.jsx + screens/work-people-money.jsx (Work portion):
// page title, blue-underline sub-tabs, 240px filter sidebar, 4 metric cards,
// and a new Refusals triage sub-tab (actionable queue — audit log stays in System).
//
// Per Kyle's IA call (2026-05-10): Both — Refusals in Work for actionable
// triage, Refusal log in System for audit. Two surfaces, same source.

import { useState, useEffect } from 'react';
import { getSupabase } from '../lib/supabase';
import { ActionItems } from './work/ActionItems';
import { CallsLog } from './work/CallsLog';
import { DecisionsTimeline } from './work/DecisionsTimeline';
import { KanbanEmbeds } from './work/KanbanEmbeds';
import { SprintsView } from './work/SprintsView';

const WORK_TABS = [
  { id: 'items',     label: 'Items' },
  { id: 'kanban',    label: 'Kanban' },
  { id: 'calls',     label: 'Calls' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'sprints',   label: 'Sprints' },
  { id: 'refusals',  label: 'Refusals' },
] as const;

type WorkTab = (typeof WORK_TABS)[number]['id'];

// ─── Action-item counts (drives metric cards) ─────────────────────────────────

interface ItemMetrics {
  open: number | null;
  overdue: number | null;
  dueToday: number | null;
  avgAgeDays: number | null;
}

function useItemMetrics(): ItemMetrics {
  const [m, setM] = useState<ItemMetrics>({ open: null, overdue: null, dueToday: null, avgAgeDays: null });
  useEffect(() => {
    let cancelled = false;
    getSupabase()
      .rpc('ns_action_items_metrics')
      .then(({ data }) => {
        if (cancelled) return;
        const row = (data as Array<{ open_count: number; overdue_count: number; due_today_count: number; avg_age_days: number }> | null)?.[0];
        if (row) {
          setM({
            open: row.open_count,
            overdue: row.overdue_count,
            dueToday: row.due_today_count,
            avgAgeDays: Math.round(row.avg_age_days),
          });
        }
      })
      .catch(() => {/* RPC may not exist yet — leave nulls */});
    return () => { cancelled = true; };
  }, []);
  return m;
}

// ─── Refusals triage queue ───────────────────────────────────────────────────

interface RefusalRow {
  id: string;
  created_at: string;
  action: string;
  payload: {
    action_type?: string;
    matched_taboo?: string;
    agent_name?: string;
    override_status?: string;
  } | null;
}

function RefusalsTriage() {
  const [rows, setRows] = useState<RefusalRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSupabase()
      .rpc('ns_list_audit_log_taboo', { p_limit: 50 })
      .then(({ data }) => {
        const all = (data as RefusalRow[] | null) ?? [];
        const cutoff = Date.now() - 7 * 86_400_000;
        const open = all.filter(
          (r) => new Date(r.created_at).getTime() >= cutoff && r.payload?.override_status !== 'overridden',
        );
        setRows(open);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-[12px] text-text-muted py-8 text-center">Loading…</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-border-default rounded-xl px-6 py-10 text-center">
        <div className="text-[14px] text-text-primary font-semibold mb-1">No open refusals.</div>
        <div className="text-[12px] text-text-muted">Last 7 days · audit history in System &rsaquo; Refusal log</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.id} className="bg-white border border-border-default rounded-xl px-4 py-3.5 flex items-start gap-3">
          <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: '#E14B4B' }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10.5px] uppercase tracking-[0.14em] font-bold" style={{ color: '#E14B4B' }}>
                {r.payload?.matched_taboo ?? 'refusal'}
              </span>
              <span className="text-[11px] text-text-muted">·</span>
              <span className="text-[11px] text-text-secondary">{r.payload?.agent_name ?? 'agent'}</span>
              <span className="text-[11px] text-text-muted">·</span>
              <span className="text-[11px] text-text-muted">{new Date(r.created_at).toLocaleString()}</span>
            </div>
            <div className="text-[13.5px] text-text-primary">
              Attempted: <span className="font-medium">{r.payload?.action_type ?? 'unknown action'}</span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button className="px-2.5 py-1.5 text-[11.5px] font-medium rounded-md border border-border-default text-text-secondary hover:bg-bg-raised">
              Mark resolved
            </button>
            <button className="px-2.5 py-1.5 text-[11.5px] font-medium rounded-md text-white" style={{ background: '#6081BE' }}>
              Escalate
            </button>
          </div>
        </div>
      ))}
      <div className="text-[11px] text-text-muted text-center pt-2">
        Open refusals · last 7 days · full audit in System &rsaquo; Refusal log
      </div>
    </div>
  );
}

// ─── Reusable bits (kept inline — small wrapper file) ────────────────────────

function MetricCard({ label, value, sublabel, change, sparkline }: {
  label: string; value: string; sublabel?: string;
  change?: { value: string; tone: 'up' | 'down' | 'flat' };
  sparkline?: number[];
}) {
  const max = sparkline ? Math.max(...sparkline, 1) : 1;
  const toneColor = change?.tone === 'up' ? '#2E8E66' : change?.tone === 'down' ? '#E14B4B' : '#7E8AA3';
  return (
    <div className="bg-white border border-border-default rounded-xl px-4 py-3.5 shadow-sm">
      <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted font-semibold">{label}</div>
      <div className="flex items-baseline justify-between gap-3 mt-2">
        <div className="text-[26px] font-semibold text-text-primary" style={{ fontFamily: 'var(--font-display)', letterSpacing: -0.5, lineHeight: 1 }}>{value}</div>
        {change && <span className="text-[11.5px] font-semibold" style={{ color: toneColor }}>{change.tone === 'up' ? '↑' : change.tone === 'down' ? '↓' : '·'} {change.value}</span>}
      </div>
      {(sublabel || sparkline) && (
        <div className="flex items-end justify-between gap-3 mt-2.5 min-h-[20px]">
          {sublabel && <div className="text-[12px] text-text-muted truncate">{sublabel}</div>}
          {sparkline && (
            <svg width="80" height="20" viewBox="0 0 80 20" className="shrink-0">
              <polyline
                points={sparkline.map((v, i) => `${(i / (sparkline.length - 1)) * 80},${20 - (v / max) * 18}`).join(' ')}
                fill="none" stroke="#6081BE" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, count, defaultOpen, children }: {
  label: string; count?: number; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border-t border-border-subtle py-2.5">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 w-full text-[13px] font-semibold text-text-primary">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>
          <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="flex-1 text-left">{label}</span>
        {count !== undefined && count > 0 && <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: '#6081BE', background: 'rgba(96,129,190,0.10)' }}>{count}</span>}
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
      {count !== undefined && count !== null && <span className="text-[11px] font-mono text-text-muted">{count}</span>}
    </label>
  );
}

// ─── Analytics panels (Pass 2 R3) ─────────────────────────────────────────────
// SLOT: Most used by DRI · STATUS: real · SOURCE: ns_action_items_by_dri
// SLOT: Highest priority by age · STATUS: real · SOURCE: ns_action_items_priority_by_age
// SLOT: By board distribution · STATUS: real · SOURCE: ns_action_items_by_board
// (kanban_workspace serves as the Board grouping field per action_items schema)

interface DriRow { dri: string | null; dri_name: string | null; dri_email: string | null; open_count: number; }
interface PriorityAgeRow { id: string; title: string; priority: string; age_days: number; dri_name: string | null; }
interface BoardRow { kanban_workspace: string; count: number; pct: number; }

const PRIORITY_DOT: Record<string, string> = {
  irreversible: '#E14B4B',
  high:         '#C28A1F',
  medium:       '#6081BE',
  low:          '#7E8AA3',
};

function useWorkAnalytics() {
  const [byDri, setByDri] = useState<DriRow[] | null>(null);
  const [priAge, setPriAge] = useState<PriorityAgeRow[] | null>(null);
  const [byBoard, setByBoard] = useState<BoardRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sb = getSupabase();
    Promise.all([
      sb.rpc('ns_action_items_by_dri'),
      sb.rpc('ns_action_items_priority_by_age'),
      sb.rpc('ns_action_items_by_board'),
    ]).then(([d, p, b]) => {
      if (cancelled) return;
      setByDri((d.data as DriRow[] | null) ?? []);
      setPriAge((p.data as PriorityAgeRow[] | null) ?? []);
      setByBoard((b.data as BoardRow[] | null) ?? []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return { byDri, priAge, byBoard };
}

function AnalyticsPanels() {
  const { byDri, priAge, byBoard } = useWorkAnalytics();
  const maxDriCount = Math.max(1, ...((byDri ?? []).map((r) => Number(r.open_count))));

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
      {/* Most used by DRI */}
      <div className="bg-white border border-border-default rounded-xl p-4 shadow-sm">
        <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted font-semibold mb-3">
          Most used (by DRI)
        </div>
        {!byDri || byDri.length === 0 ? (
          <div className="text-[12px] text-text-muted">No open items.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {byDri.map((r, i) => {
              const w = (Number(r.open_count) / maxDriCount) * 100;
              return (
                <div key={r.dri ?? `unassigned-${i}`} className="flex items-center gap-2.5">
                  <span className="text-[12px] text-text-primary truncate" style={{ minWidth: 90 }}>
                    {r.dri_name ?? (r.dri_email?.split('@')[0]) ?? 'Unassigned'}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-border-subtle overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${w}%`, background: '#6081BE' }} />
                  </div>
                  <span className="text-[11px] font-mono text-text-primary font-semibold min-w-[24px] text-right">
                    {r.open_count}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Highest priority by age */}
      <div className="bg-white border border-border-default rounded-xl p-4 shadow-sm">
        <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted font-semibold mb-3">
          Highest priority by age
        </div>
        {!priAge || priAge.length === 0 ? (
          <div className="text-[12px] text-text-muted">No irreversible/high open items.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {priAge.map((r) => (
              <div key={r.id} className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: PRIORITY_DOT[r.priority] ?? '#7E8AA3' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] text-text-primary truncate">{r.title}</div>
                  <div className="text-[10.5px] text-text-muted">
                    {r.priority} · {Math.round(Number(r.age_days))}d old{r.dri_name ? ` · ${r.dri_name}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* By board distribution */}
      <div className="bg-white border border-border-default rounded-xl p-4 shadow-sm">
        <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted font-semibold mb-3">
          By board
        </div>
        {!byBoard || byBoard.length === 0 ? (
          <div className="text-[12px] text-text-muted">No open items.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {byBoard.map((b) => (
              <div key={b.kanban_workspace} className="flex items-center gap-2.5">
                <span className="text-[12px] text-text-primary truncate" style={{ minWidth: 90 }}>
                  {b.kanban_workspace}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-border-subtle overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Number(b.pct)}%`, background: '#2E8E66' }} />
                </div>
                <span className="text-[11px] font-mono text-text-primary font-semibold min-w-[40px] text-right">
                  {b.count} · {Number(b.pct).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Work() {
  const [active, setActive] = useState<WorkTab>('items');
  const m = useItemMetrics();

  return (
    <div className="w-full">
      <div className="px-7 pt-6 pb-3 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11.5px] text-text-muted mb-1.5">Operating cadence</div>
          <h1 className="text-[36px] font-semibold text-text-primary leading-none tracking-tight" style={{ fontFamily: 'var(--font-display)', letterSpacing: -0.7 }}>
            Work
          </h1>
        </div>
        <button
          className="text-[13px] font-semibold px-3.5 py-2 rounded-md text-white"
          style={{ background: '#6081BE' }}
        >
          + New item
        </button>
      </div>

      <div className="flex gap-1 px-7 border-b border-border-default overflow-x-auto">
        {WORK_TABS.map((tab) => {
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

      <div className="px-7 py-5 grid gap-5" style={{ gridTemplateColumns: '240px minmax(0, 1fr)' }}>
        <style>{`@media (max-width: 1023px) { .work-filters { display: none !important; } .work-body { grid-template-columns: 1fr !important; } }`}</style>

        <aside className="work-filters flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11.5px] uppercase tracking-[0.14em] text-text-muted font-semibold">Filters</span>
            <button className="text-[11px] text-[#6081BE] font-medium">Reset</button>
          </div>
          <FilterGroup label="Timeframe" defaultOpen>
            <FilterRow label="Last 24h" />
            <FilterRow label="Last 7 days" />
            <FilterRow label="Last 30 days" />
            <FilterRow label="All time" />
          </FilterGroup>
          <FilterGroup label="Owner">
            <FilterRow label="Kyle K" />
            <FilterRow label="Keenan H" />
            <FilterRow label="Curtis S" />
            <FilterRow label="Unassigned" />
          </FilterGroup>
          <FilterGroup label="Board"><div className="text-[12px] text-text-muted py-1">All boards</div></FilterGroup>
          <FilterGroup label="Priority">
            <FilterRow label="Irreversible" dot="#E14B4B" />
            <FilterRow label="High" dot="#C28A1F" />
            <FilterRow label="Medium" dot="#6081BE" />
            <FilterRow label="Low" dot="#7E8AA3" />
          </FilterGroup>
          <FilterGroup label="Stage">
            <FilterRow label="Open" />
            <FilterRow label="In progress" />
            <FilterRow label="Blocked" />
            <FilterRow label="Done" />
            <FilterRow label="Broken off" />
          </FilterGroup>
          <FilterGroup label="Tags"><div className="text-[12px] text-text-muted py-1">No tags yet</div></FilterGroup>
        </aside>

        <div className="work-body flex flex-col gap-4 min-w-0">
          {active === 'items' && (
            <>
              {/* SLOT: 4 metric cards · STATUS: real · SOURCE: ns_action_items_metrics */}
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                <MetricCard label="Open items"  value={m.open === null ? '—' : String(m.open)} />
                <MetricCard label="Overdue"     value={m.overdue === null ? '—' : String(m.overdue)} change={m.overdue && m.overdue > 0 ? { value: 'attention', tone: 'down' } : undefined} />
                <MetricCard label="Due today"   value={m.dueToday === null ? '—' : String(m.dueToday)} />
                <MetricCard label="Avg age"     value={m.avgAgeDays === null ? '—' : `${m.avgAgeDays}d`} />
              </div>
              <AnalyticsPanels />
            </>
          )}

          <section role="tabpanel" aria-label={WORK_TABS.find((t) => t.id === active)?.label}>
            {active === 'items' && <ActionItems />}
            {active === 'kanban' && <KanbanEmbeds />}
            {active === 'calls' && <CallsLog />}
            {active === 'decisions' && <DecisionsTimeline />}
            {active === 'sprints' && <SprintsView />}
            {active === 'refusals' && <RefusalsTriage />}
          </section>
        </div>
      </div>
    </div>
  );
}
