// Main dashboard route. Server component: fetches initial Branch / Customer / Project
// rows + cross-pollination matches from Supabase and hands them to the
// <Dashboard /> client component, which owns all interaction state.

import { Dashboard } from '@/components/dashboard';
import { supabase } from '@/lib/supabase';
import type { Branch, CrossPollMatch, Customer, Project } from '@/lib/types';
import { fetchCrossPollMatches } from '@/lib/cross-poll-fetch';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
  const [branchesRes, customersRes, projectsRes, crossPollMatches] = await Promise.all([
    supabase.from('branches').select('*').order('code', { ascending: true }),
    supabase.from('customers').select('*').order('id', { ascending: true }),
    supabase
      .from('projects')
      .select('*')
      .order('score', { ascending: false, nullsFirst: false })
      .order('ingested_at', { ascending: false }),
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
