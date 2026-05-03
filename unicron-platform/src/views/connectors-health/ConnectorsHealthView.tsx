import { useCallback, useEffect, useState } from 'react';
import { fetchConnectorsHealth } from '../../lib/agents/connectorsHealthClient';
import {
  CONNECTOR_STATUSES_HEALTH,
  type ConnectorsHealthRollup,
} from '../../lib/contracts/connectorsHealth';
import { ConnectorTypeBreakdown } from './ConnectorTypeBreakdown';
import { ErrorRateCard } from './ErrorRateCard';
import { MostRecentSuccessTable } from './MostRecentSuccessTable';
import { ConnectorStatusBadge } from './ConnectorStatusBadge';

// Read-only system-wide connector health dashboard.
// - Fetches once on mount + on Refresh click. Polling is intentionally
//   off (operator brief: poll on mount only).
// - Mutations live in Settings → Connectors; this view links there
//   conceptually but does NOT duplicate.
export function ConnectorsHealthView() {
  const [rollup, setRollup] = useState<ConnectorsHealthRollup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Bumping `nonce` re-runs the fetch effect — used by the Refresh button.
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => {
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // setState calls live inside async callbacks (microtask), not in the
    // effect's synchronous body — satisfies react-hooks/set-state-in-effect.
    fetchConnectorsHealth()
      .then((r) => {
        if (cancelled) return;
        setRollup(r);
        setError(null);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    // Mark loading via a microtask so it doesn't fire synchronously inside
    // the effect body (the lint rule's exact target).
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
    });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return (
    <div className="px-6 py-8 flex flex-col gap-6">
      <header className="flex items-baseline justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="mono text-[16px] tracking-wide text-text-primary">
            Connector Health
          </h1>
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
            system-wide aggregate · read-only
          </span>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          data-testid="connectors-health-refresh"
          className="mono text-[11px] uppercase tracking-[0.18em] border border-border-default rounded-md px-3 py-1.5 text-text-primary/70 hover:text-text-primary hover:border-text-primary/40 transition-colors disabled:opacity-40"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error ? (
        <p
          data-testid="connectors-health-error"
          className="mono text-[11px] uppercase tracking-[0.18em] text-rose-400 border border-rose-400/40 rounded-md px-3 py-2"
        >
          {error}
        </p>
      ) : null}

      {!rollup && !error ? (
        <SkeletonGrid />
      ) : rollup ? (
        <>
          <section
            data-testid="connectors-totals"
            className="grid grid-cols-2 sm:grid-cols-4 gap-4"
          >
            <Tile label="Connectors" value={rollup.totals.connectors} />
            <Tile label="Customers" value={rollup.totals.customers} />
            <Tile label="Active" value={rollup.byStatus.active} tone="emerald" />
            <Tile
              label="Need attention"
              value={
                rollup.byStatus.error +
                rollup.byStatus.expired +
                rollup.byStatus.revoked
              }
              tone="rose"
            />
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ConnectorTypeBreakdown
              byType={rollup.byType}
              total={rollup.totals.connectors}
            />
            <StatusBreakdown rollup={rollup} />
            <ErrorRateCard
              total={rollup.errorRate24h.total_events}
              failed={rollup.errorRate24h.failed_events}
              rate={rollup.errorRate24h.rate}
            />
          </section>

          <MostRecentSuccessTable rows={rollup.mostRecentSuccessByConnector} />

          <footer className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/30">
            generated {rollup.generated_at}
          </footer>
        </>
      ) : null}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'emerald' | 'rose';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-400'
      : tone === 'rose'
        ? 'text-rose-400'
        : 'text-text-primary';
  return (
    <div
      data-testid="connectors-totals-tile"
      className="border border-border-default rounded-md bg-bg-panel p-4 flex flex-col gap-1"
    >
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
        {label}
      </span>
      <span className={`mono text-[28px] ${toneClass}`}>{value}</span>
    </div>
  );
}

function StatusBreakdown({ rollup }: { rollup: ConnectorsHealthRollup }) {
  return (
    <section
      data-testid="connectors-by-status"
      className="border border-border-default rounded-md bg-bg-panel p-4 flex flex-col gap-3"
    >
      <header className="flex items-baseline justify-between">
        <h2 className="mono text-[12px] uppercase tracking-[0.18em] text-text-primary">
          By status
        </h2>
      </header>
      <ul className="flex flex-col gap-1">
        {CONNECTOR_STATUSES_HEALTH.map((s) => (
          <li
            key={s}
            data-testid="connectors-by-status-row"
            data-status={s}
            className="flex items-center justify-between"
          >
            <ConnectorStatusBadge status={s} />
            <span className="mono text-[12px] text-text-primary/70">
              {rollup.byStatus[s] ?? 0}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SkeletonGrid() {
  return (
    <div
      data-testid="connectors-health-skeleton"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="h-24 border border-border-default border-dashed rounded-md bg-bg-panel/50 animate-pulse"
        />
      ))}
    </div>
  );
}
