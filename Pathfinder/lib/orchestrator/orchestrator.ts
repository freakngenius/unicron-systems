// lib/orchestrator/orchestrator.ts
//
// Sprint Z1A — Zedcor Houston manual orchestrator. End-to-end runner for
// POST /pathfinder/api/zedcor/run-orchestrator.
//
// Flow:
//   1. Open pathfinder.agent_runs row (status='running')
//   2. Fan out the 10 source adapters in parallel via runSource()
//   3. Tag phases via lib/orchestrator/tag-phase.ts
//   4. Score projects via lib/orchestrator/zedcor-scorer.ts (skipped when
//      ZEDCOR_DISABLE_ANTHROPIC=true → score=null, rationale='(scoring disabled)')
//   5. Write each new project to Notion via lib/notion/zedcor-writer.ts;
//      stash {notion_lead_id, notion_page_url} into projects.external_refs
//   6. Close the agent_runs row (success / partial_failure)
//
// Spec: Specs/SPEC-zedcor-tier1-manual.md §"Orchestrator endpoint contract".

import { supabaseAdmin } from '@/lib/supabase';
import { ZEDCOR_Z1A_SOURCE_SLUGS } from '@/lib/adapters/sources';
import { writeProjectToNotion } from '@/lib/notion/zedcor-writer';
import type { NotionPhase, NotionState } from '@/lib/notion/types';
import { runSource, type RunSourceResult } from './run-source';
import { tagPhaseWithConfidence } from './tag-phase';
import { scoreZedcorProject } from './zedcor-scorer';
import {
  HOUSTON_HUB_SLUG,
  ORCHESTRATOR_AGENT_NAME,
  ZEDCOR_ORG_ID,
} from './constants';

export interface RunSummary {
  run_id: number;
  started_at: string;
  completed_at: string;
  status: 'success' | 'partial_failure' | 'failed';
  sources_polled: number;
  sources_hit: number;
  sources_empty: number;
  sources_failed: number;
  projects_inserted: number;
  projects_deduped: number;
  notion_writes: number;
  notion_dedupes: number;
  errors: Array<{ source_slug: string; message: string }>;
}

interface AgentLogInsert {
  agent_name: string;
  event_type: string;
  event_data: Record<string, unknown>;
  organization_id: string;
  runner: string;
  ts: string;
  run_id: number | null;
}

async function logEvent(event: AgentLogInsert): Promise<void> {
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => { insert: (row: AgentLogInsert) => Promise<{ error: unknown }> };
  };
  await admin.from('agent_log').insert(event);
}

const SLUG_TO_LABEL: Record<string, string> = {
  'houston-obo': 'City of Houston OBO',
  'houston-public-works': 'Houston Public Works',
  'harris-county-bonfire': 'Harris County (Bonfire)',
  'houston-metro': 'METRO Houston',
  'port-houston': 'Port of Houston',
  'fort-bend-county': 'Fort Bend County',
  'galveston-county': 'Galveston County',
  'brazoria-county': 'Brazoria County',
  'hisd-ionwave': 'Houston ISD (IonWave)',
  'txdot-houston-district': 'TxDOT Houston District',
};

async function emitStepProgress(
  runId: number,
  sourcesCompleted: number,
  sourcesTotal: number,
  lastSlug: string,
  projectsSoFar: number,
): Promise<void> {
  const label = `Polled ${sourcesCompleted} of ${sourcesTotal} (last: ${SLUG_TO_LABEL[lastSlug] ?? lastSlug}) · ${projectsSoFar} projects so far`;
  const percent = Math.min(95, Math.floor((sourcesCompleted / sourcesTotal) * 90));
  await logEvent({
    agent_name: ORCHESTRATOR_AGENT_NAME,
    event_type: 'step_progress',
    event_data: { step_label: label, percent, run_id: runId, sources_completed: sourcesCompleted, sources_total: sourcesTotal },
    organization_id: ZEDCOR_ORG_ID,
    runner: 'manual',
    ts: new Date().toISOString(),
    run_id: runId,
  });
}

async function openAgentRun(): Promise<number> {
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => Promise<{ data: Array<{ id: number }> | null; error: { message: string } | null }>;
      };
    };
  };
  const { data, error } = await admin.from('agent_runs').insert({
    agent_name: ORCHESTRATOR_AGENT_NAME,
    runner: 'manual',
    organization_id: ZEDCOR_ORG_ID,
    hub_id: HOUSTON_HUB_SLUG,
    started_at: new Date().toISOString(),
    status: 'running',
    records_processed: 0,
    records_new: 0,
  }).select('id');
  if (error || !data?.[0]) throw new Error(`open agent_run failed: ${error?.message ?? 'no row'}`);
  return data[0].id;
}

async function closeAgentRun(runId: number, summary: RunSummary): Promise<void> {
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => { eq: (col: string, val: number) => Promise<{ error: unknown }> };
    };
  };
  await admin.from('agent_runs').update({
    completed_at: summary.completed_at,
    status: summary.status,
    records_processed: summary.projects_inserted + summary.projects_deduped,
    records_new: summary.projects_inserted,
    run_metadata: summary as unknown as Record<string, unknown>,
  }).eq('id', runId);
}

interface ProjectRow {
  id: string;
  source: string;
  source_id: string;
  title: string;
  posted_date: string | null;
  response_deadline: string | null;
  source_url: string | null;
  rationale: string | null;
  score: number | null;
  raw_payload: Record<string, unknown> | null;
  // Sprint Z3 — Bid Stage / Buy Window / Source Type signals for Notion writer.
  project_stage: string | null;
  buy_window_open: boolean | null;
  source_authority: string | null;
}

async function loadRunProjects(runId: number): Promise<ProjectRow[]> {
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => { eq: (col: string, val: number) => Promise<{ data: ProjectRow[] | null }> };
    };
  };
  const { data } = await admin
    .from('projects')
    .select('id, source, source_id, title, posted_date, response_deadline, source_url, rationale, score, raw_payload, project_stage, buy_window_open, source_authority')
    .eq('agent_run_id', runId);
  return data ?? [];
}

async function updateProjectScore(id: string, score: number | null, rationale: string): Promise<void> {
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: unknown }> };
    };
  };
  await admin.from('projects').update({
    score,
    rationale,
    ranked_at: new Date().toISOString(),
    ranked_by: 'zedcor-z1a-deterministic',
  }).eq('id', id);
}

async function updateProjectExternalRefs(id: string, refs: Record<string, unknown>): Promise<void> {
  const admin = supabaseAdmin() as unknown as {
    rpc?: (name: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          single: () => Promise<{ data: { external_refs: Record<string, unknown> | null } | null }>;
        };
      };
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: unknown }>;
      };
    };
  };
  const { data } = await admin.from('projects').select('external_refs').eq('id', id).single();
  const existing = (data?.external_refs as Record<string, unknown> | null) ?? {};
  await admin.from('projects').update({ external_refs: { ...existing, ...refs } }).eq('id', id);
}

export async function runZedcorOrchestrator(): Promise<RunSummary> {
  const startedAt = new Date().toISOString();
  const runId = await openAgentRun();

  // Wave 1 — adapters in parallel (each bounded by per-adapter fetch timeout).
  // Wrap each adapter so a step_progress event fires as it completes — Z1B's
  // UI polls run-status and reads the latest step_label/percent from these.
  const total = ZEDCOR_Z1A_SOURCE_SLUGS.length;
  let completed = 0;
  let runningProjectCount = 0;
  const sourceResults: RunSourceResult[] = await Promise.all(
    ZEDCOR_Z1A_SOURCE_SLUGS.map(async (slug) => {
      const result = await runSource(slug, runId);
      completed += 1;
      runningProjectCount += result.projects_inserted;
      await emitStepProgress(runId, completed, total, slug, runningProjectCount);
      return result;
    }),
  );

  // Wave 2 — load all inserted projects, score them.
  // Sprint Z3 — bid-lifecycle project_stage is now set by the adapter +
  // run-source.ts (from raw_payload, with detail-page enrichment). The
  // legacy date-based tag-phase is preserved ONLY for Notion's date-based
  // Phase property in Wave 3 below; it no longer overwrites project_stage.
  const projects = await loadRunProjects(runId);
  for (const p of projects) {
    const { score, rationale } = scoreZedcorProject({
      response_deadline: p.response_deadline,
      estimated_value: (p.raw_payload?.estimated_value as number | null) ?? null,
      county: (p.raw_payload?.county as string | null) ?? null,
      agency: (p.raw_payload?.agency as string | null) ?? null,
    });
    await updateProjectScore(p.id, score, rationale);
  }

  // Wave 3 — Notion writes (sequential, light rate-limit).
  let notionWrites = 0;
  let notionDedupes = 0;
  const refreshed = await loadRunProjects(runId);
  for (const p of refreshed) {
    try {
      const res = await writeProjectToNotion({
        source: p.source,
        source_id: p.source_id,
        title: p.title,
        posted_date: p.posted_date,
        response_deadline: p.response_deadline,
        source_url: p.source_url,
        rationale: p.rationale,
        score: p.score,
        // Existing date-based Phase property (kept for back-compat).
        phase: (tagPhaseWithConfidence({
          response_deadline: p.response_deadline,
          posted_date: p.posted_date,
        }).phase as NotionPhase),
        agency: (p.raw_payload?.agency as string | null) ?? null,
        city: (p.raw_payload?.city as string | null) ?? null,
        county: (p.raw_payload?.county as string | null) ?? null,
        state: (p.raw_payload?.state as NotionState | string | null) ?? null,
        estimated_value: (p.raw_payload?.estimated_value as number | null) ?? null,
        // Sprint Z3 — bid-lifecycle Bid Stage + Buy Window + Source Type.
        project_stage: p.project_stage,
        buy_window_open: p.buy_window_open,
        source_authority: p.source_authority,
      });
      if (res.alreadyExists) notionDedupes += 1;
      else notionWrites += 1;
      await updateProjectExternalRefs(p.id, {
        notion_lead_id: res.leadId,
        notion_page_url: res.notionPageUrl,
        notion_written_at: new Date().toISOString(),
      });
      // Polite delay against Notion rate-limit (~3 req/s burst).
      await new Promise((r) => setTimeout(r, 350));
    } catch (err) {
      await logEvent({
        agent_name: ORCHESTRATOR_AGENT_NAME,
        event_type: 'notion_write_failed',
        event_data: { run_id: runId, project_id: p.id, error: (err as Error).message.slice(0, 500) },
        organization_id: ZEDCOR_ORG_ID,
        runner: 'manual',
        ts: new Date().toISOString(),
        run_id: runId,
      });
    }
  }

  // Emit a final step_progress=100 so the UI's percent_complete settles.
  await logEvent({
    agent_name: ORCHESTRATOR_AGENT_NAME,
    event_type: 'step_progress',
    event_data: { step_label: 'Writing to Notion complete', percent: 100, run_id: runId },
    organization_id: ZEDCOR_ORG_ID,
    runner: 'manual',
    ts: new Date().toISOString(),
    run_id: runId,
  });

  // Aggregate summary.
  const completedAt = new Date().toISOString();
  const sources_hit = sourceResults.filter((r) => r.status === 'success' && r.candidates_found > 0).length;
  const sources_empty = sourceResults.filter((r) => r.status === 'empty' || (r.status === 'success' && r.candidates_found === 0)).length;
  const sources_failed = sourceResults.filter((r) => r.status === 'failed').length;
  const projects_inserted = sourceResults.reduce((acc, r) => acc + r.projects_inserted, 0);
  const projects_deduped = sourceResults.reduce((acc, r) => acc + r.dedup_skips, 0);
  const errors = sourceResults.flatMap((r) => r.errors.map((m) => ({ source_slug: r.source_slug, message: m })));

  const summary: RunSummary = {
    run_id: runId,
    started_at: startedAt,
    completed_at: completedAt,
    status: sources_failed === ZEDCOR_Z1A_SOURCE_SLUGS.length ? 'failed' : sources_failed > 0 ? 'partial_failure' : 'success',
    sources_polled: ZEDCOR_Z1A_SOURCE_SLUGS.length,
    sources_hit,
    sources_empty,
    sources_failed,
    projects_inserted,
    projects_deduped,
    notion_writes: notionWrites,
    notion_dedupes: notionDedupes,
    errors,
  };

  await closeAgentRun(runId, summary);
  // Z1B's run-status endpoint reads the summary from the
  // `orchestrator_run_summary` event_type — emit it as the canonical
  // terminal event for this run.
  await logEvent({
    agent_name: ORCHESTRATOR_AGENT_NAME,
    event_type: 'orchestrator_run_summary',
    event_data: summary as unknown as Record<string, unknown>,
    organization_id: ZEDCOR_ORG_ID,
    runner: 'manual',
    ts: new Date().toISOString(),
    run_id: runId,
  });

  return summary;
}
