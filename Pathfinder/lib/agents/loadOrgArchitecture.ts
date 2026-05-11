// lib/agents/loadOrgArchitecture.ts — Phase 2C slice 1.
//
// Server-side loader: given an organization_id, fetch the org row from
// pathfinder.organizations and return the resolved OrgArchitecture
// (BASE_ARCHITECTURE merged with the row's architecture jsonb).
//
// Used by per-org Inngest dispatch (ingest-all-orgs cron) and by future
// agent jobs that need to read per-org config without doing the
// fetch+resolve dance themselves.
//
// Spec: Company Docs/Metacron/SPEC - Phase 2C Dynamic Agent Dispatch.md.

import { supabaseAdmin } from '@/lib/supabase';
import { resolveArchitecture } from '@/lib/config/resolveArchitecture';
import type { OrgArchitecture } from '@/lib/types/architecture';
import type { Organization } from '@/lib/types';

export interface LoadedOrgArchitecture {
  org: Pick<Organization, 'id' | 'name' | 'slug'>;
  architecture: OrgArchitecture;
}

// Test seam — see __tests__/agents/loadOrgArchitecture.test.ts.
type MinimalSupabaseClient = {
  from: (table: string) => {
    select: (cols?: string) => {
      eq: (
        col: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{
          data: { id: string; name: string; slug: string; architecture: Record<string, unknown> } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

let _testClient: MinimalSupabaseClient | null = null;
export function __setSupabaseClientForTests(client: MinimalSupabaseClient | null): void {
  _testClient = client;
}

function getClient(): MinimalSupabaseClient {
  if (_testClient) return _testClient;
  return supabaseAdmin() as unknown as MinimalSupabaseClient;
}

export async function loadOrgArchitecture(
  organizationId: string,
): Promise<LoadedOrgArchitecture> {
  const client = getClient();
  const { data, error } = await client
    .from('organizations')
    .select('id,name,slug,architecture')
    .eq('id', organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(`loadOrgArchitecture: supabase error: ${error.message}`);
  }
  if (!data) {
    throw new Error(`loadOrgArchitecture: organization ${organizationId} not found`);
  }

  return {
    org: { id: data.id, name: data.name, slug: data.slug },
    architecture: resolveArchitecture(data.architecture),
  };
}
