// app/api/searches/_internal-org.ts — ICP Saved Search S1.
//
// Lookup helper shared by the four /api/searches route handlers. Lives
// outside route.ts because Next.js App Router rejects non-route exports
// from a route.ts file. Underscore prefix keeps the file out of the
// router (Next ignores files starting with _ or .).

import { supabaseAdmin } from '@/lib/supabase';

const INTERNAL_SLUG = 'internal';

export async function resolveInternalOrgId(): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', INTERNAL_SLUG)
    .maybeSingle();
  const row = data as { id?: string } | null;
  return row?.id ?? null;
}
