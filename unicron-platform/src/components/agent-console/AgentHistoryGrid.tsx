import { useEffect, useMemo, useState } from 'react';
import type { AgentDispatch, AgentDispatchStatus } from '../../lib/contracts/agentConsole';
import { ALL_DISPATCH_STATUSES } from '../../lib/contracts/agentConsole';
import { listDispatches } from '../../lib/agentConsoleClient';
import { AgentTile } from './AgentTile';

interface Props {
  agentName: string;
  customerOrgId?: string;
  onTileClick?: (dispatch: AgentDispatch) => void;
  /**
   * When provided, each tile whose dispatch is in `failed` status renders an
   * inline RE-RUN action that invokes this handler with the failed dispatch.
   * The grid is intentionally agnostic about the actual re-queue mechanism;
   * call `requeueDispatch` from `agentConsoleClient` in the handler.
   */
  onRerun?: (dispatch: AgentDispatch) => void;
  /** Test seam — override the loader. */
  loader?: typeof listDispatches;
  /** Test seam — provide initial dispatches synchronously, skipping the loader. */
  initialDispatches?: AgentDispatch[];
}

type StatusFilter = AgentDispatchStatus | 'all';
type SortKey = 'date' | 'cost' | 'status';

export function AgentHistoryGrid({
  agentName,
  customerOrgId,
  onTileClick,
  onRerun,
  loader = listDispatches,
  initialDispatches,
}: Props) {
  const [dispatches, setDispatches] = useState<AgentDispatch[]>(initialDispatches ?? []);
  const [loading, setLoading] = useState(initialDispatches === undefined);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');

  useEffect(() => {
    if (initialDispatches !== undefined) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loader({ agent_name: agentName, customer_org_id: customerOrgId, limit: 50 })
      .then((rows) => {
        if (cancelled) return;
        setDispatches(rows);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentName, customerOrgId, loader, initialDispatches]);

  const visible = useMemo(() => {
    const filtered =
      statusFilter === 'all'
        ? dispatches
        : dispatches.filter((d) => d.status === statusFilter);
    return [...filtered].sort((a, b) => {
      if (sortKey === 'date') return b.created_at.localeCompare(a.created_at);
      if (sortKey === 'cost') return (b.cost_usd ?? 0) - (a.cost_usd ?? 0);
      return a.status.localeCompare(b.status);
    });
  }, [dispatches, statusFilter, sortKey]);

  return (
    <section
      className="flex flex-col gap-3"
      data-testid="agent-history-grid"
      data-agent-name={agentName}
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
            HISTORY
          </span>
          <button
            type="button"
            data-testid="failed-filter-chip"
            aria-pressed={statusFilter === 'failed'}
            onClick={() =>
              setStatusFilter((prev) => (prev === 'failed' ? 'all' : 'failed'))
            }
            className={[
              'mono text-[9px] uppercase tracking-[0.18em] border rounded-md px-2 py-0.5 transition-colors',
              statusFilter === 'failed'
                ? 'border-rose-400/60 text-rose-400 bg-rose-400/10'
                : 'border-border-default text-text-primary/50 hover:border-rose-400/40 hover:text-rose-400',
            ].join(' ')}
          >
            FAILED ONLY
          </button>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
            STATUS
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="bg-bg-panel border border-border-default rounded-md px-2 py-1 text-[11px] text-text-primary"
            >
              <option value="all">All</option>
              {ALL_DISPATCH_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
            SORT
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="bg-bg-panel border border-border-default rounded-md px-2 py-1 text-[11px] text-text-primary"
            >
              <option value="date">Date</option>
              <option value="cost">Cost</option>
              <option value="status">Status</option>
            </select>
          </label>
        </div>
      </header>

      {loading ? (
        <p className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40">
          LOADING…
        </p>
      ) : error ? (
        <p className="mono text-[11px] uppercase tracking-[0.18em] text-rose-400">
          ERROR — {error}
        </p>
      ) : visible.length === 0 ? (
        <p className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40">
          NO RUNS YET
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((d) => (
            <AgentTile
              key={d.id}
              dispatch={d}
              onClick={onTileClick}
              onRerun={onRerun}
            />
          ))}
        </div>
      )}
    </section>
  );
}
