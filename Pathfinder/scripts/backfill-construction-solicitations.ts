// scripts/backfill-construction-solicitations.ts
//
// Sprint Z11 Fix 3 — pre-window tracking backfill.
//
// Pre-Z11, the Notion Lead Feed only surfaced rows that had reached
// gc_selected/sub_bid/mobilization or carried buy_window_open=true. The
// public RFP feed is mostly at project_stage='solicitation' / 'owner_bid'
// and never made it into Notion even though it's the early-radar signal
// for upcoming buy windows. This backfill catches those rows up.
//
// Eligibility (matches isPreWindowConstructionSolicitation in zedcor-writer.ts):
//   - project_stage in (solicitation, owner_bid, rfp)
//   - source_authority in (public_construction, county_purchasing,
//                          school_district, state_dot)
//   - title matches the construction-keyword regex
//
// Each match writes via the same writeProjectToNotion() the orchestrator
// uses. Bid Stage resolves to 'Solicitation', Buy Window resolves to
// 'Closed' (pre-window tracking) via the existing zedcor-writer mappings.
// Notion's Project ID dedup keeps re-runs idempotent.
//
// Usage:
//   pnpm tsx scripts/backfill-construction-solicitations.ts            # write
//   pnpm tsx scripts/backfill-construction-solicitations.ts --dry-run  # log only
//   pnpm tsx scripts/backfill-construction-solicitations.ts --limit=50 # cap
//
// Env loading mirrors scripts/backfill-notion-zedcor.ts:
//   .env.production.local → .env.local → process.env
//
// Required envs: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// NOTION_API_TOKEN.

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  isPreWindowConstructionSolicitation,
  writeProjectToNotion,
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
  console.error('Missing NOTION_API_TOKEN — set it before running');
  process.exit(1);
}

const flags = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');
const limitFlag = flags.find((f) => f.startsWith('--limit='));
const limit = limitFlag ? Number(limitFlag.split('=')[1]) : DEFAULT_LIMIT;
if (!Number.isFinite(limit) || limit <= 0) {
  console.error(`Invalid --limit value: ${limitFlag}`);
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
  posted_date: string | null;
  response_deadline: string | null;
  source_url: string | null;
  rationale: string | null;
  score: number | null;
  raw_payload: Record<string, unknown> | null;
  project_stage: string | null;
  buy_window_open: boolean | null;
  source_authority: string | null;
  external_refs: Record<string, unknown> | null;
}

async function loadEligible(): Promise<ProjectRow[]> {
  const PRE_WINDOW_AUTHORITIES = [
    'public_construction',
    'county_purchasing',
    'school_district',
    'state_dot',
  ];
  const PRE_WINDOW_STAGES = ['solicitation', 'owner_bid', 'rfp'];
  const { data, error } = await supabase
    .from('projects')
    .select(
      'id, source, source_id, title, posted_date, response_deadline, source_url, rationale, score, raw_payload, project_stage, buy_window_open, source_authority, external_refs',
    )
    .eq('organization_id', ZEDCOR_ORG_ID)
    .in('project_stage', PRE_WINDOW_STAGES)
    .in('source_authority', PRE_WINDOW_AUTHORITIES)
    .not('title', 'is', null)
    .not('source_url', 'is', null)
    .order('posted_date', { ascending: false, nullsFirst: false });
  if (error) throw new Error(`load eligible failed: ${error.message}`);
  const rows = (data ?? []) as unknown as ProjectRow[];
  // Final keyword filter happens in-app via the shared helper so the
  // backfill and the orchestrator agree on what "construction-relevant"
  // means. SQL ILIKE alternation across 20+ keywords gets unwieldy.
  return rows
    .filter((r) =>
      isPreWindowConstructionSolicitation(
        r.title,
        r.project_stage,
        r.source_authority,
      ),
    )
    .slice(0, limit);
}

async function updateProjectExternalRefs(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data } = await supabase
    .from('projects')
    .select('external_refs')
    .eq('id', id)
    .single();
  const existing =
    ((data as { external_refs?: Record<string, unknown> | null } | null)
      ?.external_refs as Record<string, unknown> | null) ?? {};
  await supabase
    .from('projects')
    .update({ external_refs: { ...existing, ...patch } })
    .eq('id', id);
}

async function main(): Promise<void> {
  const eligible = await loadEligible();
  console.log(
    `[backfill-construction-solicitations] eligible=${eligible.length} limit=${limit} dryRun=${dryRun}`,
  );

  let notionCreated = 0;
  let notionDedupes = 0;
  let failures = 0;

  for (const p of eligible) {
    try {
      if (dryRun) {
        console.log(
          `[backfill-construction-solicitations] DRY ${p.source}:${p.source_id} — ${p.title.slice(0, 90)}`,
        );
        continue;
      }
      const res = await writeProjectToNotion({
        source: p.source,
        source_id: p.source_id,
        title: p.title,
        posted_date: p.posted_date,
        response_deadline: p.response_deadline,
        source_url: p.source_url,
        rationale: p.rationale,
        score: p.score,
        phase: tagPhaseWithConfidence({
          response_deadline: p.response_deadline,
          posted_date: p.posted_date,
        }).phase as NotionPhase,
        agency: (p.raw_payload?.agency as string | null) ?? null,
        city: (p.raw_payload?.city as string | null) ?? null,
        county: (p.raw_payload?.county as string | null) ?? null,
        state:
          (p.raw_payload?.state as NotionState | string | null) ?? null,
        estimated_value:
          (p.raw_payload?.estimated_value as number | null) ?? null,
        project_stage: p.project_stage,
        buy_window_open: p.buy_window_open,
        source_authority: p.source_authority,
      });
      if (res.alreadyExists) notionDedupes += 1;
      else notionCreated += 1;
      await updateProjectExternalRefs(p.id, {
        notion_lead_id: res.leadId,
        notion_page_url: res.notionPageUrl,
        notion_written_at: new Date().toISOString(),
      });
      // Polite delay against Notion rate-limit.
      await new Promise((r) => setTimeout(r, 350));
    } catch (err) {
      failures += 1;
      console.error(
        `[backfill-construction-solicitations] FAILED ${p.source}:${p.source_id} — ${(err as Error).message}`,
      );
    }
  }

  console.log(
    `[backfill-construction-solicitations] DONE ${JSON.stringify({ eligible: eligible.length, notionCreated, notionDedupes, failures })}`,
  );
}

main().catch((err) => {
  console.error('[backfill-construction-solicitations] fatal', err);
  process.exit(1);
});
