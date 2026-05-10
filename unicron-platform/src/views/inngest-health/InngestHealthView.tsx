import { useCallback, useEffect, useState } from 'react';
import { fetchInngestHealth } from '../../lib/agents/inngestHealthClient';
import type {
  InngestFunctionHealth,
  InngestHealthRollup,
} from '../../lib/contracts/inngestHealth';

// Read-only Inngest scheduled-function health monitor.
// - Fetches once on mount + on Refresh click. No polling (operator brief
//   matches the Connectors Health view: poll-on-mount only).
// - Renders a status grid: function name + last success + last failure +
//   24h failure rate + next scheduled run + tone badge.
// - Tone derivation lives in `deriveInngestRollup` (pure, unit-tested).
export function InngestHealthView() {
  const [rollup, setRollup] = useState<InngestHealthRollup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => {
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchInngestHealth()
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
            Inngest Health
          </h1>
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
            scheduled functions · runs · cron schedules · read-only
          </span>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          data-testid="inngest-health-refresh"
          className="mono text-[11px] uppercase tracking-[0.18em] border border-border-default rounded-md px-3 py-1.5 text-text-primary/70 hover:text-text-primary hover:border-text-primary/40 transition-colors disabled:opacity-40"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error ? (
        <p
          data-testid="inngest-health-error"
          className="mono text-[11px] uppercase tracking-[0.18em] text-rose-400 border border-rose-400/40 rounded-md px-3 py-2"
        >
          {error}
        </p>
      ) : null}

      {!rollup && !error ? (
        <SkeletonGrid />
      ) : rollup ? (
        <>
          {!rollup.configured ? <ConfigureMeBanner /> : null}

          <section
            data-testid="inngest-totals"
            className="grid grid-cols-2 sm:grid-cols-4 gap-4"
          >
            <Tile label="Functions" value={rollup.totals.functions} />
            <Tile label="Runs (24h)" value={rollup.totals.runs_24h} />
            <Tile
              label="Failed (24h)"
              value={rollup.totals.failed_24h}
              tone={rollup.totals.failed_24h > 0 ? 'rose' : undefined}
            />
            <Tile
              label="Red functions"
              value={rollup.byFunction.filter((f) => f.tone === 'red').length}
              tone={
                rollup.byFunction.some((f) => f.tone === 'red')
                  ? 'rose'
                  : undefined
              }
            />
          </section>

          <FunctionGrid rows={rollup.byFunction} />

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
      data-testid="inngest-totals-tile"
      className="border border-border-default rounded-md bg-bg-panel p-4 flex flex-col gap-1"
    >
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
        {label}
      </span>
      <span className={`mono text-[28px] ${toneClass}`}>{value}</span>
    </div>
  );
}

function ConfigureMeBanner() {
  return (
    <p
      data-testid="inngest-configure-me"
      className="mono text-[11px] uppercase tracking-[0.18em] text-amber-300 border border-amber-300/40 bg-amber-300/5 rounded-md px-3 py-2"
    >
      INNGEST_API_KEY not configured — showing demo data. See operator-todo
      `MEMORY/operator-todos/2026-05-03-metacron-needs-inngest-api-key.md`.
    </p>
  );
}

function FunctionGrid({ rows }: { rows: InngestFunctionHealth[] }) {
  if (rows.length === 0) {
    return (
      <p
        data-testid="inngest-functions-empty"
        className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40 border border-border-default border-dashed rounded-md px-3 py-6 text-center"
      >
        No Inngest functions registered.
      </p>
    );
  }

  return (
    <section
      data-testid="inngest-functions"
      className="border border-border-default rounded-md bg-bg-panel overflow-hidden"
    >
      <table className="w-full">
        <thead>
          <tr className="border-b border-border-default">
            <Th>Function</Th>
            <Th>Cron</Th>
            <Th>Last success</Th>
            <Th>Last failure</Th>
            <Th>Failure rate (24h)</Th>
            <Th>Next run</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.function_id}
              data-testid="inngest-function-row"
              data-function-id={row.function_id}
              data-tone={row.tone}
              className={[
                'border-b border-border-default/60 last:border-b-0',
                row.tone === 'red' ? 'bg-rose-500/5' : '',
                row.tone === 'yellow' ? 'bg-amber-300/5' : '',
              ].join(' ')}
            >
              <Td>
                <div className="flex flex-col">
                  <span className="mono text-[12px] text-text-primary">
                    {row.name}
                  </span>
                  <span className="mono text-[10px] uppercase tracking-[0.16em] text-text-primary/40">
                    {row.function_id}
                  </span>
                </div>
              </Td>
              <Td>
                <span className="mono text-[11px] text-text-primary/70">
                  {row.cron ?? '—'}
                </span>
              </Td>
              <Td>
                <RelTime iso={row.last_success_at} />
              </Td>
              <Td>
                <RelTime iso={row.last_failure_at} />
              </Td>
              <Td>
                <span className="mono text-[12px] text-text-primary/80">
                  {row.total_runs_24h === 0
                    ? '—'
                    : `${(row.failure_rate_24h * 100).toFixed(0)}% (${row.total_runs_24h})`}
                </span>
              </Td>
              <Td>
                <RelTime iso={row.next_run_at} future />
              </Td>
              <Td>
                <ToneBadge tone={row.tone} />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40 text-left px-4 py-3 font-normal">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}

function ToneBadge({ tone }: { tone: 'red' | 'yellow' | 'green' | 'unknown' }) {
  const cfg = (
    {
      red: { label: 'FAILING', cls: 'text-rose-400 border-rose-400/40' },
      yellow: { label: 'STALE', cls: 'text-amber-300 border-amber-300/40' },
      green: { label: 'OK', cls: 'text-emerald-400 border-emerald-400/40' },
      unknown: {
        label: 'UNKNOWN',
        cls: 'text-text-primary/40 border-border-default',
      },
    } as const
  )[tone];
  return (
    <span
      data-testid="inngest-function-tone"
      className={[
        'mono text-[10px] uppercase tracking-[0.2em] border rounded-sm px-2 py-1 inline-block',
        cfg.cls,
      ].join(' ')}
    >
      {cfg.label}
    </span>
  );
}

function RelTime({ iso, future = false }: { iso: string | null; future?: boolean }) {
  if (!iso) {
    return (
      <span className="mono text-[11px] text-text-primary/30">—</span>
    );
  }
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return (
      <span className="mono text-[11px] text-text-primary/30">—</span>
    );
  }
  const diff = future ? ms - Date.now() : Date.now() - ms;
  const label = formatRel(Math.max(0, diff));
  return (
    <span
      title={iso}
      className="mono text-[11px] text-text-primary/70"
    >
      {future ? `in ${label}` : `${label} ago`}
    </span>
  );
}

function formatRel(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

function SkeletonGrid() {
  return (
    <div
      data-testid="inngest-health-skeleton"
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
