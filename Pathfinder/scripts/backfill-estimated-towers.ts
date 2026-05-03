// scripts/backfill-estimated-towers.ts — Demo Polish UX Gate 11E.
//
// One-shot backfill that runs the tower estimator against the top-N
// ranked leads and persists the result to
// pathfinder.projects.estimated_towers_count + estimated_towers_rationale.
//
// Default top-50 (matches the contact-enricher cron's selection).
// Override via env: TOWER_BACKFILL_LIMIT=200.
// Override scope via env: TOWER_BACKFILL_PROJECT_IDS=id1,id2,id3 (csv).
//
// Idempotency: re-runs overwrite both columns. Skips projects that
// already have a non-null `estimated_towers_count` UNLESS
// TOWER_BACKFILL_FORCE=1 is set (re-runs everything).
//
// Usage (from inside Pathfinder/):
//   pnpm tsx scripts/backfill-estimated-towers.ts
//
// Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY +
//      ANTHROPIC_API_KEY.

import 'dotenv/config';

import {
  estimateTowers,
  type TowerEstimatorInput,
} from '@/services/tower-estimator/agent';
import { supabaseAdmin } from '@/lib/supabase';

interface ProjectRow {
  id: string;
  title: string;
  project_value: number | null;
  summary: string | null;
  description_long: string | null;
  naics_code: string | null;
  naics_description: string | null;
  lot_size_acres: number | null;
  location_text: string | null;
  estimated_towers_count: string | null;
}

const LIMIT = Number(process.env.TOWER_BACKFILL_LIMIT ?? 50);
const FORCE = process.env.TOWER_BACKFILL_FORCE === '1';
const SCOPE_IDS = (process.env.TOWER_BACKFILL_PROJECT_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function loadCandidates(): Promise<ProjectRow[]> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        in: (col: string, vals: string[]) => Promise<{ data: ProjectRow[] | null; error: { message: string } | null }>;
        order: (col: string, opts: { ascending: boolean; nullsFirst?: boolean }) => {
          limit: (n: number) => Promise<{ data: ProjectRow[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const cols =
    'id, title, project_value, summary, description_long, naics_code, naics_description, lot_size_acres, location_text, estimated_towers_count';
  if (SCOPE_IDS.length > 0) {
    const { data, error } = await sb.from('projects').select(cols).in('id', SCOPE_IDS);
    if (error) throw new Error(`projects select failed: ${error.message}`);
    return data ?? [];
  }
  const { data, error } = await sb
    .from('projects')
    .select(cols)
    .order('score', { ascending: false, nullsFirst: false })
    .limit(LIMIT);
  if (error) throw new Error(`projects select failed: ${error.message}`);
  return data ?? [];
}

async function persist(
  projectId: string,
  result: { count: number | string; rationale: string },
): Promise<void> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, v: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  const { error } = await sb
    .from('projects')
    .update({
      estimated_towers_count: String(result.count),
      estimated_towers_rationale: result.rationale,
    })
    .eq('id', projectId);
  if (error) throw new Error(`update failed: ${error.message}`);
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const candidates = await loadCandidates();
  console.log(
    `Tower-estimator backfill — ${candidates.length} candidate${candidates.length === 1 ? '' : 's'} (limit=${LIMIT}, force=${FORCE}, scope=${SCOPE_IDS.length || 'top-N'}).`,
  );

  let touched = 0;
  let skipped = 0;
  const errors: Array<{ id: string; message: string }> = [];

  for (const row of candidates) {
    if (!FORCE && row.estimated_towers_count != null) {
      skipped += 1;
      continue;
    }
    const input: TowerEstimatorInput = {
      project: {
        id: row.id,
        title: row.title,
        project_value: row.project_value,
        description_long: row.description_long,
        summary: row.summary,
        naics_code: row.naics_code,
        naics_description: row.naics_description,
        lot_size_acres: row.lot_size_acres,
        location_text: row.location_text,
        sites_count: null,
        perimeter_feet: null,
      },
    };
    try {
      const result = await estimateTowers(input);
      await persist(row.id, result);
      touched += 1;
      console.log(`  ${row.id} → ${result.count}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ id: row.id, message });
      console.warn(`  ${row.id} FAILED: ${message}`);
    }
  }

  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('');
  console.log('Backfill complete.');
  console.log(`  duration : ${seconds}s`);
  console.log(`  updated  : ${touched}`);
  console.log(`  skipped  : ${skipped} (already populated; re-run with TOWER_BACKFILL_FORCE=1)`);
  if (errors.length > 0) {
    console.log(`  errors   : ${errors.length}`);
    for (const e of errors.slice(0, 20)) console.log(`    - ${e.id}: ${e.message}`);
  }
}

void main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
