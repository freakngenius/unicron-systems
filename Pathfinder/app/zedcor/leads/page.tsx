// Z-C feature #14 — Zedcor lead list view.
//
// Sortable, branch-filterable table of projects scored against the Zedcor
// branch network. Pulls projects with non-null score (i.e. ranked) ordered
// by score desc + ingested_at desc, joined to their nearest_zedcor_branch.

import { ZedcorLeadList, type LeadListBranch, type LeadListRow } from '@/components/zedcor/ZedcorLeadList';
import {
  ScoreDistributionWidget,
  type BranchScoreDistribution,
} from '@/components/zedcor/ScoreDistributionWidget';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = { title: 'Pathfinder · Zedcor leads' };

interface ZBranchRow {
  id: string;
  branch_name: string;
  state: string;
}

interface ProjectRow {
  id: string;
  title: string | null;
  score: number | null;
  project_value: number | null;
  project_stage: string | null;
  source: string | null;
  ingested_at: string;
  nearest_zedcor_branch_id: string | null;
  zedcor_distance_miles: number | string | null;
  // Sprint Z3.5 — enrichment fields surfaced in the rep view.
  gc_metadata: Record<string, unknown> | null;
}

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// Z-D #12 demo branches per TUESDAY DEMO PLAN.md item 12. "Pittsburgh"
// is the demo label for the seeded `branch_name='Pennsylvania'` row;
// see lib/zedcor/branch-centroids.ts for the city-resolution table.
const DEMO_BRANCHES: { branch_name: string; state: string; label: string }[] = [
  { branch_name: 'Nashville', state: 'TN', label: 'Nashville, TN' },
  { branch_name: 'Pennsylvania', state: 'PA', label: 'Pittsburgh, PA' },
  { branch_name: 'Los Angeles', state: 'CA', label: 'Los Angeles, CA' },
];

async function fetchScoreDistribution(): Promise<BranchScoreDistribution[]> {
  let admin;
  try {
    admin = supabaseAdmin();
  } catch {
    return DEMO_BRANCHES.map((d) => ({ label: d.label, total: 0, gte90: 0, ge80lt90: 0, lt80: 0 }));
  }

  // 1. Resolve target branch ids.
  const filter = DEMO_BRANCHES.map((d) => `and(branch_name.eq.${d.branch_name},state.eq.${d.state})`).join(',');
  const branchesRes = await admin
    .from('zedcor_branches')
    .select('id, branch_name, state')
    .or(filter);

  type ZBranch = { id: string; branch_name: string; state: string };
  const branchRows = (branchesRes.data ?? []) as ZBranch[];
  const branchById = new Map(branchRows.map((b) => [b.id, b]));
  const ids = branchRows.map((b) => b.id);

  // 2. Pull last-N-day projects scoped to those branches in a single read.
  // Gate 17C — widened from 7 to 30 days so the demo opens with a richer
  // score-distribution count per branch. Only this LIST query widens; the
  // ingestor lookbacks (USASPENDING_LOOKBACK_DAYS / SAMGOV_LOOKBACK_DAYS in
  // lib/ingestor.ts) and slack-alert / briefing windows stay at their
  // original values.
  const LEAD_LIST_LOOKBACK_DAYS = 30;
  const lookbackCutoff = new Date(
    Date.now() - LEAD_LIST_LOOKBACK_DAYS * 24 * 3600 * 1000,
  ).toISOString();
  type Slim = { score: number | null; nearest_zedcor_branch_id: string | null };
  let projects: Slim[] = [];
  if (ids.length > 0) {
    const projRes = await admin
      .from('projects')
      .select('score, nearest_zedcor_branch_id')
      .in('nearest_zedcor_branch_id', ids)
      .gte('ingested_at', lookbackCutoff)
      .limit(5000);
    projects = (projRes.data ?? []) as Slim[];
  }

  return DEMO_BRANCHES.map((d) => {
    const match = branchRows.find((b) => b.branch_name === d.branch_name && b.state === d.state);
    if (!match) {
      return { label: d.label, total: 0, gte90: 0, ge80lt90: 0, lt80: 0 };
    }
    const rows = projects.filter((p) => p.nearest_zedcor_branch_id === match.id);
    let gte90 = 0;
    let ge80lt90 = 0;
    let lt80 = 0;
    for (const r of rows) {
      const s = r.score;
      if (s == null) continue;
      if (s >= 90) gte90++;
      else if (s >= 80) ge80lt90++;
      else lt80++;
    }
    void branchById; // silence unused; kept for potential future expansion.
    return {
      label: d.label,
      total: rows.length,
      gte90,
      ge80lt90,
      lt80,
    };
  });
}

async function fetchData(): Promise<{
  rows: LeadListRow[];
  branches: LeadListBranch[];
  loadError: string | null;
}> {
  let admin;
  try {
    admin = supabaseAdmin();
  } catch (err) {
    return { rows: [], branches: [], loadError: (err as Error).message };
  }

  const [branchesRes, projectsRes] = await Promise.all([
    admin
      .from('zedcor_branches')
      .select('id, branch_name, state')
      .eq('is_active', true)
      .order('branch_name', { ascending: true }),
    admin
      .from('projects')
      .select(
        'id, title, score, project_value, project_stage, source, ingested_at, nearest_zedcor_branch_id, zedcor_distance_miles, gc_metadata',
      )
      .not('score', 'is', null)
      .order('score', { ascending: false, nullsFirst: false })
      .order('ingested_at', { ascending: false })
      .limit(500),
  ]);

  if (branchesRes.error) {
    return { rows: [], branches: [], loadError: branchesRes.error.message };
  }

  const branches: LeadListBranch[] = ((branchesRes.data ?? []) as ZBranchRow[]).map((b) => ({
    id: b.id,
    branch_name: b.branch_name,
    state: b.state,
  }));
  const branchById = new Map(branches.map((b) => [b.id, b]));

  const rows: LeadListRow[] = ((projectsRes.data ?? []) as ProjectRow[]).map((p) => {
    const branch = p.nearest_zedcor_branch_id ? branchById.get(p.nearest_zedcor_branch_id) ?? null : null;
    const gc = (p.gc_metadata ?? {}) as Record<string, unknown>;
    return {
      id: p.id,
      title: p.title ?? '(untitled)',
      score: p.score,
      project_value: p.project_value,
      project_stage: p.project_stage,
      source: p.source,
      ingested_at: p.ingested_at,
      nearest_zedcor_branch_id: p.nearest_zedcor_branch_id,
      branch_name: branch?.branch_name ?? null,
      branch_state: branch?.state ?? null,
      distance_miles: num(p.zedcor_distance_miles),
      gc_name: typeof gc.gc_name === 'string' ? gc.gc_name : null,
      gc_contact_name: typeof gc.gc_contact_name === 'string' ? gc.gc_contact_name : null,
    };
  });

  return { rows, branches, loadError: null };
}

export default async function ZedcorLeadsPage() {
  const [{ rows, branches, loadError }, distribution] = await Promise.all([
    fetchData(),
    fetchScoreDistribution(),
  ]);
  return (
    <>
      <div style={{ background: '#0e1116', padding: '24px 32px 0' }}>
        <ScoreDistributionWidget branches={distribution} />
      </div>
      <ZedcorLeadList initialRows={rows} branches={branches} loadError={loadError} />
    </>
  );
}
