// GET /api/agents → { ingestor, ranker, adjacent }
//
// Per agent, returns the latest agent_runs row plus derived stats:
//   - records_this_cycle: agent_runs.records_processed for the latest run
//   - avg_latency_ms_last_hour: average of agent_log.latency_ms over the last hour
//   - status: 'running' | 'idle' | 'scheduled' | 'failed'
//       - 'running' if the latest run has no completed_at and status='running'
//       - 'failed' if the latest run.status='failed'
//       - 'idle' if the latest run completed >5 minutes ago
//       - 'scheduled' (only for adjacent — runs weekly)
//       - 'success' falls through to 'idle' once stale

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { AgentName, AgentRun } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Returns the full 10-agent fleet so any deployed Computer agent surfaces
// here without a code change. Cells render only for agents AgentStatusRow
// has spec'd (currently ingestor / ranker / verifier / adjacent); the rest
// surface via /api/agents/<name>-specific endpoints.
const AGENTS: AgentName[] = [
  'ingestor',
  'ranker',
  'adjacent',
  'verifier',
  'outreach',
  'pulse',
  'competitive',
  'briefing',
  'customer-intel',
  'eval',
];
const FIVE_MIN_MS = 5 * 60 * 1000;
const SCHEDULED_AGENTS: ReadonlySet<AgentName> = new Set<AgentName>([
  'adjacent',
  'competitive',
  'briefing',
  'eval',
]);

interface AgentSummary {
  agent: AgentName;
  status: 'running' | 'idle' | 'scheduled' | 'failed';
  last_run: AgentRun | null;
  records_this_cycle: number;
  avg_latency_ms_last_hour: number | null;
}

export async function GET() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const summaries = await Promise.all(
    AGENTS.map(async (agent): Promise<AgentSummary> => {
      // Latest run
      const { data: runRows } = await supabase
        .from('agent_runs')
        .select('*')
        .eq('agent_name', agent)
        .order('started_at', { ascending: false })
        .limit(1);
      const lastRun = (runRows?.[0] ?? null) as AgentRun | null;

      // Average latency over last hour
      const logsRes = await supabase
        .from('agent_log')
        .select('latency_ms')
        .eq('agent_name', agent)
        .gte('ts', oneHourAgo)
        .not('latency_ms', 'is', null);

      const logs = (logsRes.data ?? []) as Array<{ latency_ms: number | null }>;
      let avgLatency: number | null = null;
      if (logs.length > 0) {
        const total = logs.reduce((sum, r) => sum + (r.latency_ms ?? 0), 0);
        avgLatency = Math.round(total / logs.length);
      }

      // Derive status
      let status: AgentSummary['status'];
      const isScheduled = SCHEDULED_AGENTS.has(agent);
      if (!lastRun) {
        status = isScheduled ? 'scheduled' : 'idle';
      } else if (lastRun.status === 'running') {
        status = 'running';
      } else if (lastRun.status === 'failed') {
        status = 'failed';
      } else {
        // success — derive from recency
        const completedAt = lastRun.completed_at ? new Date(lastRun.completed_at).getTime() : 0;
        const stale = Date.now() - completedAt > FIVE_MIN_MS;
        if (isScheduled) {
          status = 'scheduled';
        } else {
          status = stale ? 'idle' : 'running';
        }
      }

      return {
        agent,
        status,
        last_run: lastRun,
        records_this_cycle: lastRun?.records_processed ?? 0,
        avg_latency_ms_last_hour: avgLatency,
      };
    }),
  );

  // Full 10-agent shape. Agents without any agent_runs rows yet return a
  // null `last_run` and a derived `idle` (or `scheduled`) status.
  const result: Record<AgentName, AgentSummary> = AGENTS.reduce(
    (acc, agent) => {
      acc[agent] = summaries.find((s) => s.agent === agent)!;
      return acc;
    },
    {} as Record<AgentName, AgentSummary>,
  );
  return NextResponse.json(result);
}
