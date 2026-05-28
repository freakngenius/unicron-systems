// scripts/backfill-zedcor-notion-prewindow.ts
//
// Sprint Z12 — Notion writer pass against existing in-Supabase rows.
//
// Sweeps pathfinder.projects for Zedcor org rows that are NOT yet in
// Notion and pushes those that pass the Z12 eligibility filter
// (shouldWriteToZedcorNotion):
//
//   • buy_window_open=true rows, OR
//   • source_authority ∈ public_construction / county_purchasing /
//     school_district / state_dot
//     AND project_stage ∈ solicitation / owner_bid / awarded /
//     gc_selected / sub_bid / mobilization
//     AND title passes the construction-keyword gate.
//
// Idempotent. notion_lead_id presence on external_refs is the dedup key.
//
// Usage:
//   pnpm tsx scripts/backfill-zedcor-notion-prewindow.ts            # write
//   pnpm tsx scripts/backfill-zedcor-notion-prewindow.ts --dry-run  # log only
//   pnpm tsx scripts/backfill-zedcor-notion-prewindow.ts --limit=N  # cap
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NOTION_API_TOKEN.

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  writeProjectToNotion,
  shouldWriteToZedcorNotion,
} from '../lib/notion/zedcor-writer';
import type { NotionPhase, NotionState } from '../lib/notion/types';
import { tagPhaseWithConfidence } from '../lib/orchestrator/tag-phase';

dotenvConfig({ path: '.env.production.local' });
dotenvConfig({ path: '.env.local' });
dotenvConfig();

const ZEDCOR_ORG_ID = '6cd87740-7c72-4337-ac79-316a54242eef';
const DEFAULT_LIMIT = 500;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!process.env.NOTION_API_TOKEN) {
  console.error('Missing NOTION_API_TOKEN');
  process.exit(1);
}

const flags = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');
const limitFlag = flags.find((f) => f.startsWith('--limit='));
const limit = limitFlag ? Number(limitFlag.split('=')[1]) : DEFAULT_LIMIT;
if (!Number.isFinite(limit) || limit <= 0) {
  console.error(`Invalid --limit: ${limitFlag}`);
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  db: { schema: 'pathfinder' },
  auth: { persistSession: false, autoRefreshToken: false },
});

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
  project_stage: string | null;
  buy_window_open: boolean | null;
  source_authority: string | null;
  raw_payload: Record<string, unknown> | null;
  external_refs: Record<string, unknown> | null;
  gc_metadata: Record<string, unknown> | null;
}

async function loadCandidates(): Promise<ProjectRow[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('organization_id', ZEDCOR_ORG_ID)
    .order('posted_date', { ascending: false, nullsFirst: false })
    .limit(limit * 3); // overfetch; the eligibility filter is applied below
  if (error) throw new Error(`load failed: ${error.message}`);
  const rows = (data as unknown as ProjectRow[]) ?? [];
  return rows
    .filter((r) => {
      const refs = (r.external_refs ?? {}) as Record<string, unknown>;
      return !refs.notion_lead_id;
    })
    .filter((r) =>
      shouldWriteToZedcorNotion({
        title: r.title,
        source_authority: r.source_authority,
        project_stage: r.project_stage,
        buy_window_open: r.buy_window_open,
        summary: r.summary,
      }),
    )
    .slice(0, limit);
}

async function mergeExternalRefs(id: string, patch: Record<string, unknown>): Promise<void> {
  const { data } = await supabase
    .from('projects')
    .select('external_refs')
    .eq('id', id)
    .single();
  const existing = ((data?.external_refs as Record<string, unknown> | null) ?? {});
  await supabase
    .from('projects')
    .update({ external_refs: { ...existing, ...patch } })
    .eq('id', id);
}

async function main(): Promise<void> {
  const rows = await loadCandidates();
  console.log(`Z12 Notion writer pass`);
  console.log(`======================`);
  console.log(`org_id     : ${ZEDCOR_ORG_ID}`);
  console.log(`candidates : ${rows.length}`);
  console.log(`dry-run    : ${dryRun}`);

  let attempted = 0;
  let created = 0;
  let deduped = 0;
  let failed = 0;
  const stageCounts = new Map<string, number>();

  for (const p of rows) {
    attempted += 1;
    const { phase } = tagPhaseWithConfidence({
      response_deadline: p.response_deadline,
      posted_date: p.posted_date,
    });
    if (dryRun) {
      const stage = p.project_stage ?? 'unknown';
      stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
      console.log(`  would write [${stage}] ${p.source}:${p.source_id} — ${p.title.slice(0, 80)}`);
      continue;
    }
    try {
      const enrichment = (p.gc_metadata ?? null) as Parameters<typeof writeProjectToNotion>[1];
      const res = await writeProjectToNotion(
        {
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
          project_stage: p.project_stage,
          buy_window_open: p.buy_window_open,
          source_authority: p.source_authority,
        },
        enrichment,
      );
      if (res.alreadyExists) deduped += 1;
      else created += 1;
      const stage = p.project_stage ?? 'unknown';
      stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
      await mergeExternalRefs(p.id, {
        notion_lead_id: res.leadId,
        notion_page_url: res.notionPageUrl,
        notion_written_at: new Date().toISOString(),
        notion_writer: 'backfill-zedcor-notion-prewindow.ts',
      });
      await new Promise((r) => setTimeout(r, 350));
    } catch (err) {
      failed += 1;
      console.error(`  FAIL ${p.source}:${p.source_id} — ${(err as Error).message}`);
    }
  }

  console.log('---');
  console.log(`attempted : ${attempted}`);
  console.log(`created   : ${created}`);
  console.log(`deduped   : ${deduped}`);
  console.log(`failed    : ${failed}`);
  console.log('by stage:');
  for (const [stage, count] of stageCounts.entries()) {
    console.log(`  ${stage}: ${count}`);
  }
}

void main().then(() => process.exit(0)).catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
