// scripts/backfill-cross-pollination.ts
//
// Sprint Z12 — One-shot backfill that re-runs cross-pollination against
// every Zedcor project with a populated gc_name and writes the result
// into pathfinder.projects.cross_pollination_metadata. The Z12 engine
// now gates fuzzy-matching on a construction-keyword filter, so this
// pass also clears stale federal-product matches from prior backfills.
//
// What this writes (per row):
//   pitch_metadata.cross_pollination       (jsonb merge — additive)
//     {
//       cross_pollination: <string>,           // human-readable summary
//       warm_intro_path: <string|null>,        // null when no warm intro
//       matched_customer: <string|null>,       // canonical name when ≥0.8
//       confidence: <number>,                  // 0..1
//       possible_cross_pollination: <array>,   // 0.6..0.8 band
//       resolved_at: <iso8601>,
//     }
//
// The full pitch_metadata jsonb is preserved; only the `cross_pollination`
// key is overwritten. Other pitch_metadata keys (pitch_hooks,
// recommended_action, action_by_date, type_tags) are left intact.
//
// Acceptance criterion #4 verification at end of run:
//   ≥3 warm intros (confidence ≥ 0.8) against Texas construction GCs.
//   Zero matches against federal product contracts.
//
// Usage:
//   pnpm tsx scripts/backfill-cross-pollination.ts --limit=500 --force
//
// Flags:
//   --limit=N   cap rows scanned (default 500)
//   --force     re-resolve rows that already have cross_pollination_metadata
//   --dry-run   log only; never UPDATE
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { config as dotenvConfig } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveCrossPollination } from '../lib/adapters/zedcor/cross-pollination';

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

const flags = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');
const force = flags.includes('--force');
const limitFlag = flags.find((f) => f.startsWith('--limit='));
const limit = limitFlag ? Number(limitFlag.split('=')[1]) : DEFAULT_LIMIT;
if (!Number.isFinite(limit) || limit <= 0) {
  console.error(`Invalid --limit value: ${limitFlag}`);
  process.exit(1);
}

const supabase: SupabaseClient = createClient(url, serviceKey, {
  db: { schema: 'pathfinder' },
  auth: { persistSession: false, autoRefreshToken: false },
});

interface ProjectRow {
  id: string;
  title: string;
  summary: string | null;
  source: string;
  source_id: string;
  gc_metadata: Record<string, unknown> | null;
  pitch_metadata: Record<string, unknown> | null;
}

async function loadCandidates(): Promise<ProjectRow[]> {
  const q = supabase
    .from('projects')
    .select('id, title, summary, source, source_id, gc_metadata, pitch_metadata')
    .eq('organization_id', ZEDCOR_ORG_ID)
    .not('gc_metadata->gc_name', 'is', null)
    .order('posted_date', { ascending: false, nullsFirst: false })
    .limit(limit);
  const { data, error } = await q;
  if (error) throw new Error(`load candidates failed: ${error.message}`);
  const rows = (data ?? []) as ProjectRow[];
  if (force) return rows;
  return rows.filter((r) => {
    const existing = r.pitch_metadata?.['cross_pollination'];
    return existing === undefined || existing === null;
  });
}

async function main(): Promise<void> {
  const rows = await loadCandidates();
  console.log(`scanning ${rows.length} Zedcor projects with gc_name set (force=${force}, dry-run=${dryRun})`);

  let warmIntros = 0;
  let coldOutreach = 0;
  let gateSkipped = 0;
  let failures = 0;
  const warmExamples: Array<{ id: string; title: string; matched_customer: string; confidence: number }> = [];
  const federalMatches: Array<{ id: string; title: string; matched_customer: string }> = [];

  for (const p of rows) {
    const gcName = (p.gc_metadata?.['gc_name'] as string | null) ?? null;
    try {
      const cp = await resolveCrossPollination({
        gcName,
        supabase,
        projectTitle: p.title,
        projectSummary: p.summary,
      });
      const isFederalProduct =
        /\b(coffee|lens|lenses|dental|medical|laundry|janitorial|food\s+service|uniform|press)\b/i.test(p.title);
      if (cp.warm_intro_path && cp.confidence >= 0.8) {
        warmIntros += 1;
        if (warmExamples.length < 5) {
          warmExamples.push({
            id: p.id,
            title: p.title.slice(0, 80),
            matched_customer: cp.matched_customer ?? '(none)',
            confidence: cp.confidence,
          });
        }
        if (isFederalProduct) {
          federalMatches.push({
            id: p.id,
            title: p.title.slice(0, 80),
            matched_customer: cp.matched_customer ?? '(none)',
          });
        }
      } else if (cp.cross_pollination?.startsWith('Skipped')) {
        gateSkipped += 1;
      } else {
        coldOutreach += 1;
      }
      if (!dryRun) {
        const merged = {
          ...(p.pitch_metadata ?? {}),
          cross_pollination: { ...cp, resolved_at: new Date().toISOString() },
        };
        const { error } = await supabase
          .from('projects')
          .update({ pitch_metadata: merged })
          .eq('id', p.id);
        if (error) {
          failures += 1;
          console.error(`  update failed for ${p.id}: ${error.message}`);
        }
      }
    } catch (err) {
      failures += 1;
      console.error(`  resolve failed for ${p.id}: ${(err as Error).message}`);
    }
  }

  console.log('---');
  console.log(`warm intros (confidence ≥ 0.8) : ${warmIntros}`);
  console.log(`cold outreach                  : ${coldOutreach}`);
  console.log(`gate-skipped (non-construction): ${gateSkipped}`);
  console.log(`failures                       : ${failures}`);
  console.log('warm-intro examples (up to 5):');
  for (const e of warmExamples) {
    console.log(`  ${e.id} :: conf=${e.confidence} :: matched=${e.matched_customer} :: ${e.title}`);
  }
  if (federalMatches.length > 0) {
    console.log('WARNING — warm intros against federal-product titles (regression check):');
    for (const e of federalMatches) {
      console.log(`  ${e.id} :: matched=${e.matched_customer} :: ${e.title}`);
    }
  } else {
    console.log('regression check: 0 warm intros against federal-product titles ✓');
  }
}

void main().then(() => process.exit(0)).catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
