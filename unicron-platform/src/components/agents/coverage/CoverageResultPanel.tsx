import type {
  CoverageGoalCandidate,
  CoverageGoalDetail,
} from '../../../lib/contracts/coverage';

interface Props {
  detail: CoverageGoalDetail;
  /** Lead-pool count before the run started — used for the delta line. */
  baselineLeadCount?: number;
  onCommit?: () => void | Promise<void>;
  onTier2Click?: (candidate: CoverageGoalCandidate) => void;
  /** True while the verify / commit network call is in flight. */
  committing?: boolean;
  /** Set to true to hide the commit button (e.g., when terminal). */
  readOnly?: boolean;
}

const TIER1_STATUSES = new Set<CoverageGoalCandidate['status']>([
  'onboarded',
  'dispatched',
]);

export function CoverageResultPanel({
  detail,
  baselineLeadCount,
  onCommit,
  onTier2Click,
  committing,
  readOnly,
}: Props) {
  const { goal, candidates } = detail;
  const tier1 = candidates.filter((c) => c.estimated_tier === 1 && TIER1_STATUSES.has(c.status));
  const tier2 = candidates.filter(
    (c) => c.estimated_tier === 2 || c.status === 'assist_queued',
  );
  const declined = candidates.filter((c) => c.status === 'declined' || c.status === 'failed');

  const lift = goal.total_estimated_lift || goal.estimate?.estimated_daily_lift || 0;
  const projected =
    typeof baselineLeadCount === 'number' ? baselineLeadCount + lift : null;

  return (
    <section
      data-testid="coverage-result-panel"
      data-goal-id={goal.id}
      className="flex flex-col gap-5"
    >
      <header className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
            COVERAGE GOAL · {goal.status.toUpperCase()}
          </span>
          <h2 className="mono text-[14px] tracking-wide text-text-primary leading-snug">
            {goal.goal_text}
          </h2>
        </div>
        <Stat label="EST. LIFT / DAY" value={formatNumber(lift)} unit="leads" />
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          label="TIER 1 ONBOARDED"
          value={String(goal.total_sources_onboarded || tier1.length)}
          tone="emerald"
        />
        <Stat
          label="TIER 2 QUEUED"
          value={String(goal.total_sources_assist_queued || tier2.length)}
          tone="gold"
        />
        <Stat
          label="DECLINED"
          value={String(goal.total_sources_declined || declined.length)}
          tone="muted"
        />
        <Stat
          label="COST"
          value={`$${(goal.total_cost_usd || 0).toFixed(2)}`}
          tone="muted"
        />
      </div>

      <SourceList
        title="TIER 1 — AUTO-VERIFIED"
        empty="No Tier 1 sources onboarded."
        candidates={tier1}
      />

      <SourceList
        title="TIER 2 — NEEDS OPERATOR REVIEW"
        empty="No Tier 2 escalations."
        candidates={tier2}
        onClick={onTier2Click}
        tier2
      />

      {declined.length > 0 ? (
        <SourceList
          title="DECLINED"
          empty=""
          candidates={declined}
          muted
        />
      ) : null}

      <LeadDeltaRow
        baseline={baselineLeadCount}
        projected={projected}
        deltaPerDay={lift}
      />

      {readOnly ? null : (
        <footer className="flex items-center justify-between border-t border-border-default pt-4">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
            Commit moves verified Tier 1 sources into customer-facing Pathfinder.
          </span>
          <button
            type="button"
            onClick={onCommit}
            disabled={committing}
            data-testid="coverage-commit-button"
            className="mono text-[11px] uppercase tracking-[0.18em] border border-emerald-400/60 text-emerald-400 px-4 py-2 rounded-md hover:bg-emerald-400 hover:text-bg-base disabled:opacity-50 transition-colors"
          >
            {committing ? 'COMMITTING…' : 'COMMIT TO PRODUCTION'}
          </button>
        </footer>
      )}
    </section>
  );
}

function SourceList({
  title,
  empty,
  candidates,
  onClick,
  tier2,
  muted,
}: {
  title: string;
  empty: string;
  candidates: CoverageGoalCandidate[];
  onClick?: (c: CoverageGoalCandidate) => void;
  tier2?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
        {title}
      </span>
      {candidates.length === 0 ? (
        <p className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/30">
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5" data-testid="coverage-source-list">
          {candidates.map((c) => {
            const interactive = tier2 && onClick !== undefined;
            const Element = interactive ? 'button' : 'div';
            return (
              <li key={c.id}>
                <Element
                  {...(interactive
                    ? {
                        type: 'button' as const,
                        onClick: () => onClick?.(c),
                      }
                    : {})}
                  data-testid={tier2 ? 'coverage-tier2-row' : 'coverage-tier1-row'}
                  data-candidate-id={c.id}
                  className={[
                    'w-full flex items-center justify-between gap-3 border rounded-md bg-bg-panel px-3 py-2',
                    muted ? 'border-border-default/60 opacity-70' : 'border-border-default',
                    interactive ? 'text-left hover:border-accent-gold/60 transition-colors' : '',
                  ].join(' ')}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[12px] text-text-primary truncate">
                      {c.candidate_url}
                    </span>
                    <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
                      {c.candidate_type ?? 'unknown'} · est {formatNumber(c.estimated_impact ?? 0)} leads/day
                    </span>
                  </div>
                  <span
                    className={[
                      'mono text-[10px] uppercase tracking-[0.18em] border rounded-md px-2 py-0.5',
                      candidateStatusTone(c.status),
                    ].join(' ')}
                  >
                    {c.status.replace('_', ' ')}
                  </span>
                </Element>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function LeadDeltaRow({
  baseline,
  projected,
  deltaPerDay,
}: {
  baseline?: number;
  projected: number | null;
  deltaPerDay: number;
}) {
  return (
    <div
      data-testid="coverage-lead-delta"
      className="flex items-center justify-between border border-border-default rounded-md bg-bg-panel px-4 py-3"
    >
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
        LEAD POOL · BEFORE / AFTER
      </span>
      <span className="mono text-[12px] text-text-primary">
        {baseline ?? '—'} → {projected ?? '—'}{' '}
        <span className="text-emerald-400">
          (+{formatNumber(deltaPerDay)}/day)
        </span>
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  tone = 'default',
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: 'default' | 'emerald' | 'gold' | 'muted';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-400'
      : tone === 'gold'
        ? 'text-accent-gold'
        : tone === 'muted'
          ? 'text-text-primary/60'
          : 'text-text-primary';
  return (
    <div className="flex flex-col gap-1 border border-border-default rounded-md bg-bg-panel px-3 py-2">
      <span className="mono text-[9px] uppercase tracking-[0.18em] text-text-primary/40">
        {label}
      </span>
      <span className={`mono text-[16px] ${toneClass}`}>
        {value}
        {unit ? <span className="text-[10px] text-text-primary/40 ml-1">{unit}</span> : null}
      </span>
    </div>
  );
}

function candidateStatusTone(status: CoverageGoalCandidate['status']): string {
  switch (status) {
    case 'onboarded':
      return 'text-emerald-400 border-emerald-400/40';
    case 'dispatched':
    case 'pending':
      return 'text-text-primary/60 border-border-default';
    case 'assist_queued':
      return 'text-accent-gold border-accent-gold/40';
    case 'declined':
    case 'failed':
      return 'text-rose-400 border-rose-400/40';
  }
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 100) return n.toFixed(0);
  return n.toFixed(1);
}
