// scripts/backfill-notion-zedcor.ts
//
// One-shot backfill: for every pathfinder.projects row in the Zedcor org
// whose external_refs doesn't yet carry a notion_lead_id, push it through
// the same writeProjectToNotion() the orchestrator uses, then stash the
// returned lead id + page url back onto projects.external_refs.
//
// Why this exists: runs 6675/6676 inserted 37 projects before
// NOTION_API_TOKEN was set in prod, so all 37 Notion writes failed. This
// script catches them up without re-ingesting from the sources.
//
// Usage:
//   pnpm tsx scripts/backfill-notion-zedcor.ts            # write
//   pnpm tsx scripts/backfill-notion-zedcor.ts --dry-run  # log only
//
// Env loading mirrors scripts/backfill-zedcor-geo.ts:
//   .env.production.local → .env.local → process.env

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { writeProjectToNotion } from '../lib/notion/zedcor-writer';
import type { NotionPhase, NotionState } from '../lib/notion/types';
import { tagPhaseWithConfidence } from '../lib/orchestrator/tag-phase';

dotenvConfig({ path: '.env.production.local' });
dotenvConfig({ path: '.env.local' });
dotenvConfig();

const ZEDCOR_ORG_ID = '6cd87740-7c72-4337-ac79-316a54242eef';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!process.env.NOTION_API_TOKEN) {
  console.error('Missing NOTION_API_TOKEN — set it in .env.production.local before running');
  process.exit(1);
}

const flags = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');

const supabase = createClient(url, serviceKey, {
  db: { schema: 'pathfinder' },
  auth: { persistSession: false, autoRefreshToken: false },
});

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
  external_refs: Record<string, unknown> | null;
}

async function loadOrphanedProjects(): Promise<ProjectRow[]> {
  // pull every Zedcor-org project from the Z1A source set, then filter in
  // application code for ones missing notion_lead_id (supabase-js's jsonb
  // filter ergonomics for "key missing OR null" are fiddly).
  const Z1A_SLUGS = [
    'houston-obo',
    'houston-public-works',
    'harris-county-bonfire',
    'houston-metro',
    'port-houston',
    'fort-bend-county',
    'galveston-county',
    'brazoria-county',
    'hisd-ionwave',
    'txdot-houston-district',
  ];
  const { data, error } = await supabase
    .from('projects')
    .select('id, source, source_id, title, posted_date, response_deadline, source_url, rationale, score, raw_payload, external_refs')
    .eq('organization_id', ZEDCOR_ORG_ID)
    .in('source', Z1A_SLUGS);
  if (error) {
    console.error('select projects failed:', error.message);
    process.exit(1);
  }
  const rows = (data as ProjectRow[] | null) ?? [];
  return rows.filter((r) => {
    const refs = (r.external_refs ?? {}) as Record<string, unknown>;
    return !refs.notion_lead_id;
  });
}

async function mergeExternalRefs(id: string, patch: Record<string, unknown>): Promise<void> {
  const { data } = await supabase
    .from('projects')
    .select('external_refs')
    .eq('id', id)
    .single();
  const existing = ((data?.external_refs as Record<string, unknown> | null) ?? {});
  await supabase.from('projects').update({ external_refs: { ...existing, ...patch } }).eq('id', id);
}

async function main(): Promise<void> {
  const rows = await loadOrphanedProjects();
  console.log(`found ${rows.length} orphaned projects (no notion_lead_id) for Zedcor org`);
  if (dryRun) {
    console.log('--dry-run set, exiting before any Notion writes');
    for (const r of rows.slice(0, 5)) {
      console.log(`  would write: ${r.source}:${r.source_id} — ${r.title.slice(0, 80)}`);
    }
    return;
  }

  let attempted = 0;
  let created = 0;
  let alreadyExisted = 0;
  let failed = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const p of rows) {
    attempted += 1;
    const { phase } = tagPhaseWithConfidence({
      response_deadline: p.response_deadline,
      posted_date: p.posted_date,
    });
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
        phase: phase as NotionPhase,
        agency: (p.raw_payload?.agency as string | null) ?? null,
        city: (p.raw_payload?.city as string | null) ?? null,
        county: (p.raw_payload?.county as string | null) ?? null,
        state: (p.raw_payload?.state as NotionState | string | null) ?? null,
        estimated_value: (p.raw_payload?.estimated_value as number | null) ?? null,
      });
      if (res.alreadyExists) alreadyExisted += 1;
      else created += 1;
      await mergeExternalRefs(p.id, {
        notion_lead_id: res.leadId,
        notion_page_url: res.notionPageUrl,
        notion_written_at: new Date().toISOString(),
      });
      console.log(`  ok ${res.alreadyExists ? '(dedupe)' : '(created)'} ${res.leadId} ← ${p.source}:${p.source_id}`);
      await new Promise((r) => setTimeout(r, 350)); // notion rate-limit
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ id: p.id, error: message });
      console.error(`  FAIL ${p.source}:${p.source_id} — ${message}`);
    }
  }

  console.log('---');
  console.log(`attempted: ${attempted}`);
  console.log(`created:   ${created}`);
  console.log(`dedupe:    ${alreadyExisted}`);
  console.log(`failed:    ${failed}`);
  if (failures.length > 0) {
    console.log('failures:');
    for (const f of failures) console.log(`  ${f.id} — ${f.error}`);
  }
}

void main().then(() => process.exit(0)).catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
