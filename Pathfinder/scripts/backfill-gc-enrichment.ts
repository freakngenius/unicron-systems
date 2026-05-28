// scripts/backfill-gc-enrichment.ts
//
// Sprint Z3.5 — Backfill GC + contact extraction against existing Zedcor
// projects. Reads pathfinder.projects rows in the Zedcor org that are in
// (or past) the GC-selection phase, runs extractGcMetadata() against each
// detail page, persists to pathfinder.projects.gc_metadata, and pushes
// the result into Notion (update existing rows; create new rows if absent).
//
// Filter (per spec §"Backfill scope"):
//   project_stage IN ('awarded','gc_selected','sub_bid','mobilization')
//   OR buy_window_open=true
//
// Order: public_construction → county_purchasing → school_district sources
//        first; federal contracts deprioritized.
//
// Cap: 500 (default; override via --cap=N).
//
// Skip: any project with null source_url.
//
// Idempotent: re-running re-fetches and overwrites gc_metadata + the
// 8 Notion enrichment columns. Rep Status / Rep Notes never touched.
//
// Usage:
//   pnpm tsx scripts/backfill-gc-enrichment.ts            # full backfill
//   pnpm tsx scripts/backfill-gc-enrichment.ts --dry-run  # log only
//   pnpm tsx scripts/backfill-gc-enrichment.ts --cap=50   # smoke
//   pnpm tsx scripts/backfill-gc-enrichment.ts --limit=N  # alias for --cap=N
//   pnpm tsx scripts/backfill-gc-enrichment.ts --notion=false  # DB only
//   pnpm tsx scripts/backfill-gc-enrichment.ts --force    # Z6: re-process rows
//                                                          that already have gc_metadata
//   pnpm tsx scripts/backfill-gc-enrichment.ts --use-bypass-fetcher
//                                                          # Z6: force the tiered L1→L4
//                                                          fetcher even on non-whitelisted hosts

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  writeProjectToNotion,
  findExistingProjectInNotion,
  updateProjectEnrichmentInNotion,
} from '../lib/notion/zedcor-writer';
import type { NotionPhase, NotionState } from '../lib/notion/types';
import { tagPhaseWithConfidence } from '../lib/orchestrator/tag-phase';
import { extractGcMetadata, type GcMetadata } from '../lib/adapters/zedcor/gc-extractor';

dotenvConfig({ path: '.env.production.local' });
dotenvConfig({ path: '.env.local' });
dotenvConfig();

const ZEDCOR_ORG_ID = '6cd87740-7c72-4337-ac79-316a54242eef';
const DEFAULT_CAP = 500;

// Source-slug → authority class. Order in the array IS the backfill
// priority (Tier 1 first, federal last).
const SOURCE_PRIORITY: ReadonlyArray<{ slug: string; authority: string }> = [
  { slug: 'houston-public-works', authority: 'public_construction' },
  { slug: 'port-houston',         authority: 'public_construction' },
  { slug: 'txdot-houston-district', authority: 'public_construction' },
  { slug: 'houston-metro',        authority: 'public_construction' },
  { slug: 'houston-obo',          authority: 'public_construction' },
  { slug: 'harris-county-bonfire', authority: 'county_purchasing' },
  { slug: 'fort-bend-county',     authority: 'county_purchasing' },
  { slug: 'galveston-county',     authority: 'county_purchasing' },
  { slug: 'brazoria-county',      authority: 'county_purchasing' },
  { slug: 'hisd-ionwave',         authority: 'school_district' },
  // Federal — deprioritized (don't follow GC-to-sub model).
  { slug: 'sam-gov-entity',       authority: 'federal' },
  { slug: 'usaspending-recipients', authority: 'federal' },
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const flags = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');
const writeNotion = !flags.includes('--notion=false');
// Z6 — additive flags. --force re-processes rows that already have
// gc_metadata; --use-bypass-fetcher tells the extractor to use the
// tiered L1→L4 fetcher unconditionally (default behavior on
// whitelisted procurement portals; this opts in for all rows).
const forceReprocess = flags.includes('--force');
const useBypassFetcher = flags.includes('--use-bypass-fetcher');
const capArg = flags.find((f) => f.startsWith('--cap=')) ?? flags.find((f) => f.startsWith('--limit='));
const capRaw = capArg
  ? capArg.startsWith('--cap=')
    ? capArg.slice('--cap='.length)
    : capArg.slice('--limit='.length)
  : '';
const cap = capRaw ? Math.max(1, Number.parseInt(capRaw, 10) || DEFAULT_CAP) : DEFAULT_CAP;

if (writeNotion && !process.env.NOTION_API_TOKEN) {
  console.error('Missing NOTION_API_TOKEN — set it in .env.production.local or pass --notion=false');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('warning: ANTHROPIC_API_KEY not set — Layer 2 will be skipped for every project.');
}
if (!process.env.PERPLEXITY_API_KEY) {
  console.warn('warning: PERPLEXITY_API_KEY not set — Layer 3 fallback skipped (gc_name will be html/anthropic-only).');
}

const supabase = createClient(url, serviceKey, {
  db: { schema: 'pathfinder' },
  auth: { persistSession: false, autoRefreshToken: false },
});

interface BackfillRow {
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
  project_stage: string | null;
  buy_window_open: boolean | null;
  // Z6 — surfaces whether the row already has gc_metadata so the
  // --force flag can decide whether to re-extract.
  gc_metadata: Record<string, unknown> | null;
}

function priorityOf(slug: string): number {
  const idx = SOURCE_PRIORITY.findIndex((s) => s.slug === slug);
  return idx >= 0 ? idx : SOURCE_PRIORITY.length;
}

function compareBackfillRows(a: BackfillRow, b: BackfillRow): number {
  const pa = priorityOf(a.source);
  const pb = priorityOf(b.source);
  if (pa !== pb) return pa - pb;
  // buy_window_open first
  if ((a.buy_window_open ? 1 : 0) !== (b.buy_window_open ? 1 : 0)) {
    return (b.buy_window_open ? 1 : 0) - (a.buy_window_open ? 1 : 0);
  }
  // most-recent posted_date next
  const ta = a.posted_date ? Date.parse(a.posted_date) : 0;
  const tb = b.posted_date ? Date.parse(b.posted_date) : 0;
  if (ta !== tb) return tb - ta;
  // highest score last
  return (b.score ?? -1) - (a.score ?? -1);
}

async function loadEligibleProjects(): Promise<BackfillRow[]> {
  // supabase-js's .or() limits eq/in expression composition; fetch each
  // condition separately and de-dup in code. The dataset (~1.8K rows) is
  // small enough for a single round-trip per condition.
  const select = 'id, source, source_id, title, posted_date, response_deadline, source_url, rationale, score, raw_payload, project_stage, buy_window_open, gc_metadata';

  const stages = ['awarded', 'gc_selected', 'sub_bid', 'mobilization'];
  const stageReq = supabase
    .from('projects')
    .select(select)
    .eq('organization_id', ZEDCOR_ORG_ID)
    .in('project_stage', stages);
  const windowReq = supabase
    .from('projects')
    .select(select)
    .eq('organization_id', ZEDCOR_ORG_ID)
    .eq('buy_window_open', true);

  const [{ data: a, error: ea }, { data: b, error: eb }] = await Promise.all([stageReq, windowReq]);
  if (ea) { console.error('stage query failed:', ea.message); process.exit(1); }
  if (eb) { console.error('buy_window query failed:', eb.message); process.exit(1); }

  const merged = new Map<string, BackfillRow>();
  for (const row of [...((a as BackfillRow[] | null) ?? []), ...((b as BackfillRow[] | null) ?? [])]) {
    if (!row.source_url) continue;
    merged.set(row.id, row);
  }
  const all = [...merged.values()].sort(compareBackfillRows);
  return all.slice(0, cap);
}

async function persistGcMetadata(projectId: string, meta: GcMetadata): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .update({ gc_metadata: meta as unknown as Record<string, unknown> })
    .eq('id', projectId);
  if (error) throw new Error(`persist gc_metadata failed for ${projectId}: ${error.message}`);
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

interface Stats {
  attempted: number;
  enriched: number;
  enrichmentFailed: number;
  layerCounts: Record<string, number>;
  gcNamePopulated: number;
  anyContactPopulated: number;
  notionCreated: number;
  notionUpdated: number;
  notionFailed: number;
  fetchStatusCounts: Record<string, number>;
}

async function main(): Promise<void> {
  console.log(
    `backfill-gc-enrichment: cap=${cap} dryRun=${dryRun} writeNotion=${writeNotion} ` +
    `force=${forceReprocess} useBypassFetcher=${useBypassFetcher}`,
  );
  const allRows = await loadEligibleProjects();
  // Z6 — without --force, skip rows that already have gc_metadata so the
  // backfill doesn't burn Anthropic budget re-extracting unchanged rows.
  const rows = forceReprocess
    ? allRows
    : allRows.filter((r) => !r.gc_metadata || Object.keys(r.gc_metadata).length === 0);
  console.log(
    `eligible rows after filter+order+cap: ${allRows.length} ` +
    `(after --force filter: ${rows.length})`,
  );

  if (dryRun) {
    for (const r of rows.slice(0, 10)) {
      console.log(`  would enrich: [${r.source}] ${r.title.slice(0, 80)}  url=${r.source_url ? 'yes' : 'no'}`);
    }
    return;
  }

  const stats: Stats = {
    attempted: 0,
    enriched: 0,
    enrichmentFailed: 0,
    layerCounts: {},
    gcNamePopulated: 0,
    anyContactPopulated: 0,
    notionCreated: 0,
    notionUpdated: 0,
    notionFailed: 0,
    fetchStatusCounts: {},
  };

  for (const p of rows) {
    stats.attempted += 1;
    let meta: GcMetadata | null = null;
    try {
      meta = await extractGcMetadata({
        source_url: p.source_url,
        title: p.title,
        forceBypass: useBypassFetcher,
      });
      await persistGcMetadata(p.id, meta);
      stats.enriched += 1;
      stats.layerCounts[meta.extraction_layer] = (stats.layerCounts[meta.extraction_layer] ?? 0) + 1;
      stats.fetchStatusCounts[meta.fetch_status] = (stats.fetchStatusCounts[meta.fetch_status] ?? 0) + 1;
      if (meta.gc_name) stats.gcNamePopulated += 1;
      if (meta.gc_contact_email || meta.gc_contact_phone) stats.anyContactPopulated += 1;
    } catch (err) {
      stats.enrichmentFailed += 1;
      console.error(`  FAIL extract ${p.source}:${p.source_id} — ${(err as Error).message}`);
      continue;
    }

    if (writeNotion && meta) {
      try {
        const existing = await findExistingProjectInNotion(p.source, p.source_id);
        if (existing) {
          await updateProjectEnrichmentInNotion(existing.notionPageId, meta);
          stats.notionUpdated += 1;
        } else {
          const { phase } = tagPhaseWithConfidence({
            response_deadline: p.response_deadline,
            posted_date: p.posted_date,
          });
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
          }, meta);
          stats.notionCreated += 1;
          await mergeExternalRefs(p.id, {
            notion_lead_id: res.leadId,
            notion_page_url: res.notionPageUrl,
            notion_written_at: new Date().toISOString(),
          });
        }
        await new Promise((r) => setTimeout(r, 350)); // notion rate-limit
      } catch (err) {
        stats.notionFailed += 1;
        console.error(`  FAIL notion  ${p.source}:${p.source_id} — ${(err as Error).message}`);
      }
    }

    if (stats.attempted % 25 === 0) {
      console.log(
        `progress: ${stats.attempted}/${rows.length} | enriched=${stats.enriched} ` +
        `gc_name=${stats.gcNamePopulated} contact=${stats.anyContactPopulated} ` +
        `notion(c/u/f)=${stats.notionCreated}/${stats.notionUpdated}/${stats.notionFailed}`,
      );
    }
  }

  const pct = (n: number) => stats.attempted ? `${((n / stats.attempted) * 100).toFixed(1)}%` : 'n/a';
  console.log('---');
  console.log(`attempted:              ${stats.attempted}`);
  console.log(`enriched:               ${stats.enriched}  (${pct(stats.enriched)})`);
  console.log(`enrichment failed:      ${stats.enrichmentFailed}`);
  console.log(`gc_name populated:      ${stats.gcNamePopulated}  (${pct(stats.gcNamePopulated)})`);
  console.log(`any contact populated:  ${stats.anyContactPopulated}  (${pct(stats.anyContactPopulated)})`);
  console.log(`extraction layers:      ${JSON.stringify(stats.layerCounts)}`);
  console.log(`fetch statuses:         ${JSON.stringify(stats.fetchStatusCounts)}`);
  console.log(`notion created:         ${stats.notionCreated}`);
  console.log(`notion updated:         ${stats.notionUpdated}`);
  console.log(`notion failed:          ${stats.notionFailed}`);
}

void main().then(() => process.exit(0)).catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
