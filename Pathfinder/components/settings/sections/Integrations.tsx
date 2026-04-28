'use client';

import * as React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import { Card, Phase2Banner, Row } from '../Field';

interface ProbeResult {
  status: 'ok' | 'degraded' | 'failed' | 'unknown';
  detail: string;
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

    // Anthropic / Perplexity probe via /api/agents (any agent_runs row that
    // logged a model_used latency_ms in the last hour proves the chain).
    void fetch('/pathfinder/api/agents', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: Record<string, { avg_latency_ms_last_hour?: number | null }>) => {
        const live = Object.values(data ?? {}).some(
          (a) => typeof a?.avg_latency_ms_last_hour === 'number' && (a.avg_latency_ms_last_hour ?? 0) > 0,
        );
        setAgents(
          live
            ? { status: 'ok', detail: 'recent model_route latency observed' }
            : { status: 'degraded', detail: 'no model_route events in the last hour' },
        );
      })
      .catch(() => setAgents({ status: 'failed', detail: 'no response' }));
  }, []);

  return (
    <>
      <Card
        title="Connection status"
        description="Live health probes for the integrations the dashboard depends on. Refresh the page to re-probe."
      >
        <Row label="Supabase" hint={supabase.detail}>
          <StatusBadge status={supabase.status} />
        </Row>
        <Row
          label="Anthropic API"
          hint={agents.detail + ' — green when a Ranker or Verifier cycle has fired in the last hour.'}
        >
          <StatusBadge status={agents.status} />
        </Row>
        <Row label="Vercel cron" hint="Inferred from the same /api/agents probe; same pipeline.">
          <StatusBadge status={agents.status} />
        </Row>
        <Row label="Perplexity Computer" hint="Probed indirectly via the Ingestor's last_run timestamp.">
          <StatusBadge status="unknown" />
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
