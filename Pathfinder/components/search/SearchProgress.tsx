'use client';

// components/search/SearchProgress.tsx — ICP Saved Search, S4.
//
// Spec: Pathfinder/docs/SPEC-ICP-Search.md § Stream slices · S4.
// Polls GET /api/searches/:id and renders the phase timeline + run stats.
// Standalone and reusable; S3 mounts it from the Internal front page.

import * as React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';

const PHASE_ORDER: ReadonlyArray<{ key: PhaseKey; label: string }> = [
  { key: 'interpret', label: 'Interpret ICP' },
  { key: 'geo', label: 'Resolve geography' },
  { key: 'sources', label: 'Plan sources' },
  { key: 'wire', label: 'Wire and scrape' },
  { key: 'scrape', label: 'Ingest companies' },
  { key: 'score', label: 'Score and verify' },
];

type PhaseKey = 'interpret' | 'geo' | 'sources' | 'wire' | 'scrape' | 'score';
type PhaseStatus = 'pending' | 'running' | 'done' | 'failed';
type RunStatus = 'draft' | 'planning' | 'running' | 'complete' | 'failed' | string;

export interface SearchProgressPhase {
  key: PhaseKey | string;
  label?: string;
  status?: PhaseStatus | string;
  detail?: string | null;
}

export interface SearchProgressStats {
  sources_found?: number | null;
  companies_ingested?: number | null;
  scored?: number | null;
  verified?: number | null;
}

export interface SearchProgressSourcePlan {
  tier1?: Array<unknown>;
  tier2?: Array<unknown>;
  tier3?: Array<unknown>;
}

export interface SearchProgressSavedSearch {
  id: string;
  name?: string | null;
  icp_text?: string | null;
  region?: string | null;
  radius_mi?: number | null;
  status?: RunStatus;
  source_plan?: SearchProgressSourcePlan | null;
}

export interface SearchProgressRun {
  status?: RunStatus;
  phase?: PhaseKey | string | null;
  progress?: { phases?: SearchProgressPhase[] } | null;
  stats?: SearchProgressStats | null;
}

export interface SearchProgressPayload {
  saved_search: SearchProgressSavedSearch;
  latest_run?: SearchProgressRun | null;
}

export interface SearchProgressProps {
  /** Saved search id passed to GET /api/searches/:id. */
  searchId: string;
  /** Poll interval in ms. Default 2000. Polling stops on terminal status. */
  pollMs?: number;
  /** Optional href template for the results CTA. Receives the searchId. */
  resultsHref?: (searchId: string) => string;
  /** Fires once when latest_run.status transitions into a terminal state. */
  onComplete?: (payload: SearchProgressPayload) => void;
  /** Test seam — defaults to global fetch against /pathfinder/api/searches/:id. */
  fetcher?: (searchId: string) => Promise<SearchProgressPayload>;
  /** Optional seed payload so the first paint can render without a fetch. */
  initialPayload?: SearchProgressPayload | null;
}

const TERMINAL: ReadonlySet<RunStatus> = new Set(['complete', 'failed']);

function defaultFetcher(searchId: string): Promise<SearchProgressPayload> {
  return fetch(`/pathfinder/api/searches/${encodeURIComponent(searchId)}`, {
    credentials: 'include',
  }).then(async r => {
    if (!r.ok) throw new Error(`search fetch ${r.status}`);
    return (await r.json()) as SearchProgressPayload;
  });
}

function defaultResultsHref(searchId: string): string {
  return `/pathfinder/internal/searches/${encodeURIComponent(searchId)}/leads`;
}

function mergePhases(incoming: SearchProgressPhase[] | undefined): SearchProgressPhase[] {
  const byKey = new Map<string, SearchProgressPhase>();
  for (const p of incoming ?? []) {
    if (p && typeof p.key === 'string') byKey.set(p.key, p);
  }
  return PHASE_ORDER.map(({ key, label }) => {
    const found = byKey.get(key);
    return {
      key,
      label: found?.label ?? label,
      status: (found?.status as PhaseStatus | undefined) ?? 'pending',
      detail: found?.detail ?? null,
    };
  });
}

function isThinSourcePlan(plan: SearchProgressSourcePlan | null | undefined): boolean {
  if (!plan) return false;
  const t1 = Array.isArray(plan.tier1) ? plan.tier1.length : 0;
  const t2 = Array.isArray(plan.tier2) ? plan.tier2.length : 0;
  return t1 + t2 <= 1;
}

function formatStat(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Number(value).toLocaleString();
}

function statusColor(status: PhaseStatus | string | undefined): string {
  if (status === 'running') return PF_TINTS.runningGreen;
  if (status === 'done') return PF_TINTS.ink;
  if (status === 'failed') return '#f87171';
  return PF_TINTS.inkFaint;
}

function statusLabel(status: PhaseStatus | string | undefined): string {
  if (status === 'running') return 'RUNNING';
  if (status === 'done') return 'DONE';
  if (status === 'failed') return 'FAILED';
  return 'PENDING';
}

export function SearchProgress({
  searchId,
  pollMs = 2000,
  resultsHref = defaultResultsHref,
  onComplete,
  fetcher = defaultFetcher,
  initialPayload = null,
}: SearchProgressProps): React.ReactElement {
  const [payload, setPayload] = React.useState<SearchProgressPayload | null>(initialPayload);
  const [error, setError] = React.useState<string | null>(null);
  const completedRef = React.useRef(false);
  const cancelledRef = React.useRef(false);

  React.useEffect(() => {
    cancelledRef.current = false;
    completedRef.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const next = await fetcher(searchId);
        if (cancelledRef.current) return;
        setPayload(next);
        setError(null);
        const status = (next.latest_run?.status ?? next.saved_search?.status) as RunStatus | undefined;
        if (status && TERMINAL.has(status)) {
          if (!completedRef.current) {
            completedRef.current = true;
            onComplete?.(next);
          }
          return;
        }
      } catch (err) {
        if (cancelledRef.current) return;
        setError(err instanceof Error ? err.message : 'fetch failed');
      }
      if (!cancelledRef.current) {
        timer = setTimeout(tick, Math.max(250, pollMs));
      }
    };

    void tick();
    return () => {
      cancelledRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [searchId, pollMs, fetcher, onComplete]);

  const saved = payload?.saved_search;
  const run = payload?.latest_run ?? null;
  const phases = React.useMemo(() => mergePhases(run?.progress?.phases), [run]);
  const stats = run?.stats ?? {};
  const runStatus = (run?.status ?? saved?.status ?? 'planning') as RunStatus;
  const isComplete = runStatus === 'complete';
  const isFailed = runStatus === 'failed' || phases.some(p => p.status === 'failed');
  const isThin = isThinSourcePlan(saved?.source_plan ?? null);
  const showLimitedNote = isThin || isFailed;

  return (
    <section
      data-testid="search-progress"
      data-search-id={searchId}
      data-run-status={runStatus}
      style={{
        background: '#ffffff',
        border: `1px solid ${hexAlpha(PF_TINTS.ink, 0.12)}`,
        borderRadius: PF_TINTS.r.md,
        padding: 20,
        font: `400 13px ${PF_TINTS.sans}`,
        color: PF_TINTS.ink,
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <div
          data-testid="search-progress-name"
          style={{
            font: `600 14px ${PF_TINTS.sans}`,
            color: PF_TINTS.ink,
            marginBottom: 4,
          }}
        >
          {saved?.name ?? 'New saved search'}
        </div>
        {saved?.icp_text && (
          <div
            style={{
              font: `400 13px ${PF_TINTS.sans}`,
              color: PF_TINTS.inkSub,
              marginBottom: 2,
            }}
          >
            {saved.icp_text}
          </div>
        )}
        {(saved?.region || saved?.radius_mi != null) && (
          <div
            style={{
              font: `400 12px ${PF_TINTS.mono}`,
              color: PF_TINTS.inkDim,
              letterSpacing: '0.02em',
            }}
          >
            {saved?.region ?? ''}
            {saved?.region && saved?.radius_mi != null ? ' · ' : ''}
            {saved?.radius_mi != null ? `${saved.radius_mi} mi radius` : ''}
          </div>
        )}
      </header>

      <ol
        data-testid="search-progress-phases"
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {phases.map(phase => {
          const color = statusColor(phase.status);
          const label = statusLabel(phase.status);
          return (
            <li
              key={phase.key}
              data-testid={`search-progress-phase-${phase.key}`}
              data-phase-status={phase.status}
              style={{
                display: 'grid',
                gridTemplateColumns: '14px 1fr auto',
                gap: 12,
                alignItems: 'baseline',
                padding: '8px 0',
                borderBottom: `1px solid ${hexAlpha(PF_TINTS.ink, 0.06)}`,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: color,
                  marginTop: 6,
                  boxShadow:
                    phase.status === 'running'
                      ? `0 0 0 4px ${PF_TINTS.runningGreenGlow}`
                      : 'none',
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    font: `500 13px ${PF_TINTS.sans}`,
                    color: PF_TINTS.ink,
                  }}
                >
                  {phase.label}
                </div>
                {phase.detail && (
                  <div
                    data-testid={`search-progress-phase-${phase.key}-detail`}
                    style={{
                      marginTop: 2,
                      font: `400 12px ${PF_TINTS.sans}`,
                      color: PF_TINTS.inkSub,
                    }}
                  >
                    {phase.detail}
                  </div>
                )}
              </div>
              <span
                className="pf-mono"
                data-testid={`search-progress-phase-${phase.key}-status`}
                style={{
                  font: `600 10px ${PF_TINTS.mono}`,
                  color,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                }}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      <div
        data-testid="search-progress-stats"
        style={{
          marginTop: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        <StatTile testid="stat-sources-found" label="Sources found" value={formatStat(stats.sources_found)} />
        <StatTile
          testid="stat-companies-ingested"
          label="Companies ingested"
          value={formatStat(stats.companies_ingested)}
        />
        <StatTile testid="stat-scored" label="Scored" value={formatStat(stats.scored)} />
        <StatTile testid="stat-verified" label="Verified" value={formatStat(stats.verified)} />
      </div>

      {showLimitedNote && (
        <p
          data-testid="search-progress-limited-note"
          style={{
            marginTop: 16,
            padding: '10px 12px',
            background: hexAlpha('#f59e0b', 0.08),
            border: `1px solid ${hexAlpha('#f59e0b', 0.35)}`,
            borderRadius: PF_TINTS.r.sm,
            font: `400 12px ${PF_TINTS.sans}`,
            color: PF_TINTS.inkSub,
          }}
        >
          Limited sources for this profile. We ran with the public sources we
          could reach; brittle or blocked candidates are skipped so the run
          still completes with what is reliable.
        </p>
      )}

      {error && !payload && (
        <p
          data-testid="search-progress-error"
          style={{
            marginTop: 16,
            font: `400 12px ${PF_TINTS.sans}`,
            color: '#b91c1c',
          }}
        >
          Could not load progress: {error}. Retrying.
        </p>
      )}

      {isComplete && (
        <div
          data-testid="search-progress-done"
          style={{
            marginTop: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 14px',
            background: hexAlpha(PF_TINTS.runningGreen, 0.10),
            border: `1px solid ${hexAlpha(PF_TINTS.runningGreen, 0.55)}`,
            borderRadius: PF_TINTS.r.sm,
          }}
        >
          <span
            style={{
              font: `500 13px ${PF_TINTS.sans}`,
              color: PF_TINTS.ink,
            }}
          >
            Search complete. {formatStat(stats.scored)} scored, {formatStat(stats.verified)} verified.
          </span>
          <a
            data-testid="search-progress-results-link"
            href={resultsHref(searchId)}
            style={{
              font: `600 12px ${PF_TINTS.sans}`,
              color: PF_TINTS.ink,
              textDecoration: 'underline',
            }}
          >
            View results
          </a>
        </div>
      )}
    </section>
  );
}

function StatTile({
  testid,
  label,
  value,
}: {
  testid: string;
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <div
      data-testid={testid}
      style={{
        padding: '10px 12px',
        background: hexAlpha(PF_TINTS.ink, 0.03),
        border: `1px solid ${hexAlpha(PF_TINTS.ink, 0.08)}`,
        borderRadius: PF_TINTS.r.sm,
      }}
    >
      <div
        style={{
          font: `600 18px ${PF_TINTS.sans}`,
          color: PF_TINTS.ink,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 4,
          font: `500 10px ${PF_TINTS.mono}`,
          color: PF_TINTS.inkDim,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
    </div>
  );
}

export default SearchProgress;
