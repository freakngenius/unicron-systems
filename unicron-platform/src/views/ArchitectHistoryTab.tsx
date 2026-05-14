// Architect History tab for the Customer Detail view.
//
// SPEC: Company Docs/Metacron/SPEC - Customer Profile Architect History.md
//
// Lists every Architect run scoped to the customer org, newest first. Clicking
// a row opens a side panel with the full blueprint: business_summary,
// decomposition (rendered via ArchitectCanvas), ui_plan, and input intent.

import { useEffect, useMemo, useState } from 'react';
import {
  listArchitectHistory,
  extractBusinessSummary,
  extractArchitecture,
  extractBuyerPain,
  summarizeLeadType,
  type ArchitectHistoryEntry,
} from '../lib/architectHistoryClient';
import { BusinessSummaryPanel } from '../components/BusinessSummaryPanel';
import { ArchitectCanvas } from '../components/onboarding/ArchitectCanvas';

type Props = {
  orgSlug: string;
};

export function ArchitectHistoryTab({ orgSlug }: Props) {
  const [entries, setEntries] = useState<ArchitectHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setEntries(null);
    setError(null);
    setSelectedId(null);
    listArchitectHistory(orgSlug, { signal: ctrl.signal })
      .then((res) => {
        setEntries(res.history);
        if (res.history.length > 0) setSelectedId(res.history[0].session_id);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => ctrl.abort();
  }, [orgSlug]);

  const selected = useMemo(() => {
    if (!entries || !selectedId) return null;
    return entries.find((e) => e.session_id === selectedId) ?? null;
  }, [entries, selectedId]);

  if (error) {
    return (
      <p
        data-testid="architect-history-error"
        className="mono text-[11px] uppercase tracking-[0.18em] text-rose-400"
      >
        {error}
      </p>
    );
  }

  if (!entries) {
    return (
      <div
        data-testid="architect-history-skeleton"
        className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4"
      >
        <div className="h-40 border border-border-default border-dashed rounded-md bg-bg-panel/50 animate-pulse" />
        <div className="h-40 border border-border-default border-dashed rounded-md bg-bg-panel/50 animate-pulse" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div
        data-testid="architect-history-empty"
        className="border border-border-default rounded-md bg-bg-panel p-6"
      >
        <p className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40">
          No Architect runs recorded for this org yet.
        </p>
        <p className="mt-2 text-[12px] text-text-primary/60 leading-[1.55]">
          When the Architect generates a decomposition for this customer, it
          will appear here permanently — even after the operator moves off the
          Onboarding screen.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="architect-history"
      className="grid grid-cols-1 lg:grid-cols-[minmax(280px,360px)_1fr] gap-4"
    >
      <ul
        data-testid="architect-history-list"
        className="flex flex-col gap-2 max-h-[640px] overflow-y-auto pr-1"
      >
        {entries.map((entry) => (
          <HistoryRow
            key={entry.session_id}
            entry={entry}
            selected={entry.session_id === selectedId}
            onSelect={() => setSelectedId(entry.session_id)}
          />
        ))}
      </ul>

      <div data-testid="architect-history-detail">
        {selected ? (
          <HistoryDetail entry={selected} />
        ) : (
          <div className="border border-border-default rounded-md bg-bg-panel p-6 mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40">
            Select a run to view the full blueprint.
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryRow({
  entry,
  selected,
  onSelect,
}: {
  entry: ArchitectHistoryEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const date = formatDate(entry.created_at);
  const status = entry.proposal?.status ?? entry.status;
  const leadType = summarizeLeadType(entry);
  const buyerPain = extractBuyerPain(entry);
  const oneLine = leadType ?? buyerPain ?? entry.proposal?.headline ?? '—';
  const confidence = entry.proposal?.confidence ?? null;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        data-testid="architect-history-row"
        data-selected={selected ? 'true' : 'false'}
        data-session-id={entry.session_id}
        className={[
          'w-full text-left border rounded-md p-3 transition-colors flex flex-col gap-1.5',
          selected
            ? 'border-text-primary bg-bg-panel'
            : 'border-border-default bg-bg-panel/60 hover:border-text-primary/60',
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
            {date}
          </span>
          <StatusPill status={status} />
        </div>
        <p className="text-[12px] text-text-primary leading-[1.45] line-clamp-3">
          {oneLine}
        </p>
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40 flex items-center gap-2">
          <span>{entry.session_type}</span>
          {confidence != null ? (
            <>
              <span aria-hidden="true">·</span>
              <span>conf {Number(confidence).toFixed(2)}</span>
            </>
          ) : null}
        </div>
      </button>
    </li>
  );
}

function HistoryDetail({ entry }: { entry: ArchitectHistoryEntry }) {
  const summary = extractBusinessSummary(entry);
  const architecture = extractArchitecture(entry);
  const buyerPain = extractBuyerPain(entry);

  return (
    <div className="flex flex-col gap-4">
      <div className="border border-border-default rounded-md bg-bg-panel p-4">
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50 mb-2">
          INPUT INTENT
        </div>
        <p
          data-testid="architect-history-intent"
          className="text-[12px] text-text-primary leading-[1.55] whitespace-pre-wrap"
        >
          {buyerPain ?? '—'}
        </p>
      </div>

      <div
        data-testid="architect-history-canvas"
        className="border border-border-default rounded-md bg-bg-panel p-2 h-[420px]"
      >
        <ArchitectCanvas
          architecture={architecture}
          loadingLabel="No decomposition recorded for this run"
        />
      </div>

      <BusinessSummaryPanel
        summary={summary}
        customerName=""
        onEdit={() => undefined}
        readOnly
        status={summary ? 'ready' : 'error'}
        errorMessage={summary ? undefined : 'No business summary recorded for this run.'}
      />

      <UiPlanPanel architecture={architecture} />
    </div>
  );
}

function UiPlanPanel({
  architecture,
}: {
  architecture: ReturnType<typeof extractArchitecture>;
}) {
  const plan = extractUiPlan(architecture);
  if (!plan) return null;

  return (
    <section
      data-testid="architect-history-ui-plan"
      className="border border-border-default rounded-md bg-bg-panel p-4 flex flex-col gap-2"
    >
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
        UI PLAN
      </span>
      {plan.dashboard_emphasis ? (
        <p className="text-[12px] text-text-primary leading-[1.55]">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40 mr-2">
            EMPHASIS
          </span>
          {String(plan.dashboard_emphasis)}
        </p>
      ) : null}
      {Array.isArray(plan.kpis) && plan.kpis.length > 0 ? (
        <KpiList kpis={plan.kpis} />
      ) : null}
      {Array.isArray(plan.charts) && plan.charts.length > 0 ? (
        <ChartList charts={plan.charts} />
      ) : null}
    </section>
  );
}

function KpiList({ kpis }: { kpis: unknown[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
        KPIs
      </span>
      <ul className="text-[12px] text-text-primary leading-[1.55] list-disc pl-5">
        {kpis.map((k, i) => (
          <li key={i}>{describeKpi(k)}</li>
        ))}
      </ul>
    </div>
  );
}

function ChartList({ charts }: { charts: unknown[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
        CHARTS
      </span>
      <ul className="text-[12px] text-text-primary leading-[1.55] list-disc pl-5">
        {charts.map((c, i) => (
          <li key={i}>{describeChart(c)}</li>
        ))}
      </ul>
    </div>
  );
}

function extractUiPlan(
  architecture: ReturnType<typeof extractArchitecture>,
): {
  dashboard_emphasis?: string;
  kpis?: unknown[];
  charts?: unknown[];
} | null {
  if (!architecture) return null;
  const plan = (architecture as unknown as Record<string, unknown>).ui_plan;
  if (!plan || typeof plan !== 'object') return null;
  return plan as {
    dashboard_emphasis?: string;
    kpis?: unknown[];
    charts?: unknown[];
  };
}

function describeKpi(k: unknown): string {
  if (k && typeof k === 'object') {
    const o = k as Record<string, unknown>;
    const label = typeof o.label === 'string' ? o.label : typeof o.name === 'string' ? o.name : null;
    const metric = typeof o.metric === 'string' ? o.metric : null;
    if (label && metric) return `${label} — ${metric}`;
    if (label) return label;
    if (metric) return metric;
    return JSON.stringify(o);
  }
  return String(k);
}

function describeChart(c: unknown): string {
  if (c && typeof c === 'object') {
    const o = c as Record<string, unknown>;
    const type = typeof o.type === 'string' ? o.type : null;
    const title =
      typeof o.title === 'string' ? o.title : typeof o.label === 'string' ? o.label : null;
    if (type && title) return `${type}: ${title}`;
    if (title) return title;
    if (type) return type;
    return JSON.stringify(o);
  }
  return String(c);
}

function StatusPill({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <span
      data-testid="architect-history-status"
      data-status={status}
      className={[
        'mono text-[9px] uppercase tracking-[0.18em] border rounded-md px-1.5 py-[1px]',
        tone,
      ].join(' ')}
    >
      {status}
    </span>
  );
}

function statusTone(status: string): string {
  switch (status) {
    case 'approved':
    case 'auto_accepted':
    case 'completed':
      return 'border-emerald-500/40 text-emerald-500';
    case 'failed':
    case 'dismissed':
    case 'timed_out':
      return 'border-rose-500/40 text-rose-500';
    case 'pending':
    case 'in_progress':
      return 'border-amber-500/40 text-amber-500';
    default:
      return 'border-border-default text-text-primary/60';
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace('T', ' ');
}
