import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PathfinderDatabase } from '@/lib/types';

// Anon (browser/server-read) and service-role (server-write) clients,
// both pinned to `db.schema = 'pathfinder'` so unqualified table names
// resolve correctly inside the dedicated schema.
//
// Construction is deferred to first property access. Reading
// `NEXT_PUBLIC_SUPABASE_URL` at module load was crashing Next.js's
// build-time "Collecting page data" phase whenever the build environment
// didn't have the env var populated — surfaced as ERR'd Vercel deploys
// since 2026-05-01 (PR #37 chain). The Proxy preserves call-site
// ergonomics (`import { supabase }` continues to work) while moving the
// throw out of module-load and into the first request handler that
// actually touches the client.

type Client = SupabaseClient<PathfinderDatabase, 'pathfinder'>;

let _anon: Client | null = null;

function buildAnonClient(): Client {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  if (!anonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
  return createClient<PathfinderDatabase, 'pathfinder'>(url, anonKey, {
    db: { schema: 'pathfinder' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getAnon(): Client {
  if (!_anon) _anon = buildAnonClient();
  return _anon;
}

/**
 * Anon Supabase client. Lazy: the underlying client is constructed (and
 * env vars validated) on first property access, not at module load.
 */
export const supabase: Client = new Proxy({} as Client, {
  get(_target, prop, _receiver) {
    const client = getAnon() as unknown as Record<PropertyKey, unknown>;
    const value = client[prop as PropertyKey];
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
}) as Client;

/**
 * Service-role client. Already lazy (function call); kept that way so
 * `lib/llm/recorder.ts` and friends only need the SUPABASE_SERVICE_ROLE_KEY
 * when an actual write is happening.
 */
export function supabaseAdmin(): Client {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for service-role operations');
  }
  return createClient<PathfinderDatabase, 'pathfinder'>(url, serviceKey, {
    db: { schema: 'pathfinder' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Test seam — reset memoized anon client between tests.
export function __resetSupabaseForTests(): void {
  _anon = null;
}
