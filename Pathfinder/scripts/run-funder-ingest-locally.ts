// scripts/run-funder-ingest-locally.ts
//
// Funder onboarding Stage 10 — local E2E runner.
//
// Inngest functions are registered with the cloud service at the
// production /api/inngest endpoint. The funder-onboarding branch
// deployment hosts a copy of the subscriber, but Inngest cloud routes
// production events only to the registered production handler.
//
// To exercise the subscriber for Stage 10 verification without first
// merging to main, this script runs the subscriber's body locally:
//   1. loadOrgArchitecture for Funder
//   2. iterate architecture.sources
//   3. call SOURCE_ADAPTERS[id].poll() for each
//   4. apply the qualifier + geo hub assignment
//   5. dedupe + insert into pathfinder.projects scoped by organization_id
//
// Idempotent — projects.id is the source_event_id so re-running skips
// existing rows.

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env.production.local' });

import { createClient } from '@supabase/supabase-js';
import { resolveArchitecture } from '@/lib/config/resolveArchitecture';
import { SOURCE_ADAPTERS } from '@/lib/adapters/sources';
import { qualifyForFunder } from '@/lib/agents/funder/qualifier';
import { assignHub } from '@/lib/agents/funder/geo';
import type { OrgArchitecture } from '@/lib/types/architecture';

const FUNDER_SLUG = 'funder';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
  const sb = createClient(url, key, { db: { schema: 'pathfinder' }, auth: { persistSession: false } });

  const { data: orgRow, error: orgErr } = await sb
    .from('organizations')
    .select('id, slug, name, architecture')
    .eq('slug', FUNDER_SLUG)
    .maybeSingle();
  if (orgErr || !orgRow) throw new Error(`Funder org not found: ${orgErr?.message ?? 'missing'}`);
  const organizationId = (orgRow as { id: string }).id;
  const architecture: OrgArchitecture = resolveArchitecture((orgRow as { architecture: unknown }).architecture as Record<string, unknown>);

  console.log(`[run-funder-ingest-locally] org id=${organizationId} slug=${FUNDER_SLUG}`);
  console.log(`[run-funder-ingest-locally] running ${architecture.sources.length} source adapters`);

  const totals = { fetched: 0, qualified: 0, inserted: 0, deduped: 0, errors: 0 };
  for (const sourceRef of architecture.sources) {
    const adapter = SOURCE_ADAPTERS[sourceRef.id];
    if (!adapter) {
      console.error(`  ! ${sourceRef.id} — not in SOURCE_ADAPTERS`);
      totals.errors++;
      continue;
    }
    console.log(`\n--- ${sourceRef.id} (${adapter.type}) ---`);
    let events;
    try {
      events = await adapter.poll({
        organizationId,
        organizationSlug: FUNDER_SLUG,
        architecture,
      });
    } catch (err) {
      console.error('  ! poll failed:', err instanceof Error ? err.message : err);
      totals.errors++;
      continue;
    }
    console.log(`  fetched ${events.length}`);
    totals.fetched += events.length;
    if (events.length === 0) continue;

    // Qualify + tag
    const qualifiedEvents = events.filter((e) => {
      const q = qualifyForFunder({
        source_event_id: e.source_event_id,
        source: sourceRef.id,
        title: e.title,
        summary: e.summary,
        raw_payload: e.raw_payload,
        architecture,
      });
      if (!q.qualified) return false;
      const hub = assignHub({ city: e.city, state: e.state, country: e.country });
      (e.raw_payload as Record<string, unknown>).funder_qualifier_reason = q.reason;
      (e.raw_payload as Record<string, unknown>).funder_inferred_thesis = q.inferred_thesis ?? null;
      (e.raw_payload as Record<string, unknown>).funder_compliance_flag = q.compliance_flag ?? null;
      (e.raw_payload as Record<string, unknown>).funder_geo_hub = hub;
      return true;
    });
    console.log(`  qualified ${qualifiedEvents.length}`);
    totals.qualified += qualifiedEvents.length;
    if (qualifiedEvents.length === 0) continue;

    const ids = qualifiedEvents.map((e) => e.source_event_id);
    const { data: existing } = await sb.from('projects').select('id').in('id', ids);
    const existingSet = new Set((existing ?? []).map((r) => (r as { id: string }).id));
    const fresh = qualifiedEvents.filter((e) => !existingSet.has(e.source_event_id));
    totals.deduped += qualifiedEvents.length - fresh.length;
    if (fresh.length === 0) {
      console.log('  (all duplicates of existing rows)');
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
      totals.errors++;
      continue;
    }
    console.log(`  inserted ${rows.length}`);
    totals.inserted += rows.length;
  }

  console.log(`\n[run-funder-ingest-locally] TOTALS: ${JSON.stringify(totals)}`);
}

main().catch((err: unknown) => {
  console.error('[run-funder-ingest-locally] FAILED:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
