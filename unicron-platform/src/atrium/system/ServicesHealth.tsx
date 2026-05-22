// ServicesHealth.tsx — Live health checks for Atrium "Services Health" panel.
// Originally Sprint 3 Stream D / S4a (static cards). Live ping behavior added
// in response to atrium-realtime-audit-2026-05-21.md item #14:
//   "Services Health — implement the live health checks promised in the
//    ServicesHealth.tsx:3 comment ('Live health checks wire in Sprint 7');
//    ping Supabase, Notion, Slack, Inngest, GitHub, Vercel and color-code
//    each card by status."
// Data source: GET /api/atrium/services-health (re-polls every 60s).

import { useEffect, useState } from 'react';
import { PathfinderSyncPanel } from './PathfinderSyncPanel';

type ServiceId = 'supabase' | 'notion' | 'slack' | 'inngest' | 'github' | 'vercel';
type ServiceStatus = 'healthy' | 'degraded' | 'down' | 'unconfigured';

interface ServiceHealth {
  id: ServiceId;
  name: string;
  status: ServiceStatus;
  latency_ms: number | null;
  error: string | null;
  checked_at: string;
}

interface HealthResponse {
  services: ServiceHealth[];
  fetched_at: string;
}

const SERVICE_DESCRIPTIONS: Record<ServiceId, string> = {
  supabase: 'Database + auth + realtime',
  vercel: 'Deploy + serverless functions',
  notion: 'Knowledge + workspace docs',
  slack: 'Team comms + Orchestrator surface',
  github: 'Knowledge vault (unicron-knowledge)',
  inngest: 'Event queue + cron orchestration',
};

const STATUS_COLOR: Record<ServiceStatus, string> = {
  healthy: '#2E8E66',
  degraded: '#C28A1F',
  down: '#E14B4B',
  unconfigured: '#6B7280',
};

const STATUS_LABEL: Record<ServiceStatus, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  down: 'Down',
  unconfigured: 'Unconfigured',
};

const POLL_INTERVAL_MS = 60_000;

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export default function ServicesHealth() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const res = await fetch('/api/atrium/services-health', {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const body = (await res.json()) as HealthResponse;
        if (cancelled) return;
        setData(body);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const id = setInterval(() => { void load(); }, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="space-y-4">
      {loading && data === null && (
        <div className="bg-bg-card border border-border-default rounded-xl px-5 py-4 mono text-[11px] text-text-muted">
          Pinging services…
        </div>
      )}

      {error && data === null && (
        <div
          className="bg-bg-card border rounded-xl px-5 py-4 mono text-[11px]"
          style={{ borderColor: '#E14B4B66', color: '#E14B4B' }}
        >
          Failed to load service health: {error}
        </div>
      )}

      {data !== null && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.services.map((svc) => {
            const color = STATUS_COLOR[svc.status];
            const description = SERVICE_DESCRIPTIONS[svc.id] ?? '';
            return (
              <div
                key={svc.id}
                className="bg-bg-card rounded-xl p-4 border border-border-default hover:border-border-hover transition-colors flex items-start gap-3"
              >
                <span
                  className="w-2 h-2 mt-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}60` }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="mono text-[12px] text-text-primary font-medium truncate">
                      {svc.name}
                    </div>
                    <span
                      className="mono text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded shrink-0"
                      style={{
                        color,
                        backgroundColor: `${color}1A`,
                        border: `1px solid ${color}40`,
                      }}
                    >
                      {STATUS_LABEL[svc.status]}
                    </span>
                  </div>
                  {description && (
                    <div className="mono text-[10px] text-text-secondary mt-0.5">
                      {description}
                    </div>
                  )}
                  <div className="mono text-[9px] uppercase tracking-[0.12em] text-text-muted mt-1.5 flex items-center gap-2 flex-wrap">
                    <span>
                      Latency: {svc.latency_ms !== null ? `${svc.latency_ms}ms` : '—'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Checked {relativeTime(svc.checked_at)}</span>
                  </div>
                  {svc.error && (
                    <div
                      className="mono text-[10px] mt-1 break-words"
                      style={{ color: '#E14B4B' }}
                    >
                      {svc.error}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PathfinderSyncPanel />

      <div className="bg-bg-card border border-border-default rounded-xl px-5 py-4">
        <div className="mono text-[9px] uppercase tracking-[0.16em] text-text-muted mb-1">
          About this panel
        </div>
        <p className="mono text-[11px] text-text-secondary leading-relaxed">
          Each card pings its upstream API live (re-polled every 60s). Green = healthy
          (&lt;2s response), orange = degraded (slow response), red = down (non-2xx or
          timeout), gray = unconfigured (no API token in Vercel env). If a service
          shows down, check its public status page directly.
          {data?.fetched_at && (
            <>
              {' '}
              Last fetched <span className="text-text-secondary">{relativeTime(data.fetched_at)}</span>.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
