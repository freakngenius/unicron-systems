// Shared service-role Supabase client for serverless handlers.
//
// Extracted from the inline copies that lived in every api/atrium/*.ts handler.
// Voice handlers consume this via `import { getServiceClient } from '../_lib/supabaseAdmin'`.
// Existing api/atrium/*.ts handlers are NOT migrated in this PR — that's a
// follow-up after the voice retrofit lands. Keeping the shape identical to
// the current inline pattern so the future migration is mechanical.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function getServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL not configured');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return createClient(url, key);
}

/**
 * Pathfinder-default service client for voice handlers.
 *
 * The prototype's handlers used `supabaseAdmin.from("voice_call_transcripts")`
 * without an explicit `.schema('pathfinder')` because the prototype's PostgREST
 * default schema includes pathfinder. To preserve that ergonomic in Atrium
 * without per-call schema selectors, voice handlers consume this variant which
 * pins `db: { schema: 'pathfinder' }`. Cross-schema reads still work via
 * `client.schema('metacron').from(...)`.
 */
export function getPathfinderServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL not configured');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  // Cast: supabase-js's generic-defaulted SupabaseClient resolves to
  // <any, "public", "public", ...> but we pin db.schema to "pathfinder"
  // at runtime. The branded schema-generic mismatches the default; we
  // accept the cast since downstream code uses .from('voice_*') strings
  // and never relies on schema-narrowed type inference.
  return createClient(url, key, { db: { schema: 'pathfinder' } }) as unknown as SupabaseClient;
}
