// POST /api/refresh — manual Ingestor → Ranker cycle for the demo.
//
// Production ingestion is driven by Computer agents in Perplexity Spaces (see
// prompts/computer-{ingestor,ranker}.md). This endpoint exists so a demo
// presenter can trigger a visible flurry of agent activity on demand: it
// writes a realistic batch of agent_log + agent_runs rows, lightly mutates
// one project's score so the rationale Ranker count-up animates, and bumps
// `ingested_at` on a project so the LIVE counter resets.
//
// Side effects all hit the `pathfinder` schema via the service-role client.
// The dashboard's realtime subscriptions pick everything up automatically.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import type { AgentLogRow, AgentRun } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface AgentLogSeed {
  agent_name: AgentLogRow['agent_name'];
  event_type: string;
  message: string;
  latency_ms?: number;
  model_used?: string;
}

const INGESTOR_SEEDS: AgentLogSeed[] = [
  { agent_name: 'ingestor', event_type: 'ingest_start', message: 'cycle start · manual refresh' },
  {
    agent_name: 'ingestor',
    event_type: 'source_fetch',
    message: 'browsing harriscounty.tx.gov/permits · 14 records',
    latency_ms: 1820,
  },
  {
    agent_name: 'ingestor',
    event_type: 'source_fetch',
    message: 'fetched usaspending api · 7 federal awards',
    latency_ms: 940,
  },
  {
    agent_name: 'ingestor',
    event_type: 'entity_correlate',
    message: 'entity correlate · SAM SOL-2026-04-TxDOT-001 ≈ TxDOT press release apr 22 · merged',
    latency_ms: 1240,
  },
  {
    agent_name: 'ingestor',
    event_type: 'geocode',
    message: 'geocoded · 21/21 · branch-mapped HOU 12, ATL 4, PHX 2, CHI 2, SEA 1',
    latency_ms: 380,
  },
  {
    agent_name: 'ingestor',
    event_type: 'write_success',
    message: 'wrote 21 records · 4 with hi-pri signal',
  },
];

const RANKER_SEEDS: AgentLogSeed[] = [
  {
    agent_name: 'ranker',
    event_type: 'model_route',
    message: 'multi-model route · gpt-oss-20b for triage · 1.4s',
    latency_ms: 1400,
    model_used: 'gpt-oss-20b',
  },
  {
    agent_name: 'ranker',
    event_type: 'model_route',
    message: 'multi-model route · claude-sonnet for rationale · 2.4s',
    latency_ms: 2400,
    model_used: 'claude-sonnet',
  },
  {
    agent_name: 'ranker',
    event_type: 'rationale_generate',
    message: 'rationale generated · 4 evidence anchors · score 91',
    latency_ms: 2400,
    model_used: 'claude-sonnet',
  },
  {
    agent_name: 'ranker',
    event_type: 'score_assign',
    message: 'PRJ-9F2A11 · score 91 · branch HOU · high-priority',
  },
];

export async function POST() {
  const admin = supabaseAdmin();
  const now = new Date();
  const startedAt = new Date(now.getTime() - 2_500).toISOString();
  const completedAt = now.toISOString();

  // 1. agent_runs row for ingestor (closed cycle).
  const ingestorRunPayload = {
    agent_name: 'ingestor' as const,
    started_at: startedAt,
    completed_at: completedAt,
    records_processed: 21,
    records_new: 4,
    status: 'success' as const,
    error_message: null,
  };
  const ingestorRun = await (
    admin.from('agent_runs') as unknown as {
      insert: (rows: typeof ingestorRunPayload) => Promise<{ error: { message: string } | null }>;
    }
  ).insert(ingestorRunPayload);
  if (ingestorRun.error) {
    return NextResponse.json({ error: ingestorRun.error.message }, { status: 500 });
  }

  // 2. agent_runs row for ranker (closed cycle).
  const rankerRunPayload = {
    agent_name: 'ranker' as const,
    started_at: new Date(now.getTime() - 1_200).toISOString(),
    completed_at: completedAt,
    records_processed: 4,
    records_new: 0,
    status: 'success' as const,
    error_message: null,
  };
  const rankerRun = await (
    admin.from('agent_runs') as unknown as {
      insert: (rows: typeof rankerRunPayload) => Promise<{ error: { message: string } | null }>;
    }
  ).insert(rankerRunPayload);
  if (rankerRun.error) {
    return NextResponse.json({ error: rankerRun.error.message }, { status: 500 });
  }

  // 3. Stagger agent_log rows so the activity rail animates a visible cascade
  // instead of dumping 10 lines at once. Each ingestor row gets a fresh
  // timestamp ~250ms apart, then ranker rows.
  const allSeeds: AgentLogSeed[] = [...INGESTOR_SEEDS, ...RANKER_SEEDS];
  const baseMs = now.getTime() - allSeeds.length * 250;
  const logRows: AgentRun extends never ? never : Array<{
    agent_name: AgentLogRow['agent_name'];
    event_type: string;
    event_data: Record<string, unknown>;
    latency_ms: number | null;
    model_used: string | null;
    ts: string;
  }> = allSeeds.map((seed, i) => ({
    agent_name: seed.agent_name,
    event_type: seed.event_type,
    event_data: { message: seed.message, source: 'manual_refresh' },
    latency_ms: seed.latency_ms ?? null,
    model_used: seed.model_used ?? null,
    ts: new Date(baseMs + i * 250).toISOString(),
  }));

  const logInsert = await (
    admin.from('agent_log') as unknown as {
      insert: (rows: typeof logRows) => Promise<{ error: { message: string } | null }>;
    }
  ).insert(logRows);
  if (logInsert.error) {
    return NextResponse.json({ error: logInsert.error.message }, { status: 500 });
  }

  // 4. Touch one high-scoring project's `ranked_at` so realtime subscribers see
  // an UPDATE — fires the score count-up animation without changing the score.
  const { data: target } = await (
    admin.from('projects') as unknown as {
      select: (cols: string) => {
        order: (col: string, opts: { ascending: boolean; nullsFirst: boolean }) => {
          limit: (n: number) => Promise<{ data: { id: string; score: number | null }[] | null }>;
        };
      };
    }
  )
    .select('id, score')
    .order('score', { ascending: false, nullsFirst: false })
    .limit(1);

  if (target && target.length > 0) {
    const targetId = target[0].id;
    const update = { ranked_at: completedAt };
    await (
      admin.from('projects') as unknown as {
        update: (v: typeof update) => { eq: (col: string, val: string) => Promise<unknown> };
      }
    )
      .update(update)
      .eq('id', targetId);
  }

  return NextResponse.json({
    ingestor: { events: INGESTOR_SEEDS.length, records_new: 4 },
    ranker: { events: RANKER_SEEDS.length },
    triggered_at: completedAt,
  });
}
