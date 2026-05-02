// Z-C feature #15 — Zedcor branch radius map view.
//
// Server component: pulls all 34 active zedcor_branches and the last 30
// days of projects with non-null coords + a populated nearest_zedcor_branch_id
// (set by lib/zedcor/geomapper.ts via scripts/backfill-zedcor-geo.ts and
// — once Z-C #6 wiring lands in the cron Ranker — at ingest time too).
//
// The actual map (markers, 200mi circles, target-branch highlight) is
// rendered client-side in <ZedcorBranchMap />.

import { ZedcorBranchMap, type ZedcorMapBranch, type ZedcorMapProject } from '@/components/zedcor/ZedcorBranchMap';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = { title: 'Pathfinder · Zedcor branch radius' };

// Tuesday demo's three target branches per `00 - TUESDAY DEMO PLAN.md`.
// "Pittsburgh" is the canonical city name; the seeded zedcor_branches row
// uses branch_name='Pennsylvania' (state-level seed entry per
// lib/zedcor/branch-centroids.ts).
const TARGET_BRANCH_NAMES = new Set(['Nashville', 'Pennsylvania', 'Los Angeles']);

interface ZBranchRow {
  id: string;
  branch_name: string;
  state: string;
  country: string;
  city: string | null;
  lat: number | string | null;
  lon: number | string | null;
  radius_miles: number | null;
  is_active: boolean | null;
}

interface ProjectRow {
  id: string;
  title: string | null;
  score: number | null;
  lat: number | string | null;
  lon: number | string | null;
  nearest_zedcor_branch_id: string | null;
  zedcor_distance_miles: number | string | null;
  ingested_at: string;
}

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchData(): Promise<{
  branches: ZedcorMapBranch[];
  projects: ZedcorMapProject[];
  loadError: string | null;
}> {
  let admin;
  try {
    admin = supabaseAdmin();
  } catch (err) {
    return { branches: [], projects: [], loadError: (err as Error).message };
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [branchesRes, projectsRes] = await Promise.all([
    admin
      .from('zedcor_branches')
      .select('id, branch_name, state, country, city, lat, lon, radius_miles, is_active')
      .eq('is_active', true)
      .order('branch_name', { ascending: true }),
    admin
      .from('projects')
      .select('id, title, score, lat, lon, nearest_zedcor_branch_id, zedcor_distance_miles, ingested_at')
      .not('lat', 'is', null)
      .not('lon', 'is', null)
      .gte('ingested_at', since)
      .limit(2000),
  ]);

  if (branchesRes.error) {
    return { branches: [], projects: [], loadError: branchesRes.error.message };
  }

  const branches: ZedcorMapBranch[] = ((branchesRes.data ?? []) as ZBranchRow[])
    .map((b) => {
      const lat = num(b.lat);
      const lon = num(b.lon);
      if (lat == null || lon == null) return null;
      return {
        id: b.id,
        branch_name: b.branch_name,
        state: b.state,
        country: b.country,
        city: b.city,
        lat,
        lon,
        radius_miles: b.radius_miles ?? 200,
        is_target: TARGET_BRANCH_NAMES.has(b.branch_name),
      };
    })
    .filter((b): b is ZedcorMapBranch => b !== null);

  const projects: ZedcorMapProject[] = ((projectsRes.data ?? []) as ProjectRow[])
    .map((p) => {
      const lat = num(p.lat);
      const lon = num(p.lon);
      if (lat == null || lon == null) return null;
      return {
        id: p.id,
        title: p.title ?? '(untitled)',
        score: p.score,
        lat,
        lon,
        nearest_zedcor_branch_id: p.nearest_zedcor_branch_id,
        distance_miles: num(p.zedcor_distance_miles),
      };
    })
    .filter((p): p is ZedcorMapProject => p !== null);

  return { branches, projects, loadError: null };
}

export default async function ZedcorMapPage() {
  const { branches, projects, loadError } = await fetchData();
  return (
    <ZedcorBranchMap branches={branches} projects={projects} loadError={loadError} />
  );
}
