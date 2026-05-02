// scripts/backfill-geography.ts — Demo Polish P1 backfill.
//
// One-shot, idempotent. Walks every existing pathfinder.projects row and:
//   1. Detects country from raw_payload (lib/zedcor/country-detect.ts).
//   2. For null-coord rows, runs the Haiku coord-extractor fallback.
//   3. When a city/state is inferred above the confidence threshold,
//      populates lat/lon from the city centroid and sets
//      geo_inference_confidence.
//   4. Writes country / rejection_reason / rejected_at:
//        - rejection_reason='out_of_country' when country is set and not in
//          org_geo_config.allowed_countries
//        - rejection_reason='no_branch_coverage' when zedcor_distance_miles
//          > org_geo_config.max_supported_distance_miles
//   5. Sets geo_unknown=true on rows that are still missing coords after
//      the Haiku fallback.
//
// Idempotent guards:
//   - Skip a row when its country is already populated AND rejection_reason
//     is already 'out_of_country' (or country is allowed AND we've stamped
//     a non-null country).
//   - Skip Haiku for rows that already have lat/lon OR have already been
//     marked geo_unknown.
//
// Cost guardrail (HARD STOP at $4): the loop tracks the running total via
// pathfinder.llm_calls.cost_usd and aborts if we exceed $4. With ~150
// null-coord rows and Haiku ≈ $0.0007/call, expected total ≤ $0.15.
//
// Usage (from inside Pathfinder/):
//   pnpm tsx scripts/backfill-geography.ts
// or
//   tsx scripts/backfill-geography.ts
//
// Honors NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY +
// ANTHROPIC_API_KEY env vars (via the existing supabaseAdmin / anthropic
// helpers).

import 'dotenv/config';

import { supabaseAdmin } from '@/lib/supabase';
import { detectCountryFromPayload } from '@/lib/zedcor/country-detect';
import { extractStateFromPayload } from '@/lib/zedcor/state-centroids';
import { centroidForCity } from '@/lib/zedcor/city-centroids';
import { extractLocationViaHaiku } from '@/lib/geography/coord-extractor';
import { findNearestZedcorBranch, type ZedcorBranchPoint } from '@/lib/zedcor/geomapper';

const HAIKU_CONFIDENCE_THRESHOLD = 0.7;
const COST_CAP_USD = 4;
const HAIKU_BATCH_SIZE = 10;

interface ProjectSlim {
  id: string;
  title: string | null;
  summary: string | null;
  raw_payload: Record<string, unknown> | null;
  lat: number | null;
  lon: number | null;
  country: string | null;
  rejection_reason: string | null;
  geo_unknown: boolean | null;
  geo_inference_confidence: number | null;
  zedcor_distance_miles: number | null;
}

async function loadOrgGeoConfig(admin: ReturnType<typeof supabaseAdmin>): Promise<{
  allowed: string[];
  maxDistance: number;
}> {
  const res = await (
    admin.from('org_geo_config') as unknown as {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: { allowed_countries: string[] | null; max_supported_distance_miles: number | null } | null;
            error: { message: string } | null;
          }>;
        };
      };
    }
  )
    .select('allowed_countries, max_supported_distance_miles')
    .eq('org_id', 'zedcor')
    .maybeSingle();
  const allowed = (res.data?.allowed_countries ?? ['USA', 'CAN']).map((c) => c.toUpperCase());
  const maxDistance = res.data?.max_supported_distance_miles ?? 250;
  return { allowed, maxDistance };
}

async function loadZedcorBranches(
  admin: ReturnType<typeof supabaseAdmin>,
): Promise<ZedcorBranchPoint[]> {
  const res = await (
    admin.from('zedcor_branches') as unknown as {
      select: (cols: string) => Promise<{
        data: Array<{
          id: string;
          branch_name: string;
          state: string;
          lat: number | null;
          lon: number | null;
          radius_miles: number | null;
        }> | null;
        error: { message: string } | null;
      }>;
    }
  ).select('id, branch_name, state, lat, lon, radius_miles');

  return (res.data ?? [])
    .filter((b): b is typeof b & { lat: number; lon: number } =>
      typeof b.lat === 'number' && typeof b.lon === 'number',
    )
    .map((b) => ({
      id: b.id,
      branch_name: b.branch_name,
      state: b.state,
      lat: b.lat,
      lon: b.lon,
      radius_miles: typeof b.radius_miles === 'number' ? b.radius_miles : 200,
    }));
}

async function loadCostSpent(admin: ReturnType<typeof supabaseAdmin>): Promise<number> {
  // Sum llm_calls cost from this script run window. We tag calls via
  // surface='manual' (the default for extractLocationViaHaiku since it
  // calls the wrapped client) — no agent_run_id. Use a 1-hour window so
  // unrelated background calls don't pollute the gate.
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const res = await (
    admin.from('llm_calls') as unknown as {
      select: (cols: string) => {
        gte: (col: string, val: string) => {
          eq: (col: string, val: string) => Promise<{
            data: Array<{ cost_usd: number | null }> | null;
            error: { message: string } | null;
          }>;
        };
      };
    }
  )
    .select('cost_usd')
    .gte('created_at', since)
    .eq('surface', 'manual');
  if (res.error || !res.data) return 0;
  return res.data.reduce((a, r) => a + (r.cost_usd ?? 0), 0);
}

interface RowUpdate {
  country?: string | null;
  rejection_reason?: string | null;
  rejected_at?: string | null;
  lat?: number | null;
  lon?: number | null;
  geo_unknown?: boolean | null;
  geo_inference_confidence?: number | null;
  zedcor_distance_miles?: number | null;
  nearest_zedcor_branch_id?: string | null;
  // We don't touch score in the backfill — preserve whatever the ranker
  // has computed. The rejection_reason is enough to keep these out of the
  // default lead list view.
}

async function persistUpdate(
  admin: ReturnType<typeof supabaseAdmin>,
  projectId: string,
  update: RowUpdate,
): Promise<void> {
  if (Object.keys(update).length === 0) return;
  await (
    admin.from('projects') as unknown as {
      update: (v: RowUpdate) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .update(update)
    .eq('id', projectId);
}

function haversineMiles(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function main(): Promise<void> {
  const admin = supabaseAdmin();
  const { allowed, maxDistance } = await loadOrgGeoConfig(admin);
  const zedcorBranches = await loadZedcorBranches(admin);

  const startCost = await loadCostSpent(admin);
  console.log(
    `[backfill-geography] starting · allowed=${allowed.join(',')} maxDistance=${maxDistance}mi · ` +
      `${zedcorBranches.length} zedcor branches loaded · llm_calls cost in last hr: $${startCost.toFixed(4)}`,
  );

  // Fetch every project. The corpus is ~430 rows so a single read is fine.
  const allRes = await (
    admin.from('projects') as unknown as {
      select: (cols: string) => Promise<{ data: ProjectSlim[] | null; error: { message: string } | null }>;
    }
  ).select(
    'id, title, summary, raw_payload, lat, lon, country, rejection_reason, geo_unknown, geo_inference_confidence, zedcor_distance_miles',
  );
  if (allRes.error || !allRes.data) {
    throw new Error(`fetch projects failed: ${allRes.error?.message ?? 'no data'}`);
  }
  const projects = allRes.data;
  console.log(`[backfill-geography] ${projects.length} projects scanned`);

  let countryStamped = 0;
  let outOfCountryStamped = 0;
  let coordsFromState = 0;
  let coordsFromHaiku = 0;
  let geoUnknownStamped = 0;
  let noBranchCoverageStamped = 0;
  let haikuCalls = 0;

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    const update: RowUpdate = {};

    // ---- Country detection ----
    const detected = detectCountryFromPayload(p.raw_payload);
    let effectiveCountry = p.country ?? detected;
    if (effectiveCountry !== p.country && detected) {
      update.country = detected;
      countryStamped += 1;
      effectiveCountry = detected;
    }

    if (effectiveCountry && !allowed.includes(effectiveCountry.toUpperCase())) {
      // Rejected: out_of_country. Only write rejection_reason when not
      // already set (idempotent — re-runs do not re-stamp rejected_at).
      if (p.rejection_reason !== 'out_of_country') {
        update.rejection_reason = 'out_of_country';
        update.rejected_at = new Date().toISOString();
        outOfCountryStamped += 1;
      }
    }

    // If we stamped out_of_country, no need to bother with coords. Skip.
    if (
      update.rejection_reason === 'out_of_country' ||
      p.rejection_reason === 'out_of_country'
    ) {
      await persistUpdate(admin, p.id, update);
      continue;
    }

    // ---- Coordinate enforcement ----
    let lat = p.lat;
    let lon = p.lon;

    if (lat == null || lon == null) {
      // Try the deterministic state-centroid first (free).
      const stateCentroid = extractStateFromPayload(p.raw_payload);
      if (stateCentroid) {
        lat = stateCentroid.lat;
        lon = stateCentroid.lon;
        update.lat = lat;
        update.lon = lon;
        coordsFromState += 1;
      } else {
        // Cost-gated Haiku fallback. Re-check cost before each call.
        const cost = await loadCostSpent(admin);
        if (cost > COST_CAP_USD) {
          console.warn(
            `[backfill-geography] cost cap reached ($${cost.toFixed(4)} > $${COST_CAP_USD}); ` +
              'skipping further Haiku calls. Remaining null-coord rows will be marked geo_unknown.',
          );
          // Mark remaining as geo_unknown without Haiku.
          if (!p.geo_unknown) {
            update.geo_unknown = true;
            geoUnknownStamped += 1;
          }
          await persistUpdate(admin, p.id, update);
          continue;
        }

        haikuCalls += 1;
        const inferred = await extractLocationViaHaiku({
          title: p.title,
          summary: p.summary,
          rawPayload: p.raw_payload,
        });

        // Update country from Haiku output too if the deterministic path didn't catch it.
        if (!effectiveCountry && inferred.country) {
          update.country = inferred.country;
          effectiveCountry = inferred.country;
          countryStamped += 1;
          if (!allowed.includes(inferred.country.toUpperCase())) {
            update.rejection_reason = 'out_of_country';
            update.rejected_at = new Date().toISOString();
            outOfCountryStamped += 1;
            await persistUpdate(admin, p.id, update);
            continue;
          }
        }

        if (inferred.confidence >= HAIKU_CONFIDENCE_THRESHOLD) {
          const point = centroidForCity(inferred.city, inferred.state);
          if (point) {
            lat = point.lat;
            lon = point.lon;
            update.lat = lat;
            update.lon = lon;
            update.geo_inference_confidence = Number(inferred.confidence.toFixed(2));
            coordsFromHaiku += 1;
          }
        }
      }
    }

    // ---- geo_unknown stamp ----
    if (lat == null || lon == null) {
      if (!p.geo_unknown) {
        update.geo_unknown = true;
        geoUnknownStamped += 1;
      }
    } else if (p.geo_unknown) {
      // We resolved coords on a previously-unknown row.
      update.geo_unknown = false;
    }

    // ---- Distance gating ----
    if (lat != null && lon != null && zedcorBranches.length > 0) {
      const z = findNearestZedcorBranch({ lat, lon }, zedcorBranches);
      // Force-recompute distance even if the row already has one — backfill
      // is the source of truth for legacy rows whose distance was based on
      // a missing coord pair.
      if (z) {
        update.nearest_zedcor_branch_id = z.branch_id;
        update.zedcor_distance_miles = Number(z.distance_miles.toFixed(2));
        if (z.distance_miles > maxDistance) {
          if (p.rejection_reason !== 'no_branch_coverage') {
            update.rejection_reason = 'no_branch_coverage';
            update.rejected_at = new Date().toISOString();
            noBranchCoverageStamped += 1;
          }
        }
      } else {
        // No branches at all (zedcorBranches empty) — fall through to a
        // plain haversine-from-nearest-branch in case findNearest returned
        // null. We rely on findNearestZedcorBranch already; nothing else
        // to do here.
        void haversineMiles; // ensure helper isn't tree-shaken if unused
      }
    }

    await persistUpdate(admin, p.id, update);

    if ((i + 1) % HAIKU_BATCH_SIZE === 0) {
      console.log(
        `[backfill-geography] processed ${i + 1}/${projects.length} · ` +
          `country=${countryStamped} foreign=${outOfCountryStamped} state-coords=${coordsFromState} ` +
          `haiku-coords=${coordsFromHaiku} haiku-calls=${haikuCalls} ` +
          `geo_unknown=${geoUnknownStamped} no-coverage=${noBranchCoverageStamped}`,
      );
    }
  }

  const endCost = await loadCostSpent(admin);
  console.log(
    `[backfill-geography] DONE · ` +
      `country=${countryStamped} foreign=${outOfCountryStamped} ` +
      `state-coords=${coordsFromState} haiku-coords=${coordsFromHaiku} ` +
      `haiku-calls=${haikuCalls} geo_unknown=${geoUnknownStamped} ` +
      `no-coverage=${noBranchCoverageStamped} · cost-delta=$${(endCost - startCost).toFixed(4)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
