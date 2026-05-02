// scripts/backfill-project-geo.ts — Z-F integrator backfill.
//
// For every pathfinder.projects row with NULL lat/lon, attempt to derive a
// state-level centroid from raw_payload (USAspending / SAM.gov shapes both
// supported via lib/zedcor/state-centroids.ts) and persist it. Then, for
// every row with valid lat/lon but NULL nearest_zedcor_branch_id, compute
// the nearest Zedcor branch via lib/zedcor/geomapper and write back.
//
// Optional --reset-score flag clears `score` (and ranked_at) on rows we
// touch so the next ranker cycle re-ranks them with the new geo data and
// runs the freshly-wired cross-pollination engine + zedcor proximity
// writes. This is the demo-prep path on the integrator branch.
//
// Usage:
//   pnpm tsx scripts/backfill-project-geo.ts                # write geo + zedcor
//   pnpm tsx scripts/backfill-project-geo.ts --dry-run      # log only
//   pnpm tsx scripts/backfill-project-geo.ts --reset-score  # also nuke score
//
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from
// .env.production.local (preferred) or .env.local. Mirrors the env-loading
// rule used by scripts/seed-zedcor.ts and scripts/backfill-zedcor-geo.ts.

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  findNearestZedcorBranch,
  type ZedcorBranchPoint,
} from '../lib/zedcor/geomapper';
import { extractStateFromPayload } from '../lib/zedcor/state-centroids';

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
const resetScore = flags.includes('--reset-score');

const supabase = createClient(url, serviceKey, {
  db: { schema: 'pathfinder' },
  auth: { persistSession: false, autoRefreshToken: false },
});

interface ProjectRow {
  id: string;
  lat: number | null;
  lon: number | null;
  raw_payload: Record<string, unknown> | null;
  nearest_zedcor_branch_id: string | null;
  zedcor_distance_miles: number | null;
}

async function main(): Promise<void> {
  const branchesRes = await supabase
    .from('zedcor_branches')
    .select('id, branch_name, state, lat, lon, radius_miles');
  if (branchesRes.error) {
    console.error('Failed to load zedcor_branches', branchesRes.error.message);
    process.exit(1);
  }
  const branches: ZedcorBranchPoint[] = (branchesRes.data ?? [])
    .filter((b: { lat: number | null; lon: number | null }) =>
      typeof b.lat === 'number' && typeof b.lon === 'number',
    )
    .map((b: { id: string; branch_name: string; state: string; lat: number; lon: number; radius_miles: number | null }) => ({
      id: b.id,
      branch_name: b.branch_name,
      state: b.state,
      lat: b.lat,
      lon: b.lon,
      radius_miles: typeof b.radius_miles === 'number' ? b.radius_miles : 200,
    }));

  console.log(`Loaded ${branches.length} zedcor branches with coords`);

  // Page through every project row.
  const PAGE = 1000;
  let offset = 0;
  let totalRows = 0;
  let geoWrites = 0;
  let geoSkipsNoState = 0;
  let zedcorWrites = 0;
  let scoreResets = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('projects')
      .select('id, lat, lon, raw_payload, nearest_zedcor_branch_id, zedcor_distance_miles')
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error('Page read failed', error.message);
      process.exit(1);
    }
    const rows = (data ?? []) as ProjectRow[];
    if (rows.length === 0) break;
    totalRows += rows.length;

    for (const row of rows) {
      let lat = row.lat;
      let lon = row.lon;
      let touched = false;

      // Phase 1 — fill missing lat/lon from raw_payload state centroid.
      if (lat == null || lon == null) {
        const c = extractStateFromPayload(row.raw_payload);
        if (c) {
          lat = c.lat;
          lon = c.lon;
          touched = true;
          if (!dryRun) {
            const { error: upErr } = await supabase
              .from('projects')
              .update({ lat, lon })
              .eq('id', row.id);
            if (upErr) {
              console.warn(`  geo update failed ${row.id}: ${upErr.message}`);
              continue;
            }
          }
          geoWrites++;
        } else {
          geoSkipsNoState++;
        }
      }

      // Phase 2 — recompute nearest_zedcor_branch_id whenever we have
      // coords. Also writes when the column is NULL but coords were
      // already populated (e.g. backfilled by Z-C but the Zedcor proximity
      // is empty for some other reason).
      if (lat != null && lon != null) {
        const z = findNearestZedcorBranch({ lat, lon }, branches);
        if (z) {
          const sameZ =
            row.nearest_zedcor_branch_id === z.branch_id &&
            row.zedcor_distance_miles != null &&
            Math.abs(row.zedcor_distance_miles - z.distance_miles) < 0.01;
          if (!sameZ) {
            if (!dryRun) {
              const { error: zErr } = await supabase
                .from('projects')
                .update({
                  nearest_zedcor_branch_id: z.branch_id,
                  zedcor_distance_miles: z.distance_miles,
                })
                .eq('id', row.id);
              if (zErr) {
                console.warn(`  zedcor update failed ${row.id}: ${zErr.message}`);
                continue;
              }
            }
            zedcorWrites++;
            touched = true;
          }
        }
      }

      // Phase 3 — optionally reset score so the ranker re-ranks the row
      // with the freshly-wired cross-pollination + zedcor proximity flow.
      if (resetScore && touched) {
        if (!dryRun) {
          const { error: rsErr } = await supabase
            .from('projects')
            .update({ score: null, ranked_at: null })
            .eq('id', row.id);
          if (rsErr) {
            console.warn(`  score reset failed ${row.id}: ${rsErr.message}`);
            continue;
          }
        }
        scoreResets++;
      }
    }

    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  console.log('---');
  console.log(`Scanned: ${totalRows} projects`);
  console.log(`Geo writes (lat/lon set from payload): ${geoWrites}`);
  console.log(`Geo skips (no state in payload): ${geoSkipsNoState}`);
  console.log(`Zedcor proximity writes: ${zedcorWrites}`);
  if (resetScore) console.log(`Score resets queued for re-rank: ${scoreResets}`);
  if (dryRun) console.log('(dry-run — no writes performed)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
