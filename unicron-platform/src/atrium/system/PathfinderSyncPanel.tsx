// PathfinderSyncPanel.tsx — S4a
// Reads ns_pathfinder_sync_latest and shows the most recent metric per key.
// When the table is empty (no cross-project credentials pasted yet), renders
// an explicit "awaiting credentials" state pointing at the env vars needed.

import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

interface SyncRow {
  id: string;
  metric_key: string;
  metric_value: Record<string, unknown>;
  observed_at: string;
  source_project: string;
}

const DISPLAY_ORDER = [
  'leads_total',
  'leads_top_score',
  'customers_total',
  'agent_runs_24h',
];

function metricLabel(key: string): string {
  switch (key) {
    case 'leads_total': return 'Leads (all-time)';
    case 'leads_top_score': return 'Top-scored lead';
    case 'customers_total': return 'Customers';
    case 'agent_runs_24h': return 'Agent runs (24h)';
    default: return key;
  }
}

function metricDisplay(key: string, value: Record<string, unknown>): string {
  if (key === 'leads_top_score') {
    const score = value.score;
    return score == null ? '—' : String(score);
  }
  const count = value.count;
  return count == null ? '—' : String(count);
}

export function PathfinderSyncPanel() {
  const [rows, setRows] = useState<SyncRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sb = getSupabase();
    sb.rpc('ns_pathfinder_sync_latest', { p_limit: 50 }).then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setRows([]);
        return;
      }
      setRows((data ?? []) as SyncRow[]);
    });
    return () => { cancelled = true; };
  }, []);

  if (rows === null) {
    return (
      <div className="bg-bg-card border border-border-default rounded-xl px-5 py-4 mono text-[11px] text-text-muted">
        Loading Pathfinder sync…
      </div>
    );
  }

  const latestByKey = new Map<string, SyncRow>();
  for (const r of rows) {
    if (!latestByKey.has(r.metric_key)) latestByKey.set(r.metric_key, r);
  }

  const empty = latestByKey.size === 0;

  return (
    <div className="bg-bg-card border border-border-default rounded-xl px-5 py-4">
      <div className="flex items-baseline justify-between mb-2.5">
        <div>
          <div className="mono text-[9px] uppercase tracking-[0.16em] text-text-muted">
            Pathfinder sync
          </div>
          <div className="mono text-[12px] text-text-primary font-medium">
            Cross-project lead rollup
          </div>
        </div>
        {!empty && (
          <div className="mono text-[10px] text-text-muted">
            updated {new Date(rows[0].observed_at).toLocaleTimeString()}
          </div>
        )}
      </div>

      {empty ? (
        <div className="mono text-[11px] text-text-secondary leading-relaxed">
          <div className="mb-1.5 text-text-primary">Awaiting credentials.</div>
          Set <code className="text-text-primary">PATHFINDER_SUPABASE_URL</code> and{' '}
          <code className="text-text-primary">PATHFINDER_SUPABASE_SERVICE_ROLE_KEY</code>{' '}
          on the <em>unicron-platform</em> Vercel project (Production + Preview),
          then redeploy. The <code className="text-text-primary">pathfinder-sync-cron</code>{' '}
          Inngest job will populate this panel on its next run.
          {error && (
            <div className="mt-1.5 text-text-muted">RPC error: {error}</div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {DISPLAY_ORDER.map((key) => {
            const row = latestByKey.get(key);
            return (
              <div key={key} className="border border-border-default rounded-lg px-3 py-2.5">
                <div className="mono text-[9px] uppercase tracking-[0.14em] text-text-muted mb-1">
                  {metricLabel(key)}
                </div>
                <div className="mono text-[18px] text-text-primary font-medium leading-none">
                  {row ? metricDisplay(key, row.metric_value) : '—'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
