// Main dashboard route. Server component: fetches initial Branch / Customer / Project
// rows from Supabase and hands them to the <Dashboard /> client component, which
// owns all interaction state.

import { Dashboard } from '@/components/dashboard';
import { supabase } from '@/lib/supabase';
import type { Branch, Customer, Project } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function fetchInitialData(): Promise<{
  branches: Branch[];
  customers: Customer[];
  projects: Project[];
}> {
  // Run in parallel — three independent reads.
  const [branchesRes, customersRes, projectsRes] = await Promise.all([
    supabase.from('branches').select('*').order('code', { ascending: true }),
    supabase.from('customers').select('*').order('id', { ascending: true }),
    supabase
      .from('projects')
      .select('*')
      .order('score', { ascending: false, nullsFirst: false })
      .order('ingested_at', { ascending: false }),
  ]);

  return {
    branches: (branchesRes.data ?? []) as Branch[],
    customers: (customersRes.data ?? []) as Customer[],
    projects: (projectsRes.data ?? []) as Project[],
  };
}

export default async function HomePage() {
  const { branches, customers, projects } = await fetchInitialData();

  return (
    <Dashboard
      initialBranches={branches}
      initialCustomers={customers}
      initialProjects={projects}
    />
  );
}
