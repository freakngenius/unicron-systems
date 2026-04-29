'use client';

import * as React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import { Button, Card, Phase2Banner } from '../Field';
import { AGENTS } from '@/lib/agent-tints';
import type { AgentName } from '@/lib/types';

const SCHEDULES: Record<AgentName, { runtime: string; schedule: string }> = {
  ingestor: { runtime: 'perplexity space', schedule: '0 */6 * * *' },
  ranker: { runtime: 'vercel cron', schedule: '0,30 * * * *' },
  adjacent: { runtime: 'perplexity space', schedule: '0 9 * * 5' },
  verifier: { runtime: 'vercel cron', schedule: '0,30 * * * *' },
  outreach: { runtime: 'perplexity space', schedule: 'event-driven' },
  pulse: { runtime: 'vercel cron', schedule: '0 2 * * *' },
  competitive: { runtime: 'perplexity space', schedule: '0 4 * * 3' },
  briefing: { runtime: 'vercel cron', schedule: '0 6 * * 5' },
  'customer-intel': { runtime: 'perplexity space', schedule: 'every 12h' },
  eval: { runtime: 'vercel cron', schedule: '0 6 * * 0' },
  'contact-resolver': { runtime: 'vercel cron', schedule: '*/10 * * * *' },
};

export function AgentsSection() {
  const [agentRows, setAgentRows] = React.useState<Record<string, AgentSummaryShape> | null>(null);

  React.useEffect(() => {
    void fetch('/pathfinder/api/agents', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setAgentRows)
      .catch(() => setAgentRows({}));
  }, []);

  return (
    <>
      <Card
        title="Agent status"
        description="Live status of all 10 agents. Manual triggers + pause-all ship in Phase 2 — for now, Vercel cron agents fire on schedule and Perplexity Spaces fire from their own cron."
      >
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              font: `400 12px ${PF_TINTS.mono}`,
              color: PF_TINTS.ink,
            }}
          >
            <thead>
              <tr>
                {['agent', 'runtime', 'schedule', 'status', 'last cycle'].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '10px 18px',
                      font: `500 9px ${PF_TINTS.mono}`,
                      letterSpacing: '0.10em',
                      textTransform: 'uppercase',
                      color: PF_TINTS.inkDim,
                      borderBottom: `1px solid ${PF_TINTS.ruleSoft}`,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(AGENTS).map(([name, meta]) => {
                const summary = agentRows?.[name];
                const status = summary?.status ?? '—';
                const lastRun = summary?.last_run;
                const lastCycle = lastRun?.completed_at ?? lastRun?.started_at ?? '—';
                return (
                  <tr key={name}>
                    <td style={cell()}>{meta.label.toLowerCase()}</td>
                    <td style={cell({ dim: true })}>{SCHEDULES[name as AgentName].runtime}</td>
                    <td style={cell({ dim: true })}>{SCHEDULES[name as AgentName].schedule}</td>
                    <td style={cell()}>
                      <StatusChip status={status} />
                    </td>
                    <td style={cell({ dim: true })}>
                      {lastCycle === '—' ? '—' : new Date(lastCycle).toISOString().slice(0, 19) + 'Z'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Manual trigger + pause-all"
        description="Manual cron trigger requires the CRON_SECRET; pause-all needs a kill-switch endpoint. Both ship in Phase 2."
        footer={
          <>
            <Button variant="ghost" disabled>
              Trigger ranker
            </Button>
            <Button variant="ghost" disabled>
              Trigger verifier
            </Button>
            <Button variant="danger" disabled>
              Pause all agents
            </Button>
          </>
        }
      >
        <Phase2Banner note="Manual trigger and pause-all kill switch ship in Phase 2 alongside the operator-only feature gate." />
      </Card>
    </>
  );
}

function cell({ dim = false }: { dim?: boolean } = {}): React.CSSProperties {
  return {
    padding: '10px 18px',
    borderTop: `1px solid ${PF_TINTS.ruleHair}`,
    color: dim ? PF_TINTS.inkDim : PF_TINTS.ink,
  };
}

function StatusChip({ status }: { status: string }) {
  const isRunning = status === 'running';
  const color = isRunning ? PF_TINTS.runningGreen : PF_TINTS.inkDim;
  const label = status === 'running' ? 'RUNNING' : status === 'failed' ? 'FAILED' : 'SCHEDULED';
  return (
    <span
      className="pf-mono"
      style={{
        fontSize: 9,
        color,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
  );
}

interface AgentSummaryShape {
  status?: string;
  last_run?: { started_at?: string; completed_at?: string | null };
}
