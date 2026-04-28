'use client';

import * as React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import { Card, Phase2Banner, Row } from '../Field';

interface ProbeResult {
  status: 'ok' | 'degraded' | 'failed' | 'unknown';
  detail: string;
}

interface AgentSummaryShape {
  last_run?: {
    status?: string;
    started_at?: string;
    completed_at?: string | null;
  } | null;
}

export function IntegrationsSection() {
  const [supabase, setSupabase] = React.useState<ProbeResult>({ status: 'unknown', detail: 'checking…' });
  const [agents, setAgents] = React.useState<ProbeResult>({ status: 'unknown', detail: 'checking…' });

  React.useEffect(() => {
    // Supabase health: hit /api/branches and confirm a non-empty array.
    void fetch('/pathfinder/api/branches', { cache: 'no-store' })
      .then((r) => r.json())
      .then((rows: unknown[]) => {
        if (Array.isArray(rows) && rows.length > 0) {
          setSupabase({ status: 'ok', detail: `${rows.length} branches reachable` });
        } else {
          setSupabase({ status: 'degraded', detail: 'reachable but empty branches table' });
        }
      })
      .catch(() => setSupabase({ status: 'failed', detail: 'no response' }));

    // Anthropic + Vercel cron probe via /api/agents. The integration is
    // OK when any agent has a successful run on record; idle between
    // cycles isn't degraded — that's just the schedule. Only treat as
    // degraded if the most recent run failed; failed if no runs at all.
    void fetch('/pathfinder/api/agents', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: Record<string, AgentSummaryShape>) => {
        const summaries = Object.values(data ?? {});
        const anySuccess = summaries.some((a) => a?.last_run?.status === 'success');
        const latestFailed = summaries.some(
          (a) => a?.last_run?.status === 'failed',
        );
        if (anySuccess && !latestFailed) {
          const lastRun = summaries
            .map((a) => a?.last_run?.completed_at ?? a?.last_run?.started_at)
            .filter((t): t is string => Boolean(t))
            .sort()
            .pop();
          const ago = lastRun ? relativeAgo(lastRun) : 'unknown';
          setAgents({ status: 'ok', detail: `last successful run ${ago}` });
        } else if (anySuccess && latestFailed) {
          setAgents({ status: 'degraded', detail: 'most recent run failed; previous runs succeeded' });
        } else {
          setAgents({ status: 'failed', detail: 'no successful runs on record' });
        }
      })
      .catch(() => setAgents({ status: 'failed', detail: 'no response' }));
  }, []);

  function relativeAgo(iso: string): string {
    const ms = Date.now() - Date.parse(iso);
    if (!Number.isFinite(ms) || ms < 0) return 'just now';
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
  }

  return (
    <>
      <Card
        title="Connection status"
        description="Live health probes for the integrations the dashboard depends on. Refresh the page to re-probe."
      >
        <Row label="Supabase" hint={supabase.detail}>
          <StatusBadge status={supabase.status} />
        </Row>
        <Row label="Anthropic API" hint={agents.detail}>
          <StatusBadge status={agents.status} />
        </Row>
        <Row label="Vercel cron" hint={agents.detail + ' (inferred from agent_runs).'}>
          <StatusBadge status={agents.status} />
        </Row>
        <Row label="Perplexity Computer" hint="Probed indirectly via the Ingestor's last_run timestamp.">
          <StatusBadge status={agents.status} />
        </Row>
        <Row label="Slack webhook" hint="Probed when Briefing ships (Layer 3).">
          <StatusBadge status="unknown" />
        </Row>
        <Row label="Resend (email)" hint="Probed when Briefing ships (Layer 3).">
          <StatusBadge status="unknown" />
        </Row>
        <Row label="HubSpot" hint="Phase 2 — wires up alongside the pipeline mapping.">
          <StatusBadge status="unknown" />
        </Row>
      </Card>

      <Card title="API key rotation">
        <Phase2Banner note="Rotation flow (generate new → swap env vars → redeploy → revoke old) ships in Phase 2. For now, rotate manually via Vercel project settings." />
      </Card>

      <Card title="HubSpot pipeline mapping">
        <Phase2Banner note="Map Pathfinder lead lifecycle stages to HubSpot deal stages. Ships with the Zedcor production rollout." />
      </Card>
    </>
  );
}

function StatusBadge({ status }: { status: ProbeResult['status'] }) {
  const palette: Record<ProbeResult['status'], { color: string; label: string }> = {
    ok: { color: PF_TINTS.runningGreen, label: 'OK' },
    degraded: { color: '#FFB454', label: 'DEGRADED' },
    failed: { color: '#f87171', label: 'FAILED' },
    unknown: { color: PF_TINTS.inkDim, label: 'UNKNOWN' },
  };
  const p = palette[status];
  return (
    <span
      className="pf-mono"
      style={{
        fontSize: 9,
        color: p.color,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        padding: '2px 8px',
        border: `1px solid ${hexAlpha(p.color, 0.4)}`,
        borderRadius: 2,
      }}
    >
      {p.label}
    </span>
  );
}
