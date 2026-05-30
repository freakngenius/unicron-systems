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
import { ZEDCOR_HOUSTON_HUB_SOURCE_SLUGS } from '@/lib/adapters/sources';
import {
  writeProjectToNotion,
  updateProjectPitchOnNotion,
  updateProjectEnrichmentInNotion,
  findExistingProjectInNotion,
  shouldWriteToZedcorNotion,
} from '@/lib/notion/zedcor-writer';
import type { NotionPhase, NotionState } from '@/lib/notion/types';
// Z17 — gc-extractor used inline by the in-run backfill wave to enrich
// pre-existing un-pitched construction rows that the original orchestrator
// run never reached.
import { extractGcMetadata } from '@/lib/adapters/zedcor/gc-extractor';
import { runSource, type RunSourceResult } from './run-source';
import { tagPhaseWithConfidence } from './tag-phase';
import { scoreZedcorProject } from './zedcor-scorer';
// Sprint Z3.5 — additive enrichment step (gc_metadata + Notion enrichment cols).
import { enrichEligibleProjects } from './enrich-zedcor';
import type { GcMetadata } from '@/lib/adapters/zedcor/gc-extractor';
// Sprint Z7 — additive contact resolution wave (Hunter / Apollo / pattern).
// Runs after Z3.5 enrichment and before Wave 3 Notion writes so any
// contact info we resolve flows into the existing Notion-writes path.
import { resolveExternalContact } from '@/lib/adapters/zedcor/external-contact-resolver';
import {
  HOUSTON_HUB_SLUG,
  ORCHESTRATOR_AGENT_NAME,
  ZEDCOR_ORG_ID,
} from './constants';
// Sprint Z4 imports — additive. Pitch generation runs as the final
// orchestrator wave (after Notion writes), gated by env. Never modifies
// pre-Z4 behavior.
import { resolveCrossPollination } from '@/lib/adapters/zedcor/cross-pollination';
import { generatePitchHooks } from '@/lib/adapters/zedcor/pitch-generator';
import { assembleRecommendedAction } from '@/lib/adapters/zedcor/recommended-action';
import { inferTypeTags } from '@/lib/adapters/zedcor/type-tag-inferrer';

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
  // Sprint Z3.5 — enrichment stats. Optional so the existing run-status
  // UI tolerates summaries from runs predating this column.
  enrichment_attempted?: number;
  enrichment_succeeded?: number;
  enrichment_failed?: number;
  // Z17 — per-stage counts so the spec's "single-run completeness"
  // acceptance criterion can be read off run_metadata directly. All
  // optional for back-compat with pre-Z17 summaries.
  scored?: number;
  gc_resolved?: number;
  contact_resolved?: number;
  hooks_generated?: number;
  notion_withheld?: number;
  backfill_attempted?: number;
  backfill_scored?: number;
  backfill_gc_resolved?: number;
  backfill_hooks_generated?: number;
  backfill_notion_writes?: number;
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
  summary: string | null;
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
  // Z17 — needed by the Notion-write gate (isReadyForNotion) so we can
  // withhold rows that are still missing pitch hooks / recommended action
  // and skip rows whose enrichment has already been persisted.
  gc_metadata: Record<string, unknown> | null;
  pitch_metadata: Record<string, unknown> | null;
  external_refs: Record<string, unknown> | null;
}

async function loadRunProjects(runId: number): Promise<ProjectRow[]> {
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => { eq: (col: string, val: number) => Promise<{ data: ProjectRow[] | null }> };
    };
  };
  const { data } = await admin
    .from('projects')
    .select('id, source, source_id, title, summary, posted_date, response_deadline, source_url, rationale, score, raw_payload, project_stage, buy_window_open, source_authority, gc_metadata, pitch_metadata, external_refs')
    .eq('agent_run_id', runId);
  return data ?? [];
}

// Z17 — Notion-write gate. The Lead Feed must only receive enriched rows,
// never bare shells. A row is ready when:
//   1. shouldWriteToZedcorNotion() says yes (Z12 expanded eligibility)
//   2. score is present (the deterministic Wave 2 ran successfully)
//   3. for in-window rows (buy_window_open=true), the pitch wave also
//      produced pitch_hooks + recommended_action.
// Pre-window construction rows (Z12 expansion) only need score; pitch is
// not generated for them so requiring it would withhold them forever.
function isReadyForNotion(p: Pick<ProjectRow,
  'title' | 'summary' | 'source_authority' | 'project_stage' | 'buy_window_open' | 'score' | 'pitch_metadata'>): boolean {
  if (!shouldWriteToZedcorNotion({
    title: p.title,
    source_authority: p.source_authority,
    project_stage: p.project_stage,
    buy_window_open: p.buy_window_open,
    summary: p.summary ?? null,
  })) return false;
  if (p.score === null || p.score === undefined) return false;
  if (p.buy_window_open === true) {
    const pm = p.pitch_metadata as { pitch_hooks?: unknown; recommended_action?: unknown } | null;
    const hooks = pm?.pitch_hooks;
    const action = pm?.recommended_action;
    if (!Array.isArray(hooks) || hooks.length === 0) return false;
    if (!action || typeof action !== 'string' || !action.trim()) return false;
  }
  return true;
}

async function updateProjectScore(id: string, score: number | null, rationale: string): Promise<void> {
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  // Z17 root-cause fix — pathfinder.projects has no `ranked_by` column. The
  // pre-Z17 update silently failed on every call (Supabase returned
  // {error:'column "ranked_by" of relation "projects" does not exist'} and
  // the result was never inspected), so every manual-orchestrator row landed
  // with score=null + rationale=null and the Notion writer downstream stamped
  // '(scoring disabled)' on the Rationale property. Drop the bogus column and
  // surface any future write error to the caller.
  const { error } = await admin.from('projects').update({
    score,
    rationale,
    ranked_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error(`updateProjectScore ${id} failed: ${error.message}`);
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
  const total = ZEDCOR_HOUSTON_HUB_SOURCE_SLUGS.length;
  let completed = 0;
  let runningProjectCount = 0;
  const sourceResults: RunSourceResult[] = await Promise.all(
    ZEDCOR_HOUSTON_HUB_SOURCE_SLUGS.map(async (slug) => {
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
  // Phase property in Wave 4 below; it no longer overwrites project_stage.
  const projects = await loadRunProjects(runId);
  let scoredCount = 0;
  let scoreFailures = 0;
  for (const p of projects) {
    try {
      const { score, rationale } = scoreZedcorProject({
        response_deadline: p.response_deadline,
        estimated_value: (p.raw_payload?.estimated_value as number | null) ?? null,
        county: (p.raw_payload?.county as string | null) ?? null,
        agency: (p.raw_payload?.agency as string | null) ?? null,
      });
      await updateProjectScore(p.id, score, rationale);
      if (score !== null) scoredCount += 1;
    } catch (err) {
      scoreFailures += 1;
      await logEvent({
        agent_name: ORCHESTRATOR_AGENT_NAME,
        event_type: 'score_failed',
        event_data: { run_id: runId, project_id: p.id, error: (err as Error).message.slice(0, 500) },
        organization_id: ZEDCOR_ORG_ID,
        runner: 'manual',
        ts: new Date().toISOString(),
        run_id: runId,
      });
    }
  }
  await logEvent({
    agent_name: ORCHESTRATOR_AGENT_NAME,
    event_type: 'score_wave_complete',
    event_data: { run_id: runId, scored: scoredCount, failed: scoreFailures, total: projects.length },
    organization_id: ZEDCOR_ORG_ID,
    runner: 'manual',
    ts: new Date().toISOString(),
    run_id: runId,
  });

  // Sprint Z3.5 Wave 2.5 — Detail-page enrichment (GC + contact extraction).
  // Strictly additive; logs progress; on any failure the run continues and
  // the project is written to Notion without GC fields. Spec §"No halts".
  let enrichmentResult: { attempted: number; succeeded: number; failed: number; enrichedById: Map<string, GcMetadata> } = {
    attempted: 0, succeeded: 0, failed: 0, enrichedById: new Map<string, GcMetadata>(),
  };
  try {
    enrichmentResult = await enrichEligibleProjects(runId);
    await logEvent({
      agent_name: ORCHESTRATOR_AGENT_NAME,
      event_type: 'enrichment_complete',
      event_data: {
        run_id: runId,
        attempted: enrichmentResult.attempted,
        succeeded: enrichmentResult.succeeded,
        failed: enrichmentResult.failed,
      },
      organization_id: ZEDCOR_ORG_ID,
      runner: 'manual',
      ts: new Date().toISOString(),
      run_id: runId,
    });
  } catch (err) {
    await logEvent({
      agent_name: ORCHESTRATOR_AGENT_NAME,
      event_type: 'enrichment_failed',
      event_data: { run_id: runId, error: (err as Error).message.slice(0, 500) },
      organization_id: ZEDCOR_ORG_ID,
      runner: 'manual',
      ts: new Date().toISOString(),
      run_id: runId,
    });
  }

  // Sprint Z7 Wave 2.6 — External contact resolution. Strictly additive;
  // mutates enrichmentResult.enrichedById in place so Wave 3 Notion writes
  // pick up the new contact fields without re-querying. On any failure
  // the run continues and the project is written to Notion with whatever
  // contact data Z3.5 had (spec §"No halts").
  let contactResolutionSummary = { attempted: 0, succeeded: 0, failed: 0, by_layer: { 1: 0, 2: 0, 3: 0, cache: 0 } };
  try {
    contactResolutionSummary = await runZedcorZ7ContactResolutionWave(
      runId,
      enrichmentResult.enrichedById,
    );
    await logEvent({
      agent_name: ORCHESTRATOR_AGENT_NAME,
      event_type: 'zedcor_z7_contact_resolution_complete',
      event_data: { run_id: runId, ...contactResolutionSummary },
      organization_id: ZEDCOR_ORG_ID,
      runner: 'manual',
      ts: new Date().toISOString(),
      run_id: runId,
    });
  } catch (err) {
    await logEvent({
      agent_name: ORCHESTRATOR_AGENT_NAME,
      event_type: 'zedcor_z7_contact_resolution_failed',
      event_data: { run_id: runId, error: (err as Error).message.slice(0, 500) },
      organization_id: ZEDCOR_ORG_ID,
      runner: 'manual',
      ts: new Date().toISOString(),
      run_id: runId,
    });
  }

  // Z17 — Wave 3: pitch generation BEFORE Notion writes so the Notion
  // writer can gate in-window rows on hooks + recommended_action being
  // present. Previously the pitch wave ran AFTER Wave 3 Notion writes,
  // which meant the first Notion landing for any in-window row was a
  // bare shell (no hooks, no recommended action) — exactly the bug the
  // spec is closing. Pitch wave's own Notion-update path still runs
  // best-effort for rows whose page already exists (re-triggers); for
  // fresh rows Wave 4 below creates the page and immediately updates it
  // with pitch_metadata.
  const pitchResult = await runZedcorZ4PitchWave(runId).catch(async (err) => {
    await logEvent({
      agent_name: ORCHESTRATOR_AGENT_NAME,
      event_type: 'zedcor_z4_pitch_wave_failed',
      event_data: { run_id: runId, error: (err as Error).message.slice(0, 500) },
      organization_id: ZEDCOR_ORG_ID,
      runner: 'manual',
      ts: new Date().toISOString(),
      run_id: runId,
    });
    return { eligible: 0, generated: 0, failures: 0, skipped: 0 };
  });

  // Z17 — Wave 4: Notion writes (sequential, light rate-limit), gated by
  // isReadyForNotion(). Rows missing a score (Wave 2 silently failed
  // pre-Z17) or, for in-window rows, missing pitch_hooks +
  // recommended_action are withheld so the Lead Feed never receives a
  // bare shell. Re-running the trigger picks up withheld rows once the
  // missing stage produces output.
  let notionWrites = 0;
  let notionDedupes = 0;
  let notionWithheld = 0;
  const refreshed = await loadRunProjects(runId);
  for (const p of refreshed) {
    if (!isReadyForNotion(p)) {
      notionWithheld += 1;
      await logEvent({
        agent_name: ORCHESTRATOR_AGENT_NAME,
        event_type: 'notion_withheld',
        event_data: {
          run_id: runId,
          project_id: p.id,
          buy_window_open: p.buy_window_open,
          has_score: p.score !== null,
          has_pitch_hooks: Array.isArray((p.pitch_metadata as { pitch_hooks?: unknown } | null)?.pitch_hooks),
        },
        organization_id: ZEDCOR_ORG_ID,
        runner: 'manual',
        ts: new Date().toISOString(),
        run_id: runId,
      });
      continue;
    }
    try {
      const enrichment = enrichmentResult.enrichedById.get(p.id) ?? null;
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
      }, enrichment);
      if (res.alreadyExists) notionDedupes += 1;
      else notionWrites += 1;
      await updateProjectExternalRefs(p.id, {
        notion_lead_id: res.leadId,
        notion_page_url: res.notionPageUrl,
        notion_written_at: new Date().toISOString(),
      });
      // Z17 — if pitch_metadata carries hooks, immediately mirror them
      // onto the (just-created or pre-existing) Notion page so the Lead
      // Feed row reaches the rep with hooks + recommended action in a
      // single trigger.
      const pm = p.pitch_metadata as {
        pitch_hooks?: unknown;
        recommended_action?: string | null;
        action_by_date?: string | null;
        cross_pollination?: string | null;
        warm_intro_path?: string | null;
      } | null;
      if (pm && Array.isArray(pm.pitch_hooks) && pm.pitch_hooks.length > 0 && res.notionPageId) {
        try {
          await updateProjectPitchOnNotion({
            pageId: res.notionPageId,
            pitch: {
              cross_pollination: pm.cross_pollination ?? null,
              warm_intro_path: pm.warm_intro_path ?? null,
              pitch_hooks: pm.pitch_hooks as string[],
              recommended_action: pm.recommended_action ?? null,
              action_by_date: pm.action_by_date ?? null,
            },
          });
        } catch (notionPitchErr) {
          await logEvent({
            agent_name: ORCHESTRATOR_AGENT_NAME,
            event_type: 'notion_pitch_update_failed',
            event_data: { run_id: runId, project_id: p.id, error: (notionPitchErr as Error).message.slice(0, 500) },
            organization_id: ZEDCOR_ORG_ID,
            runner: 'manual',
            ts: new Date().toISOString(),
            run_id: runId,
          });
        }
      }
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

  // Z17 — Wave 5: in-run backfill of pre-existing un-enriched
  // construction-relevant rows. Without this, every prior run's bare
  // shells would stay bare forever (the pitch wave only scoops rows
  // from THIS run via agent_run_id). Capped per-run to keep the
  // function inside Vercel's wall budget; re-triggers chip away until
  // the in-window construction set approaches 100% enriched per spec.
  const backfillResult = await runZedcorZ17Backfill(runId).catch(async (err) => {
    await logEvent({
      agent_name: ORCHESTRATOR_AGENT_NAME,
      event_type: 'zedcor_z17_backfill_failed',
      event_data: { run_id: runId, error: (err as Error).message.slice(0, 500) },
      organization_id: ZEDCOR_ORG_ID,
      runner: 'manual',
      ts: new Date().toISOString(),
      run_id: runId,
    });
    return { attempted: 0, scored: 0, gc_resolved: 0, hooks_generated: 0, notion_writes: 0, notion_dedupes: 0, failures: 0 };
  });

  // Emit a final step_progress=100 so the UI's percent_complete settles.
  await logEvent({
    agent_name: ORCHESTRATOR_AGENT_NAME,
    event_type: 'step_progress',
    event_data: {
      step_label: 'Pipeline complete',
      percent: 100,
      run_id: runId,
      pitch: pitchResult,
      backfill: backfillResult,
      notion_withheld: notionWithheld,
    },
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
    status: sources_failed === ZEDCOR_HOUSTON_HUB_SOURCE_SLUGS.length ? 'failed' : sources_failed > 0 ? 'partial_failure' : 'success',
    sources_polled: ZEDCOR_HOUSTON_HUB_SOURCE_SLUGS.length,
    sources_hit,
    sources_empty,
    sources_failed,
    projects_inserted,
    projects_deduped,
    notion_writes: notionWrites,
    notion_dedupes: notionDedupes,
    enrichment_attempted: enrichmentResult.attempted,
    enrichment_succeeded: enrichmentResult.succeeded,
    enrichment_failed: enrichmentResult.failed,
    // Z17 — per-stage counts so the spec's "single-run completeness"
    // acceptance criterion is readable straight off run_metadata.
    scored: scoredCount,
    gc_resolved: enrichmentResult.succeeded,
    contact_resolved: contactResolutionSummary.succeeded,
    hooks_generated: pitchResult.generated,
    notion_withheld: notionWithheld,
    backfill_attempted: backfillResult.attempted,
    backfill_scored: backfillResult.scored,
    backfill_gc_resolved: backfillResult.gc_resolved,
    backfill_hooks_generated: backfillResult.hooks_generated,
    backfill_notion_writes: backfillResult.notion_writes,
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

// ─────────────────────────────────────────────────────────────────────────
// Sprint Z4 — Wave 4: pitch metadata generation.
//
// Runs as the final wave of runZedcorOrchestrator (after Notion writes).
// Additive — never reads or modifies projects outside its filter.
//
// Filter: project_stage IN ('awarded','gc_selected','sub_bid','mobilization')
//         OR buy_window_open=true. Cap DEFAULT_PITCH_CAP_PER_RUN per run.
//
// Degrades gracefully when Z3.5's gc_metadata is missing — generates
// generic hooks from title + agency only and skips cross-pollination.
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_PITCH_CAP_PER_RUN = 200;

interface PitchWaveSummary {
  eligible: number;
  generated: number;
  failures: number;
  skipped: number;
}

interface PitchProjectRow {
  id: string;
  source: string;
  source_id: string;
  title: string;
  summary: string | null;
  project_value: number | null;
  project_stage: string | null;
  posted_date: string | null;
  raw_payload: Record<string, unknown> | null;
  buy_window_open: boolean | null;
  external_refs: Record<string, unknown> | null;
  gc_metadata: Record<string, unknown> | null;
  pitch_metadata: Record<string, unknown> | null;
}

function isPitchEnabled(): boolean {
  // Z17 — drop the legacy ZEDCOR_DISABLE_ANTHROPIC kill-switch. Per spec
  // (§"Hard rules"): no paid-key dependence for core stages (score / phase
  // / pitch). Score + phase are deterministic; pitch genuinely needs the
  // platform's core LLM, so it requires ANTHROPIC_API_KEY but is no longer
  // gated by the cost-control flag that was used to silence the whole
  // chain. ZEDCOR_DISABLE_PITCH stays for the targeted demo kill-switch.
  if (process.env.ZEDCOR_DISABLE_PITCH === 'true') return false;
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function pitchCap(): number {
  const raw = process.env.ZEDCOR_PITCH_CAP_PER_RUN;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_PITCH_CAP_PER_RUN;
}

async function loadPitchEligibleProjects(runId: number, cap: number): Promise<PitchProjectRow[]> {
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: number | string | boolean) => {
          or: (filter: string) => {
            limit: (n: number) => Promise<{ data: PitchProjectRow[] | null; error: { message: string } | null }>;
          };
        };
      };
    };
  };
  const stageList = "project_stage.in.(awarded,gc_selected,sub_bid,mobilization)";
  const buyWindow = "buy_window_open.is.true";
  // Use SELECT * so missing optional columns (gc_metadata if Z3.5 hasn't
  // merged yet, pitch_metadata before its migration applies) don't fail the
  // query. Row shape includes only the keys the row actually carries; reads
  // below treat absent keys as null.
  const { data, error } = await admin
    .from('projects')
    .select('*')
    .eq('agent_run_id', runId)
    .or(`${stageList},${buyWindow}`)
    .limit(cap);
  if (error) throw new Error(`load pitch-eligible projects failed: ${error.message}`);
  return data ?? [];
}

async function writeProjectPitchMetadata(id: string, metadata: Record<string, unknown>): Promise<void> {
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  const { error } = await admin
    .from('projects')
    .update({ pitch_metadata: metadata })
    .eq('id', id);
  if (error) throw new Error(`write pitch_metadata failed: ${error.message}`);
}

export async function runZedcorZ4PitchWave(runId: number): Promise<PitchWaveSummary> {
  const summary: PitchWaveSummary = { eligible: 0, generated: 0, failures: 0, skipped: 0 };
  if (!isPitchEnabled()) {
    await logEvent({
      agent_name: ORCHESTRATOR_AGENT_NAME,
      event_type: 'zedcor_z4_pitch_wave_skipped',
      event_data: { run_id: runId, reason: 'pitch disabled or ANTHROPIC_API_KEY missing' },
      organization_id: ZEDCOR_ORG_ID,
      runner: 'manual',
      ts: new Date().toISOString(),
      run_id: runId,
    });
    return summary;
  }

  const cap = pitchCap();
  const eligible = await loadPitchEligibleProjects(runId, cap);
  summary.eligible = eligible.length;
  if (eligible.length === 0) return summary;

  const supabase = supabaseAdmin() as unknown as Parameters<typeof resolveCrossPollination>[0]['supabase'];

  await logEvent({
    agent_name: ORCHESTRATOR_AGENT_NAME,
    event_type: 'zedcor_z4_pitch_wave_started',
    event_data: { run_id: runId, eligible: eligible.length, cap },
    organization_id: ZEDCOR_ORG_ID,
    runner: 'manual',
    ts: new Date().toISOString(),
    run_id: runId,
  });

  for (const p of eligible) {
    try {
      const gcMeta = (p.gc_metadata ?? {}) as Record<string, unknown>;
      const gcName = (gcMeta.gc_name as string | null | undefined) ?? null;
      const gcContactName = (gcMeta.gc_contact_name as string | null | undefined) ?? null;
      const gcContactRole = (gcMeta.gc_contact_role as string | null | undefined) ?? null;
      const gcContactPhone = (gcMeta.gc_contact_phone as string | null | undefined) ?? null;
      const subBidDeadline = (gcMeta.sub_bid_deadline as string | null | undefined) ?? null;
      const gcAwardDate = (gcMeta.gc_award_date as string | null | undefined) ?? null;

      const agency = (p.raw_payload?.agency as string | null) ?? null;
      const city = (p.raw_payload?.city as string | null) ?? null;
      const county = (p.raw_payload?.county as string | null) ?? null;
      const state = (p.raw_payload?.state as string | null) ?? null;

      const typeTags = inferTypeTags({ title: p.title, summary: p.summary });

      // Cross-pollination (skip when gc_name absent — spec: degrade gracefully).
      // Sprint Z12 — pass project title + summary so the engine can apply the
      // construction-relevance gate before fuzzy-matching against
      // zedcor_customer_sites (filters out federal product-contract noise).
      const cp = gcName
        ? await resolveCrossPollination({
            gcName,
            supabase,
            projectTitle: p.title,
            projectSummary: p.summary,
          })
        : { cross_pollination: null, warm_intro_path: null, matched_customer: null, confidence: 0, possible_cross_pollination: [] };

      // Pitch hooks via Sonnet.
      const pitchResult = await generatePitchHooks({
        title: p.title,
        agency,
        summary: p.summary,
        project_value: p.project_value,
        city,
        county,
        state,
        project_stage: p.project_stage,
        posted_date: p.posted_date,
        gc_name: gcName,
        inferred_type_tags: typeTags,
      }, { agentRunId: runId });

      // Recommended action.
      const action = assembleRecommendedAction({
        title: p.title,
        gc_name: gcName,
        gc_contact_name: gcContactName,
        gc_contact_role: gcContactRole,
        gc_contact_phone: gcContactPhone,
        cross_pollination: cp.cross_pollination,
        hooks: pitchResult.hooks,
        sub_bid_deadline: subBidDeadline,
        gc_award_date: gcAwardDate,
        posted_date: p.posted_date,
      });

      const metadata = {
        cross_pollination: cp.cross_pollination,
        warm_intro_path: cp.warm_intro_path,
        matched_customer: cp.matched_customer,
        match_confidence: cp.confidence,
        possible_cross_pollination: cp.possible_cross_pollination,
        pitch_hooks: [pitchResult.hooks.hook_1, pitchResult.hooks.hook_2, pitchResult.hooks.hook_3],
        pitch_model: pitchResult.model,
        recommended_action: action.recommended_action,
        action_by_date: action.action_by_date,
        type_tags: typeTags,
        degraded: pitchResult.degraded,
        generated_at: pitchResult.generated_at,
      };

      await writeProjectPitchMetadata(p.id, metadata);

      // Update Notion if we have a page url stashed in external_refs.
      const notionPageId = (p.external_refs?.notion_page_id as string | null | undefined)
        ?? extractNotionPageIdFromUrl(p.external_refs?.notion_page_url as string | null | undefined);
      if (notionPageId) {
        try {
          await updateProjectPitchOnNotion({
            pageId: notionPageId,
            pitch: {
              cross_pollination: cp.cross_pollination,
              warm_intro_path: cp.warm_intro_path,
              pitch_hooks: [pitchResult.hooks.hook_1, pitchResult.hooks.hook_2, pitchResult.hooks.hook_3],
              recommended_action: action.recommended_action,
              action_by_date: action.action_by_date,
            },
          });
          await new Promise((r) => setTimeout(r, 350));
        } catch (notionErr) {
          await logEvent({
            agent_name: ORCHESTRATOR_AGENT_NAME,
            event_type: 'zedcor_z4_notion_pitch_update_failed',
            event_data: { run_id: runId, project_id: p.id, error: (notionErr as Error).message.slice(0, 500) },
            organization_id: ZEDCOR_ORG_ID,
            runner: 'manual',
            ts: new Date().toISOString(),
            run_id: runId,
          });
        }
      } else {
        summary.skipped += 1;
      }

      summary.generated += 1;
    } catch (err) {
      summary.failures += 1;
      await logEvent({
        agent_name: ORCHESTRATOR_AGENT_NAME,
        event_type: 'zedcor_z4_pitch_generation_failed',
        event_data: { run_id: runId, project_id: p.id, error: (err as Error).message.slice(0, 500) },
        organization_id: ZEDCOR_ORG_ID,
        runner: 'manual',
        ts: new Date().toISOString(),
        run_id: runId,
      });
    }
  }

  await logEvent({
    agent_name: ORCHESTRATOR_AGENT_NAME,
    event_type: 'zedcor_z4_pitch_wave_complete',
    event_data: { run_id: runId, ...summary },
    organization_id: ZEDCOR_ORG_ID,
    runner: 'manual',
    ts: new Date().toISOString(),
    run_id: runId,
  });

  return summary;
}

function extractNotionPageIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  // Notion page URLs end with '...-<32hexid>'. Extract the trailing id.
  const match = url.match(/([0-9a-f]{32})(?:[?#]|$)/i);
  if (!match) return null;
  const id = match[1];
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20, 32)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Sprint Z7 — Wave 2.6: external contact resolution.
//
// Inputs: runId + the in-memory enrichedById Map produced by Z3.5 in
// this run. We iterate the map, skip rows that already have a contact
// email, and run the three-layer resolver (Hunter → Apollo → pattern).
// On a hit we merge the resolved fields into the GcMetadata object in
// the map (which Wave 3's Notion writer reads) and persist the merge
// to pathfinder.projects.gc_metadata so cross-run reads see it too.
//
// Soft cap: DEFAULT_CONTACT_RESOLUTION_CAP_PER_RUN, overridable via
// ZEDCOR_CONTACT_CAP. Each layer skips gracefully when its env key is
// absent or its monthly quota is at 80%.
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_CONTACT_RESOLUTION_CAP_PER_RUN = 100;

export interface ContactResolutionSummary {
  attempted: number;
  succeeded: number;
  failed: number;
  by_layer: { 1: number; 2: number; 3: number; cache: number };
}

function contactCap(): number {
  const raw = process.env.ZEDCOR_CONTACT_CAP;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_CONTACT_RESOLUTION_CAP_PER_RUN;
}

async function persistContactMerge(
  projectId: string,
  current: GcMetadata,
  patch: Partial<GcMetadata> & { contact_resolution_layer?: number | 'cache' | null },
): Promise<void> {
  const merged: Record<string, unknown> = { ...current, ...patch };
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  const { error } = await admin.from('projects').update({ gc_metadata: merged }).eq('id', projectId);
  if (error) throw new Error(`persist contact merge failed: ${error.message}`);
}

export async function runZedcorZ7ContactResolutionWave(
  runId: number,
  enrichedById: Map<string, GcMetadata>,
): Promise<ContactResolutionSummary> {
  const summary: ContactResolutionSummary = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    by_layer: { 1: 0, 2: 0, 3: 0, cache: 0 },
  };

  const cap = contactCap();
  let processed = 0;

  for (const [projectId, meta] of enrichedById.entries()) {
    if (processed >= cap) break;
    if (!meta.gc_name) continue;
    if (meta.gc_contact_email) continue;
    processed += 1;
    summary.attempted += 1;

    try {
      const resolved = await resolveExternalContact(meta.gc_name, { runId, projectId });
      if (!resolved.contact_email) continue;

      const layerKey =
        resolved.source === 'cache'
          ? 'cache'
          : ((resolved.layer ?? 0) as 1 | 2 | 3);
      if (layerKey === 'cache' || layerKey === 1 || layerKey === 2 || layerKey === 3) {
        summary.by_layer[layerKey] += 1;
      }

      const patch: Partial<GcMetadata> & { contact_resolution_layer?: number | 'cache' | null } = {
        gc_contact_name: meta.gc_contact_name ?? resolved.contact_name,
        gc_contact_role: meta.gc_contact_role ?? resolved.contact_role,
        gc_contact_email: resolved.contact_email,
        gc_contact_phone: meta.gc_contact_phone ?? resolved.contact_phone,
        contact_resolution_layer:
          resolved.source === 'cache' ? 'cache' : resolved.layer,
      };

      Object.assign(meta, patch);
      await persistContactMerge(projectId, meta, patch);
      summary.succeeded += 1;
    } catch (err) {
      summary.failed += 1;
      await logEvent({
        agent_name: ORCHESTRATOR_AGENT_NAME,
        event_type: 'zedcor_z7_contact_resolution_project_failed',
        event_data: { run_id: runId, project_id: projectId, error: (err as Error).message.slice(0, 500) },
        organization_id: ZEDCOR_ORG_ID,
        runner: 'manual',
        ts: new Date().toISOString(),
        run_id: runId,
      });
    }
  }

  return summary;
}

// ─────────────────────────────────────────────────────────────────────────
// Z17 — Wave 5: in-run backfill of pre-existing un-enriched
// construction-relevant rows.
//
// Without this wave, every prior run's bare shells would stay bare
// forever — the regular pitch + enrichment waves only scoop rows
// matching agent_run_id=runId, so historical rows missed by Wave 2's
// silent-write bug never recover. Wave 5 loads existing construction
// rows that are still missing score or pitch hooks, runs them through
// the same kernel (score → GC → pitch → Notion-gated), and chips away
// at the backlog. Capped per-run via ZEDCOR_Z17_BACKFILL_CAP so the
// orchestrator fits inside the Vercel function wall budget.
//
// Federal sam.gov / usaspending rows are excluded — per spec these are
// post-award reporting noise, not construction-relevant leads.
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_BACKFILL_CAP_PER_RUN = 30;

const FEDERAL_NOISE_SOURCES: ReadonlySet<string> = new Set(['sam.gov', 'usaspending']);
const Z17_PITCH_ELIGIBLE_STAGES: ReadonlySet<string> = new Set([
  'awarded', 'gc_selected', 'sub_bid', 'mobilization',
]);

interface BackfillSummary {
  attempted: number;
  scored: number;
  gc_resolved: number;
  hooks_generated: number;
  notion_writes: number;
  notion_dedupes: number;
  failures: number;
}

function backfillCap(): number {
  const raw = process.env.ZEDCOR_Z17_BACKFILL_CAP;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_BACKFILL_CAP_PER_RUN;
}

function isPitchEligibleRow(p: Pick<ProjectRow, 'project_stage' | 'buy_window_open'>): boolean {
  if (p.buy_window_open === true) return true;
  return Z17_PITCH_ELIGIBLE_STAGES.has((p.project_stage ?? '').toLowerCase());
}

function backfillNeedsWork(p: ProjectRow): boolean {
  if (p.score === null || p.score === undefined) return true;
  if (isPitchEligibleRow(p)) {
    const pm = p.pitch_metadata as { pitch_hooks?: unknown; recommended_action?: unknown } | null;
    if (!pm) return true;
    if (!Array.isArray(pm.pitch_hooks) || pm.pitch_hooks.length === 0) return true;
    if (!pm.recommended_action || typeof pm.recommended_action !== 'string' || !pm.recommended_action.trim()) return true;
  }
  return false;
}

async function loadBackfillCandidates(cap: number): Promise<ProjectRow[]> {
  // Load construction-relevant rows (organization=Zedcor, source not in
  // federal-noise sources) ordered by in-window first, then most recent
  // posted_date. Overscan by 4× cap so we can JS-filter for the precise
  // backfill-needed predicate without paying for a per-row roundtrip.
  const admin = supabaseAdmin();
  const fetchCap = Math.max(cap * 4, 80);
  const federalCsv = Array.from(FEDERAL_NOISE_SOURCES).join(',');
  const res = await (admin.from('projects') as unknown as {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        not: (col: string, op: string, val: string) => {
          order: (col: string, opts: { ascending: boolean; nullsFirst: boolean }) => {
            order: (col2: string, opts2: { ascending: boolean; nullsFirst: boolean }) => {
              limit: (n: number) => Promise<{ data: ProjectRow[] | null; error: { message: string } | null }>;
            };
          };
        };
      };
    };
  })
    .select('id, source, source_id, title, summary, posted_date, response_deadline, source_url, rationale, score, raw_payload, project_stage, buy_window_open, source_authority, gc_metadata, pitch_metadata, external_refs')
    .eq('organization_id', ZEDCOR_ORG_ID)
    .not('source', 'in', `(${federalCsv})`)
    .order('buy_window_open', { ascending: false, nullsFirst: false })
    .order('posted_date', { ascending: false, nullsFirst: false })
    .limit(fetchCap);
  if (res.error) throw new Error(`backfill candidate load failed: ${res.error.message}`);
  const all = res.data ?? [];
  return all.filter(backfillNeedsWork).slice(0, cap);
}

async function persistGcMetadataDirect(projectId: string, meta: GcMetadata): Promise<void> {
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  const { error } = await admin.from('projects')
    .update({ gc_metadata: meta as unknown as Record<string, unknown> })
    .eq('id', projectId);
  if (error) throw new Error(`backfill persist gc_metadata failed: ${error.message}`);
}

export async function runZedcorZ17Backfill(runId: number): Promise<BackfillSummary> {
  const summary: BackfillSummary = {
    attempted: 0, scored: 0, gc_resolved: 0, hooks_generated: 0,
    notion_writes: 0, notion_dedupes: 0, failures: 0,
  };

  const cap = backfillCap();
  const candidates = await loadBackfillCandidates(cap);

  await logEvent({
    agent_name: ORCHESTRATOR_AGENT_NAME,
    event_type: 'zedcor_z17_backfill_started',
    event_data: { run_id: runId, candidates: candidates.length, cap },
    organization_id: ZEDCOR_ORG_ID,
    runner: 'manual', ts: new Date().toISOString(), run_id: runId,
  });

  if (candidates.length === 0) return summary;

  const supabase = supabaseAdmin() as unknown as Parameters<typeof resolveCrossPollination>[0]['supabase'];
  const pitchEnabled = isPitchEnabled();

  for (const p of candidates) {
    summary.attempted += 1;
    try {
      // (a) Score — deterministic.
      if (p.score === null || p.score === undefined) {
        const { score, rationale } = scoreZedcorProject({
          response_deadline: p.response_deadline,
          estimated_value: (p.raw_payload?.estimated_value as number | null) ?? null,
          county: (p.raw_payload?.county as string | null) ?? null,
          agency: (p.raw_payload?.agency as string | null) ?? null,
        });
        await updateProjectScore(p.id, score, rationale);
        if (score !== null) {
          p.score = score;
          p.rationale = rationale;
          summary.scored += 1;
        }
      }

      // (b) GC enrich — only when missing a real GC name.
      let gcMeta: GcMetadata | null = (p.gc_metadata as GcMetadata | null) ?? null;
      const hasGcName = gcMeta && typeof gcMeta.gc_name === 'string' && gcMeta.gc_name.length > 0;
      if (!hasGcName) {
        try {
          gcMeta = await extractGcMetadata({ source_url: p.source_url, title: p.title });
          await persistGcMetadataDirect(p.id, gcMeta);
          if (gcMeta.gc_name) summary.gc_resolved += 1;
          p.gc_metadata = gcMeta as unknown as Record<string, unknown>;
        } catch (gcErr) {
          await logEvent({
            agent_name: ORCHESTRATOR_AGENT_NAME,
            event_type: 'zedcor_z17_backfill_gc_failed',
            event_data: { run_id: runId, project_id: p.id, error: (gcErr as Error).message.slice(0, 500) },
            organization_id: ZEDCOR_ORG_ID,
            runner: 'manual', ts: new Date().toISOString(), run_id: runId,
          });
        }
      }

      // (c) Pitch — only for pitch-eligible rows with the LLM key present.
      if (pitchEnabled && isPitchEligibleRow(p)) {
        const meta = (gcMeta ?? {}) as GcMetadata;
        const gcName = meta.gc_name ?? null;
        const typeTags = inferTypeTags({ title: p.title, summary: p.summary });
        const cp = gcName
          ? await resolveCrossPollination({
              gcName, supabase,
              projectTitle: p.title, projectSummary: p.summary,
            })
          : { cross_pollination: null, warm_intro_path: null, matched_customer: null, confidence: 0, possible_cross_pollination: [] };
        const pr = await generatePitchHooks({
          title: p.title,
          agency: (p.raw_payload?.agency as string | null) ?? null,
          summary: p.summary,
          project_value: (p.raw_payload?.estimated_value as number | null) ?? null,
          city: (p.raw_payload?.city as string | null) ?? null,
          county: (p.raw_payload?.county as string | null) ?? null,
          state: (p.raw_payload?.state as string | null) ?? null,
          project_stage: p.project_stage,
          posted_date: p.posted_date,
          gc_name: gcName,
          inferred_type_tags: typeTags,
        }, { agentRunId: runId });
        const action = assembleRecommendedAction({
          title: p.title,
          gc_name: gcName,
          gc_contact_name: meta.gc_contact_name ?? null,
          gc_contact_role: meta.gc_contact_role ?? null,
          gc_contact_phone: meta.gc_contact_phone ?? null,
          cross_pollination: cp.cross_pollination,
          hooks: pr.hooks,
          sub_bid_deadline: meta.sub_bid_deadline ?? null,
          gc_award_date: meta.gc_award_date ?? null,
          posted_date: p.posted_date,
        });
        const pitchMetadata = {
          cross_pollination: cp.cross_pollination,
          warm_intro_path: cp.warm_intro_path,
          matched_customer: cp.matched_customer,
          match_confidence: cp.confidence,
          possible_cross_pollination: cp.possible_cross_pollination,
          pitch_hooks: [pr.hooks.hook_1, pr.hooks.hook_2, pr.hooks.hook_3],
          pitch_model: pr.model,
          recommended_action: action.recommended_action,
          action_by_date: action.action_by_date,
          type_tags: typeTags,
          degraded: pr.degraded,
          generated_at: pr.generated_at,
        };
        await writeProjectPitchMetadata(p.id, pitchMetadata);
        p.pitch_metadata = pitchMetadata as unknown as Record<string, unknown>;
        summary.hooks_generated += 1;
      }

      // (d) Notion — gated by isReadyForNotion. The Lead Feed receives the
      // row only when the row is enriched per spec; otherwise the next
      // trigger picks it up.
      if (!isReadyForNotion(p)) {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }

      const res = await writeProjectToNotion({
        source: p.source, source_id: p.source_id, title: p.title,
        posted_date: p.posted_date, response_deadline: p.response_deadline,
        source_url: p.source_url, rationale: p.rationale, score: p.score,
        phase: (tagPhaseWithConfidence({ response_deadline: p.response_deadline, posted_date: p.posted_date }).phase as NotionPhase),
        agency: (p.raw_payload?.agency as string | null) ?? null,
        city: (p.raw_payload?.city as string | null) ?? null,
        county: (p.raw_payload?.county as string | null) ?? null,
        state: (p.raw_payload?.state as NotionState | string | null) ?? null,
        estimated_value: (p.raw_payload?.estimated_value as number | null) ?? null,
        project_stage: p.project_stage,
        buy_window_open: p.buy_window_open,
        source_authority: p.source_authority,
      }, (gcMeta ?? null) as unknown as Parameters<typeof writeProjectToNotion>[1]);

      if (res.alreadyExists) summary.notion_dedupes += 1;
      else summary.notion_writes += 1;

      await updateProjectExternalRefs(p.id, {
        notion_lead_id: res.leadId,
        notion_page_url: res.notionPageUrl,
        notion_written_at: new Date().toISOString(),
      });

      // For existing pages, refresh enrichment columns (writeProjectToNotion
      // only writes them on create).
      if (res.alreadyExists && gcMeta && res.notionPageId) {
        try {
          await updateProjectEnrichmentInNotion(res.notionPageId, gcMeta as unknown as Parameters<typeof updateProjectEnrichmentInNotion>[1]);
        } catch { /* best-effort */ }
      }

      const pm = p.pitch_metadata as {
        pitch_hooks?: unknown;
        recommended_action?: string | null;
        action_by_date?: string | null;
        cross_pollination?: string | null;
        warm_intro_path?: string | null;
      } | null;
      if (pm && Array.isArray(pm.pitch_hooks) && pm.pitch_hooks.length > 0 && res.notionPageId) {
        try {
          await updateProjectPitchOnNotion({
            pageId: res.notionPageId,
            pitch: {
              cross_pollination: pm.cross_pollination ?? null,
              warm_intro_path: pm.warm_intro_path ?? null,
              pitch_hooks: pm.pitch_hooks as string[],
              recommended_action: pm.recommended_action ?? null,
              action_by_date: pm.action_by_date ?? null,
            },
          });
        } catch { /* best-effort */ }
      }

      await new Promise((r) => setTimeout(r, 250));
    } catch (err) {
      summary.failures += 1;
      await logEvent({
        agent_name: ORCHESTRATOR_AGENT_NAME,
        event_type: 'zedcor_z17_backfill_project_failed',
        event_data: { run_id: runId, project_id: p.id, error: (err as Error).message.slice(0, 500) },
        organization_id: ZEDCOR_ORG_ID,
        runner: 'manual', ts: new Date().toISOString(), run_id: runId,
      });
    }
  }

  await logEvent({
    agent_name: ORCHESTRATOR_AGENT_NAME,
    event_type: 'zedcor_z17_backfill_complete',
    event_data: { run_id: runId, ...summary },
    organization_id: ZEDCOR_ORG_ID,
    runner: 'manual', ts: new Date().toISOString(), run_id: runId,
  });

  return summary;
}
