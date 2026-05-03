import { useCallback, useEffect, useMemo, useState } from 'react';
import { listAuditLog } from '../../lib/agents/auditLogClient';
import type { AgentDispatch } from '../../lib/contracts/agentConsole';
import { listAgents } from '../../lib/agentRegistry';
// Side-effect import — populates the agent registry so we can offer a
// Phase 1 select for known agents instead of a free-text input.
import '../../lib/agents';
import { AuditLogFilters, type AuditLogFilterState } from './AuditLogFilters';
import { AuditLogTable } from './AuditLogTable';

const INITIAL_FILTER: AuditLogFilterState = {
  verifiedBy: '',
  agentName: '',
  window: '7d',
};

interface FetchState {
  rows: AgentDispatch[] | null;
  hasMore: boolean;
  error: string | null;
}

const INITIAL_FETCH: FetchState = { rows: null, hasMore: false, error: null };

export function AuditLogView() {
  const [filter, setFilterRaw] = useState<AuditLogFilterState>(INITIAL_FILTER);
  const [page, setPage] = useState(0);
  const [fetchState, setFetchState] = useState<FetchState>(INITIAL_FETCH);

  // Composing the filter setter resets the page in the same render — avoids
  // a cascading useEffect → setPage → re-fetch chain.
  const setFilter = useCallback((next: AuditLogFilterState) => {
    setFilterRaw(next);
    setPage(0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let active = true;
    listAuditLog({
      verified_by: filter.verifiedBy.trim() || undefined,
      agent_name: filter.agentName.trim() || undefined,
      window: filter.window,
      page,
    })
      .then((res) => {
        if (cancelled) return;
        active = false;
        setFetchState({ rows: res.rows, hasMore: res.hasMore, error: null });
      })
      .catch((e) => {
        if (cancelled) return;
        active = false;
        setFetchState({
          rows: [],
          hasMore: false,
          error: e instanceof Error ? e.message : String(e),
        });
      });
    return () => {
      cancelled = true;
      // If the request resolves after unmount/refetch, our state writes are
      // skipped via the cancelled flag above.
      void active;
    };
  }, [filter.verifiedBy, filter.agentName, filter.window, page]);

  const rows = fetchState.rows;
  const hasMore = fetchState.hasMore;
  const error = fetchState.error;

  const agentOptions = useMemo(() => listAgents().map((a) => a.name), []);

  return (
    <div className="px-6 py-8">
      <header className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="mono text-[16px] tracking-wide text-text-primary">Audit log</h1>
          <p className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40 mt-1">
            Read-only · human-verification activity on agent dispatches
          </p>
        </div>
        <span className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40">
          {rows ? `${rows.length} rows · page ${page + 1}` : 'Loading'}
        </span>
      </header>

      <AuditLogFilters
        value={filter}
        onChange={setFilter}
        agentOptions={agentOptions}
      />

      {error ? (
        <p
          data-testid="audit-log-error"
          className="mono text-[11px] uppercase tracking-[0.18em] text-rose-400 mb-4"
        >
          {error}
        </p>
      ) : null}

      {rows === null ? (
        <div
          data-testid="audit-log-loading"
          className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40 p-8 text-center border border-border-default rounded-md bg-bg-panel"
        >
          Loading audit log…
        </div>
      ) : (
        <AuditLogTable rows={rows} />
      )}

      <div className="flex items-center justify-between mt-4">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
          Page size 50 · poll on mount
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="audit-log-prev-page"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="mono text-[11px] uppercase tracking-[0.18em] px-3 py-1 border border-border-default rounded-md disabled:opacity-30"
          >
            Prev
          </button>
          <button
            type="button"
            data-testid="audit-log-next-page"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore}
            className="mono text-[11px] uppercase tracking-[0.18em] px-3 py-1 border border-border-default rounded-md disabled:opacity-30"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
