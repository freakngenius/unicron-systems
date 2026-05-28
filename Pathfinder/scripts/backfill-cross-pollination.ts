// scripts/backfill-cross-pollination.ts
//
// Sprint Z8 — Retro re-run of Z4's cross-pollination engine across every
// in-window lead after the Z8 customer import lands.
//
// Why: Z4's pipeline computed cross_pollination = "No existing Zedcor
// relationship — cold outreach" for every project because pathfinder.
// zedcor_customer_sites was empty. Now that Z8 has imported 1,825 sites,
// we re-score every in-window project with --force so the warm-intro
// flags surface in Notion + the projects.pitch_metadata jsonb.
//
// Usage:
//   pnpm tsx Pathfinder/scripts/backfill-cross-pollination.ts \
//       --limit=200 --force
//   pnpm tsx Pathfinder/scripts/backfill-cross-pollination.ts \
//       --limit=10 --dry-run
//   pnpm tsx Pathfinder/scripts/backfill-cross-pollination.ts \
//       --limit=50 --skip-notion
//
// Env:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (.env*)
//   NOTION_API_TOKEN — set when --skip-notion is NOT passed

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { reevaluateCrossPollination } from '../lib/adapters/zedcor/cross-pollination';
import { updateProjectPitchBySignature } from '../lib/notion/zedcor-writer';

dotenvConfig({ path: '.env.production.local' });
dotenvConfig({ path: '.env.local' });
dotenvConfig();

const flags = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');
const force = flags.includes('--force');
const skipNotion = flags.includes('--skip-notion');
const limit = flagInt(flags, '--limit') ?? 200;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  db: { schema: 'pathfinder' },
  auth: { persistSession: false, autoRefreshToken: false },
});

function flagInt(args: string[], name: string): number | null {
  const direct = args.indexOf(name);
  if (direct >= 0 && direct + 1 < args.length) {
    const n = parseInt(args[direct + 1], 10);
    if (Number.isFinite(n)) return n;
  }
  const inline = args.find((a) => a.startsWith(`${name}=`));
  if (inline) {
    const n = parseInt(inline.split('=', 2)[1], 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

interface ProjectRow {
  id: string;
  source: string;
  source_id: string;
  gc_metadata: Record<string, unknown> | null;
  pitch_metadata: Record<string, unknown> | null;
  buy_window_open: boolean | null;
}

function readGcName(p: ProjectRow): string | null {
  const m = p.gc_metadata;
  if (m && typeof m === 'object') {
    const v = (m as Record<string, unknown>).gc_name;
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function readExistingCrossPoll(p: ProjectRow): {
  cross_pollination: string | null;
  matched_customer: string | null;
} {
  const m = p.pitch_metadata;
  if (!m || typeof m !== 'object') return { cross_pollination: null, matched_customer: null };
  const r = m as Record<string, unknown>;
  return {
    cross_pollination: typeof r.cross_pollination === 'string' ? r.cross_pollination : null,
    matched_customer: typeof r.matched_customer === 'string' ? r.matched_customer : null,
  };
}

async function loadInWindowProjectsWithGc(): Promise<ProjectRow[]> {
  const rows: ProjectRow[] = [];
  const PAGE = 500;
  let offset = 0;
  // Prefer in-window leads (buy_window_open = true). When the column hasn't
  // been backfilled yet we fall back to any project with gc_metadata; the
  // engine is idempotent so re-running over a wider set is safe.
  for (;;) {
    const { data, error } = await supabase
      .from('projects')
      .select('id, source, source_id, gc_metadata, pitch_metadata, buy_window_open')
      .not('gc_metadata', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`projects read failed: ${error.message}`);
    const page = data as ProjectRow[] | null;
    if (!page || page.length === 0) break;
    for (const p of page) {
      if (limit > 0 && rows.length >= limit * 4) break; // hard ceiling on scan
      if (!readGcName(p)) continue;
      // Prefer in-window when the column is populated; otherwise accept all.
      if (p.buy_window_open === false) continue;
      rows.push(p);
    }
    if (page.length < PAGE) break;
    if (limit > 0 && rows.length >= limit * 4) break;
    offset += PAGE;
  }
  return rows.slice(0, limit > 0 ? limit : rows.length);
}

interface Summary {
  scanned: number;
  changed: number;
  warm_intro_gained: number;
  notion_updates: number;
  notion_skipped_no_page: number;
  errors: string[];
}

async function main() {
  console.log(
    `▸ backfill-cross-pollination dryRun=${dryRun} force=${force} ` +
    `limit=${limit} skipNotion=${skipNotion}`,
  );

  const projects = await loadInWindowProjectsWithGc();
  console.log(`▸ candidate in-window projects: ${projects.length}`);

  const summary: Summary = {
    scanned: 0,
    changed: 0,
    warm_intro_gained: 0,
    notion_updates: 0,
    notion_skipped_no_page: 0,
    errors: [],
  };

  for (const p of projects) {
    summary.scanned += 1;
    const gcName = readGcName(p);
    const existing = readExistingCrossPoll(p);

    let result;
    try {
      result = await reevaluateCrossPollination({
        gcName,
        supabase,
        existingCrossPollination: existing.cross_pollination,
        existingMatchedCustomer: existing.matched_customer,
        force,
      });
    } catch (err) {
      summary.errors.push(`${p.id}: ${(err as Error).message}`);
      continue;
    }

    if (!result.changed) continue;
    summary.changed += 1;
    if (result.warm_intro_gained) summary.warm_intro_gained += 1;

    if (dryRun) continue;

    // Merge into pitch_metadata jsonb.
    const merged: Record<string, unknown> = {
      ...(p.pitch_metadata ?? {}),
      cross_pollination: result.cross_pollination,
      warm_intro_path: result.warm_intro_path,
      matched_customer: result.matched_customer,
      cross_pollination_confidence: result.confidence,
      possible_cross_pollination: result.possible_cross_pollination,
      cross_pollination_reevaluated_at: new Date().toISOString(),
    };

    const { error: upErr } = await supabase
      .from('projects')
      .update({ pitch_metadata: merged })
      .eq('id', p.id);
    if (upErr) {
      summary.errors.push(`${p.id} pitch_metadata update: ${upErr.message}`);
      continue;
    }

    if (skipNotion) continue;

    try {
      const pitchInput = {
        cross_pollination: result.cross_pollination,
        warm_intro_path: result.warm_intro_path,
        pitch_hooks: extractStringArray(p.pitch_metadata, 'pitch_hooks'),
        recommended_action: extractString(p.pitch_metadata, 'recommended_action'),
        action_by_date: extractString(p.pitch_metadata, 'action_by_date'),
      };
      const updated = await updateProjectPitchBySignature({
        source: p.source,
        source_id: p.source_id,
        pitch: pitchInput,
      });
      if (updated) summary.notion_updates += 1;
      else summary.notion_skipped_no_page += 1;
    } catch (err) {
      summary.errors.push(`${p.id} notion update: ${(err as Error).message}`);
    }
  }

  console.log('▸ backfill summary');
  console.log(`  scanned:             ${summary.scanned}`);
  console.log(`  changed:             ${summary.changed}`);
  console.log(`  warm intros gained:  ${summary.warm_intro_gained}`);
  console.log(`  notion updates:      ${summary.notion_updates}`);
  console.log(`  notion no-page:      ${summary.notion_skipped_no_page}`);
  if (summary.errors.length > 0) {
    console.error(`▸ ${summary.errors.length} errors:`);
    for (const e of summary.errors.slice(0, 20)) console.error(`  - ${e}`);
    if (summary.errors.length > 20) console.error(`  ... and ${summary.errors.length - 20} more`);
  }

  if (!dryRun && summary.warm_intro_gained < 10) {
    console.warn(
      `▸ WARN — warm intros gained ${summary.warm_intro_gained} < 10 ` +
      `(spec acceptance §3 expects ≥10). Either gc_name coverage is too thin ` +
      `or the customer corpus doesn't overlap with the in-window GC set.`,
    );
  }
  console.log('▸ done');
}

function extractStringArray(m: Record<string, unknown> | null, key: string): string[] | null {
  if (!m) return null;
  const v = m[key];
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[];
  return null;
}

function extractString(m: Record<string, unknown> | null, key: string): string | null {
  if (!m) return null;
  const v = m[key];
  return typeof v === 'string' ? v : null;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
