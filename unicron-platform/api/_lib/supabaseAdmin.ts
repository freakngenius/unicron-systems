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
