import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PathfinderDatabase } from '@/lib/types';

// Anon (browser) and service-role (server) clients.
// Both pin `db.schema = 'pathfinder'` so unqualified table names resolve correctly,
// matching the brief's directive that all reads/writes stay inside the dedicated schema.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
}
if (!anonKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
}

export const supabase: SupabaseClient<PathfinderDatabase, 'pathfinder'> = createClient<PathfinderDatabase, 'pathfinder'>(
  url,
  anonKey,
  {
    db: { schema: 'pathfinder' },
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

export function supabaseAdmin(): SupabaseClient<PathfinderDatabase, 'pathfinder'> {
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for service-role operations');
  }
  return createClient<PathfinderDatabase, 'pathfinder'>(url!, serviceKey, {
    db: { schema: 'pathfinder' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
