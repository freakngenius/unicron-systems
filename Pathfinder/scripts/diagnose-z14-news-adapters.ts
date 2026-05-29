// scripts/diagnose-z14-news-adapters.ts
//
// Sprint Z14.2 — standalone diagnostic harness for the four Z14 news adapters.
//
// Default mode: poll each adapter against its live URL, print verbatim summary
// (HTTP behavior via the adapter's own fetch path, parsed item count, sample
// items). No Supabase writes.
//
// Insert mode (--insert): opens a real pathfinder.agent_runs row for the
// Zedcor org, then calls runSource() per slug — same code path the
// orchestrator's Wave 1 takes — so rows land in pathfinder.projects,
// last_event_at on data_sources bumps, and agent_log records source_hit /
// project_inserted events. Mirrors Run Zedcor's per-source slice.
//
// Run with:
//   pnpm tsx scripts/diagnose-z14-news-adapters.ts
//   pnpm tsx scripts/diagnose-z14-news-adapters.ts --insert
//
// Env: when --insert is passed, NEXT_PUBLIC_SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY must be available. Sonnet GC extractor skips
// gracefully when ANTHROPIC_API_KEY is absent.

import { newsEngineeringRecordAdapter } from '../lib/adapters/sources/news-engineering-record';
import { houstonBusinessJournalAdapter } from '../lib/adapters/sources/houston-business-journal';
import { demandstarTexasAdapter } from '../lib/adapters/sources/demandstar-texas';
import { buildersExchangeTexasAdapter } from '../lib/adapters/sources/builders-exchange-texas';
import type { SourceAdapter, SourceEvent } from '../lib/adapters/sources/types';

const ADAPTERS: Array<{ slug: string; adapter: SourceAdapter }> = [
  { slug: 'news-engineering-record', adapter: newsEngineeringRecordAdapter },
  { slug: 'houston-business-journal', adapter: houstonBusinessJournalAdapter },
  { slug: 'demandstar-texas', adapter: demandstarTexasAdapter },
  { slug: 'builders-exchange-texas', adapter: buildersExchangeTexasAdapter },
];

const STUB_OPTS = {
  organizationId: '6cd87740-7c72-4337-ac79-316a54242eef',
  organizationSlug: 'zedcor',
  architecture: { sources: [], scoring: { weights: {} } } as unknown as never,
  runId: -1,
  hubId: 'houston',
};

function summarize(ev: SourceEvent): string {
  const url = (ev.raw_payload?.source_url as string | undefined) ?? '?';
  const state = (ev.raw_payload?.state as string | undefined) ?? '?';
  const stage = (ev.raw_payload?.project_stage as string | undefined) ?? '?';
  return `  • [${state}/${stage}] ${ev.title.slice(0, 110)}\n    ${url.slice(0, 130)}`;
}

async function pollOnly(): Promise<void> {
  for (const { slug, adapter } of ADAPTERS) {
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
    for (const ev of events.slice(0, 5)) console.log(summarize(ev));
    if (events.length > 5) console.log(`  …+${events.length - 5} more`);
  }
}

async function runAgainstSupabase(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('--insert requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
  }
  const { supabaseAdmin } = await import('../lib/supabase');
  const { runSource } = await import('../lib/orchestrator/run-source');

  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => Promise<{ data: Array<{ id: number }> | null; error: { message: string } | null }>;
      };
    };
  };
  const startedAt = new Date().toISOString();
  const { data, error } = await admin
    .from('agent_runs')
    .insert({
      agent_name: 'zedcor-orchestrator-manual',
      runner: 'manual',
      organization_id: STUB_OPTS.organizationId,
      hub_id: STUB_OPTS.hubId,
      started_at: startedAt,
      status: 'running',
      records_processed: 0,
      records_new: 0,
      run_metadata: { source: 'diagnose-z14-news-adapters.ts', sprint: 'Z14.2' },
    })
    .select('id');
  if (error || !data?.[0]) throw new Error(`open agent_run failed: ${error?.message ?? 'no row'}`);
  const runId = data[0].id;
  console.log(`opened agent_run id=${runId} at ${startedAt}`);

  for (const { slug } of ADAPTERS) {
    const t0 = Date.now();
    const result = await runSource(slug, runId);
    const ms = Date.now() - t0;
    console.log(`\n=== ${slug} (run_id=${runId}) ===`);
    console.log(`  ms=${ms}  status=${result.status}`);
    console.log(`  candidates_found=${result.candidates_found}  projects_inserted=${result.projects_inserted}  dedup_skips=${result.dedup_skips}  geofence_skips=${result.geofence_skips}  invalid_skips=${result.invalid_skips}`);
    if (result.errors.length) console.log(`  errors: ${result.errors.slice(0, 3).join(' | ')}`);
    if (result.inserted_ids.length) {
      console.log(`  sample inserted_ids:`);
      for (const id of result.inserted_ids.slice(0, 3)) console.log(`    ${id}`);
    }
  }

  // Close the run.
  const updater = admin as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => { eq: (col: string, val: number) => Promise<{ error: unknown }> };
    };
  };
  await updater.from('agent_runs').update({
    completed_at: new Date().toISOString(),
    status: 'success',
  }).eq('id', runId);
  console.log(`\nclosed agent_run id=${runId}`);
}

(async () => {
  const insert = process.argv.includes('--insert');
  if (insert) await runAgainstSupabase();
  else await pollOnly();
})();
