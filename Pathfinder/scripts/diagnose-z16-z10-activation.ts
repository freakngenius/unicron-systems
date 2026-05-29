// scripts/diagnose-z16-z10-activation.ts
//
// Sprint Z16 — verify Phase 1 (activate the 20 Z10 multi-metro adapters
// already shipped in lib/adapters/sources/ but until now unwired in
// ZEDCOR_HOUSTON_HUB_SOURCE_SLUGS). Mirrors scripts/diagnose-z14-news-adapters.ts.
//
// Default mode: poll each adapter against its live URL; print parsed item
// count + a few samples. No Supabase writes.
//
// --insert mode: opens a pathfinder.agent_runs row and calls runSource()
// per slug — same code path the orchestrator's Wave 1 takes — so rows land
// in pathfinder.projects, last_polled_at / last_event_at bump on
// data_sources, and agent_log records source_hit / project_inserted events.
//
// Critically: this script does NOT call runZedcorOrchestrator. The full
// orchestrator's Wave 3 triggers the Notion writer, which Z16 spec
// explicitly forbids this sprint (demo feed is frozen — coverage proven via
// SQL counts, not the Lead Feed).
//
// Run with:
//   pnpm tsx scripts/diagnose-z16-z10-activation.ts
//   pnpm tsx scripts/diagnose-z16-z10-activation.ts --insert
//
// Env: --insert requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

import {
  ZEDCOR_Z10_SOURCE_SLUGS,
  SOURCE_ADAPTERS,
} from '../lib/adapters/sources';
import type { SourceEvent } from '../lib/adapters/sources/types';

const ZEDCOR_ORG_ID = '6cd87740-7c72-4337-ac79-316a54242eef';
const HOUSTON_HUB = 'houston';

const STUB_OPTS = {
  organizationId: ZEDCOR_ORG_ID,
  organizationSlug: 'zedcor',
  architecture: { sources: [], scoring: { weights: {} } } as unknown as never,
  runId: -1,
  hubId: HOUSTON_HUB,
};

function summarize(ev: SourceEvent): string {
  const url = (ev.raw_payload?.source_url as string | undefined) ?? '?';
  const state = (ev.raw_payload?.state as string | undefined) ?? '?';
  const stage = (ev.raw_payload?.project_stage as string | undefined) ?? '?';
  return `  • [${state}/${stage}] ${ev.title.slice(0, 110)}\n    ${url.slice(0, 130)}`;
}

async function pollOnly(): Promise<void> {
  console.log(`Polling ${ZEDCOR_Z10_SOURCE_SLUGS.length} Z10 slugs (no Supabase writes)\n`);
  for (const slug of ZEDCOR_Z10_SOURCE_SLUGS) {
    const adapter = SOURCE_ADAPTERS[slug];
    if (!adapter) {
      console.log(`\n=== ${slug} ===`);
      console.log(`  ERROR: adapter not registered in SOURCE_ADAPTERS`);
      continue;
    }
    const t0 = Date.now();
    let events: SourceEvent[] = [];
    let threw: string | null = null;
    try {
      events = await adapter.poll(STUB_OPTS);
    } catch (err) {
      threw = err instanceof Error ? err.message : String(err);
    }
    const ms = Date.now() - t0;
    console.log(`\n=== ${slug} ===`);
    console.log(`  fetched_in_ms=${ms}  threw=${threw ?? 'no'}  events=${events.length}`);
    for (const ev of events.slice(0, 3)) console.log(summarize(ev));
    if (events.length > 3) console.log(`  …+${events.length - 3} more`);
  }
}

interface SlugResult {
  slug: string;
  status: string;
  candidates: number;
  inserted: number;
  dedup_skips: number;
  geofence_skips: number;
  invalid_skips: number;
  errors: string[];
  inserted_ids: string[];
}

async function runAgainstSupabase(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      '--insert requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    );
  }
  const { supabaseAdmin } = await import('../lib/supabase');
  const { runSource } = await import('../lib/orchestrator/run-source');

  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => Promise<{
          data: Array<{ id: number }> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  const startedAt = new Date().toISOString();
  const { data, error } = await admin
    .from('agent_runs')
    .insert({
      agent_name: 'zedcor-orchestrator-manual',
      runner: 'manual',
      organization_id: ZEDCOR_ORG_ID,
      hub_id: HOUSTON_HUB,
      started_at: startedAt,
      status: 'running',
      records_processed: 0,
      records_new: 0,
      run_metadata: {
        script: 'diagnose-z16-z10-activation.ts',
        sprint: 'Z16',
        phase: 1,
      },
    })
    .select('id');
  if (error || !data?.[0]) {
    throw new Error(`open agent_run failed: ${error?.message ?? 'no row'}`);
  }
  const runId = data[0].id;
  console.log(`opened agent_run id=${runId} at ${startedAt}`);

  const results: SlugResult[] = [];
  for (const slug of ZEDCOR_Z10_SOURCE_SLUGS) {
    const t0 = Date.now();
    const result = await runSource(slug, runId);
    const ms = Date.now() - t0;
    console.log(`\n=== ${slug} (run_id=${runId}) ===`);
    console.log(`  ms=${ms}  status=${result.status}`);
    console.log(
      `  candidates_found=${result.candidates_found}  projects_inserted=${result.projects_inserted}  dedup_skips=${result.dedup_skips}  geofence_skips=${result.geofence_skips}  invalid_skips=${result.invalid_skips}`,
    );
    if (result.errors.length) {
      console.log(`  errors: ${result.errors.slice(0, 3).join(' | ')}`);
    }
    if (result.inserted_ids.length) {
      console.log(`  sample inserted_ids:`);
      for (const id of result.inserted_ids.slice(0, 3)) console.log(`    ${id}`);
    }
    results.push({
      slug,
      status: result.status,
      candidates: result.candidates_found,
      inserted: result.projects_inserted,
      dedup_skips: result.dedup_skips,
      geofence_skips: result.geofence_skips,
      invalid_skips: result.invalid_skips,
      errors: result.errors.slice(0, 3),
      inserted_ids: result.inserted_ids.slice(0, 5),
    });
  }

  const producers = results.filter((r) => r.inserted > 0);
  const successZeroAfterDedup = results.filter(
    (r) => r.status === 'success' && r.inserted === 0 && r.dedup_skips > 0,
  );
  const empties = results.filter(
    (r) => r.status === 'empty' || (r.status === 'success' && r.candidates === 0),
  );
  const failed = results.filter((r) => r.status === 'failed');

  console.log(`\n=== TALLY ===`);
  console.log(`  producers (≥1 NEW row inserted): ${producers.length}`);
  producers.forEach((r) => console.log(`    ${r.slug}: +${r.inserted} rows`));
  console.log(`  candidates-found-but-all-dedup (already in projects): ${successZeroAfterDedup.length}`);
  successZeroAfterDedup.forEach((r) =>
    console.log(`    ${r.slug}: ${r.candidates} candidates, ${r.dedup_skips} dedup`),
  );
  console.log(`  empty (no candidates from upstream): ${empties.length}`);
  empties.forEach((r) => console.log(`    ${r.slug}`));
  console.log(`  failed: ${failed.length}`);
  failed.forEach((r) => console.log(`    ${r.slug}: ${r.errors.join(' | ')}`));

  const summary = {
    sprint: 'Z16',
    phase: 1,
    script: 'diagnose-z16-z10-activation.ts',
    slugs_polled: ZEDCOR_Z10_SOURCE_SLUGS.length,
    producers: producers.length,
    producer_slugs: producers.map((r) => r.slug),
    dedup_only: successZeroAfterDedup.map((r) => r.slug),
    empty_slugs: empties.map((r) => r.slug),
    failed_slugs: failed.map((r) => r.slug),
    results,
  };

  const status =
    failed.length === ZEDCOR_Z10_SOURCE_SLUGS.length
      ? 'failed'
      : failed.length > 0
        ? 'partial_failure'
        : 'success';

  await (
    admin as unknown as {
      from: (t: string) => {
        update: (row: Record<string, unknown>) => {
          eq: (col: string, val: number) => Promise<{ error: unknown }>;
        };
      };
    }
  )
    .from('agent_runs')
    .update({
      completed_at: new Date().toISOString(),
      status,
      run_metadata: summary,
    })
    .eq('id', runId);

  console.log(`\nclosed agent_run id=${runId} (status=${status})`);
  console.log(`\nTotal producers: ${producers.length} (floor for Z16 is 4)`);
}

(async () => {
  const insert = process.argv.includes('--insert');
  if (insert) await runAgainstSupabase();
  else await pollOnly();
})().catch((err) => {
  console.error('diagnose-z16 failed:', err);
  process.exit(1);
});
