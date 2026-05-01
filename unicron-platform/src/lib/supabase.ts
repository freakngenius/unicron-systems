import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from './env';

// Browser Supabase client. Anon key only — service-role keys must never reach
// the bundle. RLS on `pathfinder.*` allows `anon, authenticated` SELECT on the
// read-public tables (branches, customers, projects, agent_log, agent_runs,
// adjacent_targets); writes are owned by the cron service-role path.
//
// Default schema is left at `public`; cross-schema reads (e.g. `pathfinder`,
// `unicron`) are issued via `client.schema('pathfinder')` per call site.

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const env = getEnv();
  client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });
  return client;
}

// Test seam.
export function __resetSupabaseForTests() {
  client = null;
}
