// scripts/run-internal-ingest-locally.ts
//
// Internal onboarding Stage 5 — local E2E runner.
//
// Mirrors scripts/run-funder-ingest-locally.ts. Runs the Internal source
// adapters end-to-end against the Internal org row (slug 'internal',
// Pathfinder organization #4) without needing Inngest cloud dispatch:
//   1. load org architecture
//   2. iterate architecture.sources
//   3. call SOURCE_ADAPTERS[id].poll() for each
//   4. apply qualifyForInternal
//   5. dedupe + insert into pathfinder.projects scoped by organization_id
//   6. write an agent_runs row capturing per-source counts.
//
// Idempotent: projects.id = source_event_id, so re-runs skip existing rows.

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env.production.local' });

import { createClient } from '@supabase/supabase-js';
import { resolveArchitecture } from '@/lib/config/resolveArchitecture';
import { SOURCE_ADAPTERS } from '@/lib/adapters/sources';
import { qualifyForInternal } from '@/lib/agents/internal/qualifier';
import type { OrgArchitecture } from '@/lib/types/architecture';

const INTERNAL_SLUG = 'internal';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
  const sb = createClient(url, key, { db: { schema: 'pathfinder' }, auth: { persistSession: false } });

  const { data: orgRow, error: orgErr } = await sb
    .from('organizations')
    .select('id, slug, name, architecture')
    .eq('slug', INTERNAL_SLUG)
    .maybeSingle();
  if (orgErr || !orgRow) throw new Error(`Internal org not found: ${orgErr?.message ?? 'missing'}`);
  const organizationId = (orgRow as { id: string }).id;
  const architecture: OrgArchitecture = resolveArchitecture(
    (orgRow as { architecture: unknown }).architecture as Record<string, unknown>,
  );

  console.log(`[run-internal-ingest-locally] org id=${organizationId} slug=${INTERNAL_SLUG}`);
  console.log(`[run-internal-ingest-locally] running ${architecture.sources.length} source adapters`);

  const runStartedAt = new Date().toISOString();
  const { data: runInsert, error: runErr } = await sb.from('agent_runs').insert({
    agent_name: 'ingestor',
    started_at: runStartedAt,
    status: 'running',
    records_processed: 0,
    records_new: 0,
    organization_id: organizationId,
  }).select('id');
  if (runErr) console.error('  ! agent_runs open failed:', runErr.message);
  const runId = (runInsert?.[0] as { id?: number } | undefined)?.id ?? null;

  const totals = { fetched: 0, qualified: 0, inserted: 0, deduped: 0, errors: 0 };
  const perSource: Array<{ source_id: string; fetched: number; qualified: number; inserted: number; deduped: number; errors: number; error_message?: string }> = [];

  for (const sourceRef of architecture.sources) {
    const adapter = SOURCE_ADAPTERS[sourceRef.id];
    const perSrc = { source_id: sourceRef.id, fetched: 0, qualified: 0, inserted: 0, deduped: 0, errors: 0, error_message: undefined as string | undefined };
    if (!adapter) {
      console.error(`  ! ${sourceRef.id} — not in SOURCE_ADAPTERS`);
      perSrc.errors = 1;
      perSrc.error_message = 'adapter_not_registered';
      perSource.push(perSrc);
      totals.errors++;
      continue;
    }
    console.log(`\n--- ${sourceRef.id} (${adapter.type}) ---`);
    let events;
    try {
      events = await adapter.poll({
        organizationId,
        organizationSlug: INTERNAL_SLUG,
        architecture,
      });
    } catch (err) {
      console.error('  ! poll failed:', err instanceof Error ? err.message : err);
      perSrc.errors = 1;
      perSrc.error_message = err instanceof Error ? err.message : String(err);
      perSource.push(perSrc);
      totals.errors++;
      continue;
    }
    perSrc.fetched = events.length;
    console.log(`  fetched ${events.length}`);
    totals.fetched += events.length;
    if (events.length === 0) {
      perSource.push(perSrc);
      continue;
    }

    const qualifiedEvents = events.filter((e) => {
      const q = qualifyForInternal({
        source_event_id: e.source_event_id,
        source: sourceRef.id,
        title: e.title,
        summary: e.summary,
        raw_payload: e.raw_payload,
        architecture,
      });
      if (!q.qualified) return false;
      const p = e.raw_payload as Record<string, unknown>;
      p.internal_qualifier_reason = q.reason;
      p.internal_inferred_service_category = q.inferred_service_category ?? null;
      p.internal_sales_motion_signal = q.sales_motion_signal ?? p.internal_sales_motion_signal ?? null;
      p.internal_federal_registration = q.federal_registration ?? p.internal_federal_registration ?? null;
      return true;
    });
    perSrc.qualified = qualifiedEvents.length;
    console.log(`  qualified ${qualifiedEvents.length}`);
    totals.qualified += qualifiedEvents.length;
    if (qualifiedEvents.length === 0) {
      perSource.push(perSrc);
      continue;
    }

    const ids = qualifiedEvents.map((e) => e.source_event_id);
    const { data: existing } = await sb.from('projects').select('id').in('id', ids);
    const existingSet = new Set((existing ?? []).map((r) => (r as { id: string }).id));
    const fresh = qualifiedEvents.filter((e) => !existingSet.has(e.source_event_id));
    perSrc.deduped = qualifiedEvents.length - fresh.length;
    totals.deduped += perSrc.deduped;
    if (fresh.length === 0) {
      console.log('  (all duplicates of existing rows)');
      perSource.push(perSrc);
      continue;
    }

    const rows = fresh.map((e) => ({
      id: e.source_event_id,
      source: sourceRef.id,
      source_id: e.source_event_id,
      title: e.title,
      summary: e.summary,
      project_value: null,
      project_stage: null,
      posted_date: e.posted_date,
      raw_payload: e.raw_payload,
      country: e.country ?? null,
      organization_id: organizationId,
      score: null,
    }));
    const { error: insertErr } = await sb.from('projects').insert(rows);
    if (insertErr) {
      console.error('  ! insert failed:', insertErr.message);
      perSrc.errors = 1;
      perSrc.error_message = insertErr.message;
      totals.errors++;
      perSource.push(perSrc);
      continue;
    }
    perSrc.inserted = rows.length;
    totals.inserted += rows.length;
    console.log(`  inserted ${rows.length}`);
    perSource.push(perSrc);
  }

  if (runId != null) {
    await sb.from('agent_runs').update({
      completed_at: new Date().toISOString(),
      records_processed: totals.fetched,
      records_new: totals.inserted,
      status: totals.errors > 0 && totals.inserted === 0 ? 'failed' : 'success',
      error_message: totals.errors > 0
        ? perSource.filter((r) => r.error_message).map((r) => `${r.source_id}: ${r.error_message}`).join('; ').slice(0, 1000)
        : null,
    }).eq('id', runId);
  }

  console.log(`\n[run-internal-ingest-locally] TOTALS: ${JSON.stringify(totals)}`);
  console.log(`[run-internal-ingest-locally] PER-SOURCE: ${JSON.stringify(perSource, null, 2)}`);
}

main().catch((err: unknown) => {
  console.error('[run-internal-ingest-locally] FAILED:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
