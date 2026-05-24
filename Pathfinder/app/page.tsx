// Main dashboard route. Server component: fetches initial Branch / Customer / Project
// rows + cross-pollination matches from Supabase and hands them to the
// <Dashboard /> client component, which owns all interaction state.

import { Dashboard } from '@/components/dashboard';
import { supabase } from '@/lib/supabase';
import type { Branch, CrossPollMatch, Customer, Project } from '@/lib/types';
import { fetchCrossPollMatches } from '@/lib/cross-poll-fetch';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Resolve the Zedcor organization UUID at request time. Cached for the
 * lifetime of the server process. */
let _zedcorOrgIdCache: string | null | undefined;
async function getZedcorOrgId(): Promise<string | null> {
  if (_zedcorOrgIdCache !== undefined) return _zedcorOrgIdCache;
  const { data } = await (supabase
    .from('organizations') as ReturnType<typeof supabase.from>)
    .select('id')
    .eq('slug', 'zedcor')
    .maybeSingle();
  const row = data as { id?: string } | null;
  _zedcorOrgIdCache = row?.id ?? null;
  return _zedcorOrgIdCache;
}

// Sources written by orgs other than Zedcor (funder, internal, etc.). The
// multi-tenant refactor added organization_id to pathfinder.projects, but
// older rows have organization_id = NULL. We filter these source prefixes
// belt-and-suspenders so non-Zedcor rows never pollute the dashboard.
const NON_ZEDCOR_SOURCE_PREFIXES = [
  'custom-ea-forum',
  'custom-propublica',
  'custom-philanthropy',
  'custom-funder-',
  'custom-sos-business',
  'custom-construction-sales-job',
  'synthetic-portfolio',
];

async function fetchInitialData(): Promise<{
  branches: Branch[];
  customers: Customer[];
  projects: Project[];
  crossPollMatches: CrossPollMatch[];
}> {
  // Run in parallel — four independent reads. The cross-poll fetch reads
  // `pathfinder.lead_cross_pollination` joined with `zedcor_customer_sites`
  // for a representative customer lat/lon (Path B in the Gate 2 plan) so
  // the dashboard's warm-intro overlay can render Zedcor contractor
  // matches without routing through the multi-tenant `customers` table.
  //
  // Scope projects to Zedcor's org only. Without this, EA Forum articles,
  // 990 filings, and other non-Zedcor rows from the funder + internal
  // pipelines pollute the Zedcor dashboard.
  const zedcorOrgId = await getZedcorOrgId();

  let projectsQuery = supabase
    .from('projects')
    .select('*')
    .order('score', { ascending: false, nullsFirst: false })
    .order('ingested_at', { ascending: false });

  // Allow Zedcor's rows + legacy rows where organization_id was never set.
  if (zedcorOrgId) {
    projectsQuery = projectsQuery.or(
      `organization_id.eq.${zedcorOrgId},organization_id.is.null`,
    );
  }
  // Exclude rows whose source slug matches a known non-Zedcor prefix.
  for (const prefix of NON_ZEDCOR_SOURCE_PREFIXES) {
    projectsQuery = projectsQuery.not('source', 'ilike', `${prefix}%`);
  }

  const [branchesRes, customersRes, projectsRes, crossPollMatches] = await Promise.all([
    supabase.from('branches').select('*').order('code', { ascending: true }),
    supabase.from('customers').select('*').order('id', { ascending: true }),
    projectsQuery,
    fetchCrossPollMatches(supabase),
  ]);

  return {
    branches: (branchesRes.data ?? []) as Branch[],
    customers: (customersRes.data ?? []) as Customer[],
    projects: (projectsRes.data ?? []) as Project[],
    crossPollMatches,
  };
}

export default async function HomePage() {
  const { branches, customers, projects, crossPollMatches } = await fetchInitialData();

  // Demo Polish UX § Gate 7A flag — when on, opening a project from the
  // dashboard map / list / kanban routes to the redesigned lead detail
  // page (`/leads/[projectId]`) instead of the legacy ProjectModal
  // overlay. Read here at the server-component boundary so the flag is
  // re-checked per request and the client-side Dashboard receives a
  // boolean (env vars don't cross the client boundary unless prefixed
  // with NEXT_PUBLIC_, which we deliberately don't do for this rollout
  // toggle).
  const redesignEnabled = process.env.LEAD_DETAIL_REDESIGN === '1';

  return (
    <Dashboard
      initialBranches={branches}
      initialCustomers={customers}
      initialProjects={projects}
      initialCrossPollMatches={crossPollMatches}
      redesignEnabled={redesignEnabled}
    />
  );
}
