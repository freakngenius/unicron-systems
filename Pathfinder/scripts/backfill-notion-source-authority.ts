// scripts/backfill-notion-source-authority.ts
//
// Sprint Z3 — backfill the Zedcor Notion DB with Bid Stage / Buy Window /
// Source Type tagging for every pathfinder.projects row that hasn't yet
// landed in Notion (external_refs.notion_lead_id IS NULL).
//
// Why this exists: the writer was updated in Z3 to emit Bid Stage / Buy
// Window / Source Type, but the 1,871 existing Zedcor rows were ingested
// before that — they're missing from Notion entirely. This pushes up to
// 500 rows through writeProjectToNotion(), ordering so the
// public-construction / buy-window-open rows land first.
//
// Usage:
//   pnpm tsx scripts/backfill-notion-source-authority.ts
//   pnpm tsx scripts/backfill-notion-source-authority.ts --dry-run
//   pnpm tsx scripts/backfill-notion-source-authority.ts --cap 100
//
// Env loading mirrors backfill-notion-zedcor.ts:
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
const DEFAULT_CAP = 500;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!process.env.NOTION_API_TOKEN) {
  console.error('Missing NOTION_API_TOKEN — set it in .env.production.local before running');
  process.exit(1);
}

const flags = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');
const capIndex = flags.indexOf('--cap');
const cap = capIndex >= 0 ? Math.max(1, Number(flags[capIndex + 1] ?? DEFAULT_CAP)) : DEFAULT_CAP;

const supabase = createClient(supabaseUrl, serviceKey, {
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
  project_stage: string | null;
  buy_window_open: boolean | null;
  source_authority: string | null;
}

async function loadCandidates(): Promise<ProjectRow[]> {
  // Pull all Zedcor rows. We'll sort + cap in application code so the
  // ORDER BY can use the spec priority: source_authority='public_construction'
  // first, then buy_window_open=true, then score desc.
  const { data, error } = await supabase
    .from('projects')
    .select('id, source, source_id, title, posted_date, response_deadline, source_url, rationale, score, raw_payload, external_refs, project_stage, buy_window_open, source_authority')
    .eq('organization_id', ZEDCOR_ORG_ID);
  if (error) {
    console.error('select projects failed:', error.message);
    process.exit(1);
  }
  const rows = (data as ProjectRow[] | null) ?? [];
  const orphans = rows.filter((r) => {
    const refs = (r.external_refs ?? {}) as Record<string, unknown>;
    return !refs.notion_lead_id;
  });
  // Title or source_url must be present (relaxed verifier rule).
  const writable = orphans.filter((r) => Boolean(r.title) && Boolean(r.source_url));

  // Spec ordering.
  const PRIORITY_AUTHORITY: Record<string, number> = {
    public_construction: 0,
    county_purchasing: 1,
    state_dot: 1,
    school_district: 1,
    news_report: 2,
    federal_contract: 3,
    federal_spending: 3,
    other: 4,
  };
  writable.sort((a, b) => {
    const aPri = PRIORITY_AUTHORITY[a.source_authority ?? 'other'] ?? 4;
    const bPri = PRIORITY_AUTHORITY[b.source_authority ?? 'other'] ?? 4;
    if (aPri !== bPri) return aPri - bPri;
    const aBwo = a.buy_window_open === true ? 0 : 1;
    const bBwo = b.buy_window_open === true ? 0 : 1;
    if (aBwo !== bBwo) return aBwo - bBwo;
    return (b.score ?? 0) - (a.score ?? 0);
  });
  return writable.slice(0, cap);
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
  const rows = await loadCandidates();
  console.log(`found ${rows.length} candidates (cap ${cap})`);

  const authorityCounts = new Map<string, number>();
  for (const r of rows) {
    const k = r.source_authority ?? 'unknown';
    authorityCounts.set(k, (authorityCounts.get(k) ?? 0) + 1);
  }
  console.log('source_authority breakdown:');
  for (const [k, v] of [...authorityCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(22)} ${v}`);
  }

  if (dryRun) {
    console.log('--dry-run set, exiting before any Notion writes');
    for (const r of rows.slice(0, 8)) {
      console.log(`  would write: ${r.source}:${r.source_id} · ${r.source_authority} · stage=${r.project_stage} · bwo=${r.buy_window_open} · ${r.title.slice(0, 60)}`);
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
        // Sprint Z3 — Bid Stage / Buy Window / Source Type signals.
        project_stage: p.project_stage,
        buy_window_open: p.buy_window_open,
        source_authority: p.source_authority,
      });
      if (res.alreadyExists) alreadyExisted += 1;
      else created += 1;
      await mergeExternalRefs(p.id, {
        notion_lead_id: res.leadId,
        notion_page_url: res.notionPageUrl,
        notion_written_at: new Date().toISOString(),
      });
      if (attempted % 25 === 0) {
        console.log(`  [${attempted}/${rows.length}] created=${created} dedupe=${alreadyExisted} failed=${failed}`);
      }
      await new Promise((r) => setTimeout(r, 350)); // notion rate-limit
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ id: p.id, error: message });
      console.error(`  FAIL ${p.source}:${p.source_id} — ${message}`);
      // First-failure circuit-breaker: if Notion schema is broken, don't burn
      // 500 writes confirming it.
      if (failed >= 5 && created === 0 && alreadyExisted === 0) {
        console.error('aborting — first 5 writes all failed; check Notion DB schema + token');
        break;
      }
    }
  }

  console.log('---');
  console.log(`attempted: ${attempted}`);
  console.log(`created:   ${created}`);
  console.log(`dedupe:    ${alreadyExisted}`);
  console.log(`failed:    ${failed}`);
  if (failures.length > 0) {
    console.log('first failures:');
    for (const f of failures.slice(0, 10)) console.log(`  ${f.id} — ${f.error}`);
  }
}

void main().then(() => process.exit(0)).catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
