// app/api/zedcor/run-status/route.ts
//
// Sprint Z1A — GET endpoint Z1B's UI polls during a run to render
// "Polling 4 of 10: METRO Houston Procurement..." progress.
// ?run_id=N optional — defaults to latest Zedcor orchestrator run.

import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { ZEDCOR_Z1A_SOURCE_SLUGS } from '@/lib/adapters/sources';
import { ORCHESTRATOR_AGENT_NAME, ZEDCOR_ORG_ID } from '@/lib/orchestrator/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AgentRunRow {
  id: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  records_new: number | null;
  run_metadata: Record<string, unknown> | null;
}

interface AgentLogRow {
  event_type: string;
  event_data: Record<string, unknown>;
  ts: string;
}

const SLUG_TO_LABEL: Record<string, string> = {
  'houston-obo': 'City of Houston OBO',
  'houston-public-works': 'Houston Public Works',
  'harris-county-bonfire': 'Harris County (Bonfire)',
  'houston-metro': 'METRO Houston Procurement',
  'port-houston': 'Port of Houston',
  'fort-bend-county': 'Fort Bend County Purchasing',
  'galveston-county': 'Galveston County',
  'brazoria-county': 'Brazoria County Purchasing',
  'hisd-ionwave': 'Houston ISD (IonWave)',
  'txdot-houston-district': 'TxDOT Houston District',
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const runIdParam = url.searchParams.get('run_id');
  const admin = supabaseAdmin();

  let runId: number | null = runIdParam ? Number(runIdParam) : null;
  if (!runId || !Number.isFinite(runId)) {
    const { data } = await (admin as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              order: (col: string, opts: { ascending: boolean }) => {
                limit: (n: number) => Promise<{ data: AgentRunRow[] | null }>;
              };
            };
          };
        };
      };
    })
      .from('agent_runs')
      .select('id, status, started_at, completed_at, records_new, run_metadata')
      .eq('organization_id', ZEDCOR_ORG_ID)
      .eq('agent_name', ORCHESTRATOR_AGENT_NAME)
      .order('started_at', { ascending: false })
      .limit(1);
    runId = data?.[0]?.id ?? null;
  }

  if (!runId) {
    return NextResponse.json({ status: 'no_runs' }, { status: 200 });
  }

  // Load the run row + source_hit events.
  const { data: runRows } = await (admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => { eq: (col: string, val: number) => Promise<{ data: AgentRunRow[] | null }> };
    };
  })
    .from('agent_runs')
    .select('id, status, started_at, completed_at, records_new, run_metadata')
    .eq('id', runId);
  const run = runRows?.[0];
  if (!run) return NextResponse.json({ status: 'not_found', run_id: runId }, { status: 404 });

  const { data: logRows } = await (admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          contains: (col: string, val: unknown) => Promise<{ data: AgentLogRow[] | null }>;
        };
      };
    };
  })
    .from('agent_log')
    .select('event_type, event_data, ts')
    .eq('agent_name', ORCHESTRATOR_AGENT_NAME)
    .contains('event_data', { run_id: runId });

  const slugsSeen = new Set<string>();
  let projectsInsertedSoFar = 0;
  let lastSlug: string | null = null;
  let lastTs = 0;
  for (const row of logRows ?? []) {
    const slug = (row.event_data as { source_slug?: string } | null)?.source_slug ?? null;
    const ts = new Date(row.ts).getTime();
    if (row.event_type === 'source_hit' || row.event_type === 'source_empty' || row.event_type === 'source_failed') {
      if (slug) slugsSeen.add(slug);
      if (ts > lastTs && slug) { lastTs = ts; lastSlug = slug; }
    }
    if (row.event_type === 'project_inserted') projectsInsertedSoFar += 1;
  }

  const sourcesDone = slugsSeen.size;
  const sourcesTotal = ZEDCOR_Z1A_SOURCE_SLUGS.length;
  const currentLabel = lastSlug ? (SLUG_TO_LABEL[lastSlug] ?? lastSlug) : null;
  const progressLabel = currentLabel
    ? `Polling ${Math.min(sourcesDone + 1, sourcesTotal)} of ${sourcesTotal}: ${currentLabel}`
    : `Starting (${sourcesTotal} sources queued)`;

  return NextResponse.json({
    run_id: runId,
    status: run.status,
    started_at: run.started_at,
    completed_at: run.completed_at,
    sources_total: sourcesTotal,
    sources_done: sourcesDone,
    current_source: lastSlug,
    progress_label: progressLabel,
    projects_inserted_so_far: projectsInsertedSoFar,
    summary: run.run_metadata,
  }, { status: 200 });
}
