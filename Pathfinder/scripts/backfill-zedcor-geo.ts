// scripts/backfill-zedcor-geo.ts — Z-C feature #6 GeoMapper backfill.
//
// For every row in pathfinder.projects with non-null lat/lon, compute the
// nearest pathfinder.zedcor_branches row (haversine, lib/zedcor/geomapper.ts)
// and write back nearest_zedcor_branch_id + zedcor_distance_miles.
//
// Idempotent — re-running overwrites with the same values. Safe to run
// after re-ingesting projects or after geocoding new branch rows.
//
// Usage:
//   pnpm tsx scripts/backfill-zedcor-geo.ts            # write
//   pnpm tsx scripts/backfill-zedcor-geo.ts --dry-run  # log only
//
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from
// .env.production.local (preferred) or .env.local. Mirrors the env-loading
// rule used by scripts/seed-zedcor.ts.

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  findNearestZedcorBranch,
  type ZedcorBranchPoint,
} from '../lib/zedcor/geomapper';

dotenvConfig({ path: '.env.production.local' });
dotenvConfig({ path: '.env.local' });
dotenvConfig();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
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
  lat: number | null;
  lon: number | null;
  nearest_zedcor_branch_id: string | null;
  zedcor_distance_miles: number | null;
}

interface ZBranchRow {
  id: string;
  branch_name: string;
  state: string;
  lat: number | string | null;
  lon: number | string | null;
  radius_miles: number | null;
  is_active: boolean | null;
}

async function loadBranches(): Promise<ZedcorBranchPoint[]> {
  const { data, error } = await supabase
    .from('zedcor_branches')
    .select('id, branch_name, state, lat, lon, radius_miles, is_active')
    .eq('is_active', true);
  if (error) throw new Error(`zedcor_branches read failed: ${error.message}`);
  const rows = (data ?? []) as ZBranchRow[];
  const out: ZedcorBranchPoint[] = [];
  for (const r of rows) {
    if (r.lat == null || r.lon == null) continue;
    const lat = typeof r.lat === 'string' ? Number.parseFloat(r.lat) : r.lat;
    const lon = typeof r.lon === 'string' ? Number.parseFloat(r.lon) : r.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({
      id: r.id,
      branch_name: r.branch_name,
      state: r.state,
      lat,
      lon,
      radius_miles: r.radius_miles ?? 200,
    });
  }
  return out;
}

async function loadProjects(): Promise<ProjectRow[]> {
  // Pull projects with lat/lon set. Pagination so we don't blow past the
  // 1000-row Supabase default. Most installs have a few hundred rows so
  // a single 5k page is plenty for now.
  const { data, error } = await supabase
    .from('projects')
    .select('id, lat, lon, nearest_zedcor_branch_id, zedcor_distance_miles')
    .not('lat', 'is', null)
    .not('lon', 'is', null)
    .limit(5000);
  if (error) throw new Error(`projects read failed: ${error.message}`);
  return (data ?? []) as ProjectRow[];
}

async function main(): Promise<void> {
  const [branches, projects] = await Promise.all([loadBranches(), loadProjects()]);
  console.log(
    `Loaded ${branches.length} active zedcor_branches, ${projects.length} projects with coords.`,
  );
  if (branches.length === 0) {
    console.error('No active zedcor_branches with coords — aborting.');
    process.exit(1);
  }

  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  let writeErrors = 0;
  const sample: Array<{ project_id: string; branch_name: string; distance_miles: number }> = [];

  for (const p of projects) {
    if (p.lat == null || p.lon == null) {
      skipped++;
      continue;
    }
    const lat = typeof p.lat === 'string' ? Number.parseFloat(p.lat as unknown as string) : p.lat;
    const lon = typeof p.lon === 'string' ? Number.parseFloat(p.lon as unknown as string) : p.lon;
    const result = findNearestZedcorBranch({ lat, lon }, branches);
    if (!result) {
      skipped++;
      continue;
    }

    if (sample.length < 5) {
      sample.push({
        project_id: p.id,
        branch_name: result.branch_name,
        distance_miles: result.distance_miles,
      });
    }

    const sameBranch = p.nearest_zedcor_branch_id === result.branch_id;
    const sameDist =
      p.zedcor_distance_miles != null &&
      Math.abs(Number(p.zedcor_distance_miles) - result.distance_miles) < 0.01;
    if (sameBranch && sameDist) {
      unchanged++;
      continue;
    }

    if (dryRun) {
      updated++;
      continue;
    }

    const { error } = await supabase
      .from('projects')
      .update({
        nearest_zedcor_branch_id: result.branch_id,
        zedcor_distance_miles: result.distance_miles,
      })
      .eq('id', p.id);
    if (error) {
      writeErrors++;
      console.error(`update failed for project ${p.id}: ${error.message}`);
      continue;
    }
    updated++;
  }

  console.log(
    `Done. updated=${updated} unchanged=${unchanged} skipped=${skipped} writeErrors=${writeErrors}${dryRun ? ' (dry-run)' : ''}`,
  );
  if (sample.length) {
    console.log('Sample writes:');
    for (const s of sample) {
      console.log(`  project ${s.project_id} → ${s.branch_name} (${s.distance_miles}mi)`);
    }
  }
  if (writeErrors > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
