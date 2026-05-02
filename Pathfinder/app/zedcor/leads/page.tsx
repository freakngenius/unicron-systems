// Z-C feature #14 — Zedcor lead list view.
//
// Sortable, branch-filterable table of projects scored against the Zedcor
// branch network. Pulls projects with non-null score (i.e. ranked) ordered
// by score desc + ingested_at desc, joined to their nearest_zedcor_branch.

import { ZedcorLeadList, type LeadListBranch, type LeadListRow } from '@/components/zedcor/ZedcorLeadList';
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
}

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
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
        'id, title, score, project_value, project_stage, source, ingested_at, nearest_zedcor_branch_id, zedcor_distance_miles',
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
    };
  });

  return { rows, branches, loadError: null };
}

export default async function ZedcorLeadsPage() {
  const { rows, branches, loadError } = await fetchData();
  return <ZedcorLeadList initialRows={rows} branches={branches} loadError={loadError} />;
}
