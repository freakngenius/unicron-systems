import { useEffect, useState } from 'react';
import { getOrgHealth } from '../lib/customersClient';
import type { CustomerOrg, OrgHealthRollup } from '../lib/contracts/customers';
import { HealthMetricCard } from '../components/HealthMetricCard';
import { MiniSparkline } from '../components/MiniSparkline';

interface Props {
  org: CustomerOrg;
  onBack: () => void;
}

export function CustomerDetailView({ org, onBack }: Props) {
  const [health, setHealth] = useState<OrgHealthRollup | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHealth(null);
    setError(null);
    getOrgHealth(org.id)
      .then((rollup) => {
        if (cancelled) return;
        setHealth(rollup);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [org.id]);

  return (
    <div className="px-6 py-8">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            data-testid="customer-detail-back"
            className="mono text-[11px] uppercase tracking-[0.18em] border border-border-default text-text-primary/70 px-3 py-1 rounded-md hover:border-text-primary/60 hover:text-text-primary transition-colors"
          >
            ← CUSTOMERS
          </button>
          <h1 className="mono text-[16px] tracking-wide text-text-primary">
            {org.display_name}
          </h1>
          <span className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40">
            {org.id}
          </span>
        </div>
        <a
          href={`https://unicron.systems/pathfinder/?org=${encodeURIComponent(org.id)}`}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="customer-detail-open-pathfinder"
          className="mono text-[11px] uppercase tracking-[0.18em] border border-text-primary px-3 py-1 rounded-md text-text-primary hover:bg-text-primary hover:text-bg-base transition-colors"
        >
          OPEN PATHFINDER FOR {org.display_name.toUpperCase()} →
        </a>
      </header>

      {error ? (
        <p data-testid="customer-detail-error" className="mono text-[11px] uppercase tracking-[0.18em] text-rose-400">
          {error}
        </p>
      ) : !health ? (
        <SkeletonRow />
      ) : (
        <div className="flex flex-col gap-6" data-testid="customer-detail-health">
          {/* Top metric tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <HealthMetricCard
              label="LEAD VOLUME · 7d"
              value={String(health.lead_volume_7d_total)}
              delta={`${health.lead_volume_30d_total} / 30d`}
            />
            <HealthMetricCard
              label="HIGH SCORE RATE · 7d"
              value={`${(health.high_score_rate_7d * 100).toFixed(0)}%`}
              tone="emerald"
              hint="leads with score ≥ 80"
            />
            <HealthMetricCard
              label="OUTREACH DELIVERY · 7d"
              value={`${(health.outreach_delivery_rate_7d * 100).toFixed(0)}%`}
              tone="gold"
              hint="sent ÷ drafted"
            />
            <HealthMetricCard
              label="ERROR RATE · 7d"
              value={`${(health.error_rate_7d * 100).toFixed(2)}%`}
              tone={health.error_rate_7d > 0.05 ? 'rose' : 'muted'}
              delta={`${health.error_total_7d} errors`}
            />
          </div>

          {/* Sparklines */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <SparklineCard
              label="LEAD VOLUME · 30d"
              data={health.lead_volume_30d}
              testid="customer-detail-lead-sparkline"
            />
            <SparklineCard
              label="ERROR VOLUME · 30d"
              data={health.error_volume_30d}
              testid="customer-detail-error-sparkline"
              stroke="#fb7185"
              fill="rgba(251, 113, 133, 0.10)"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Recent errors */}
            <section className="lg:col-span-2 flex flex-col gap-2 border border-border-default rounded-md bg-bg-panel p-4">
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
                RECENT ERRORS ({health.recent_errors.length})
              </span>
              {health.recent_errors.length === 0 ? (
                <p className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/30">
                  no recent errors
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5" data-testid="customer-detail-errors">
                  {health.recent_errors.map((e) => (
                    <li
                      key={`${e.created_at}-${e.agent_name}`}
                      className="flex items-baseline justify-between gap-3 border-l border-rose-400/40 pl-3"
                    >
                      <span className="mono text-[11px] text-text-primary">{e.agent_name}</span>
                      <span className="text-[12px] text-text-primary/70 truncate min-w-0 flex-1 mx-3">
                        {e.message}
                      </span>
                      <span className="mono text-[10px] text-text-primary/30">
                        {e.created_at.slice(0, 16).replace('T', ' ')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Active sources */}
            <section className="flex flex-col gap-2 border border-border-default rounded-md bg-bg-panel p-4">
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
                ACTIVE SOURCES ({health.active_sources.length})
              </span>
              {health.active_sources.length === 0 ? (
                <p className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/30">
                  no sources enabled
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5" data-testid="customer-detail-sources">
                  {health.active_sources.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-col gap-0.5 border border-border-default rounded-md px-2 py-1.5"
                    >
                      <span className="mono text-[11px] text-text-primary truncate">{s.label}</span>
                      <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
                        {s.type} · {s.jurisdiction ?? '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function SparklineCard({
  label,
  data,
  testid,
  stroke,
  fill,
}: {
  label: string;
  data: number[];
  testid: string;
  stroke?: string;
  fill?: string;
}) {
  const total = data.reduce((a, b) => a + b, 0);
  const peak = Math.max(...data);
  return (
    <div data-testid={testid} className="flex flex-col gap-2 border border-border-default rounded-md bg-bg-panel p-4">
      <div className="flex items-baseline justify-between">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
          {label}
        </span>
        <span className="mono text-[11px] text-text-primary/60">
          total {total} · peak {peak}
        </span>
      </div>
      <MiniSparkline data={data} stroke={stroke} fill={fill} ariaLabel={label} />
    </div>
  );
}

function SkeletonRow() {
  return (
    <div data-testid="customer-detail-skeleton" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-20 border border-border-default border-dashed rounded-md bg-bg-panel/50 animate-pulse"
        />
      ))}
    </div>
  );
}
