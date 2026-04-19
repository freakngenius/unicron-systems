import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, requireServerEnv } from "./env";
import type { Database } from "./db.types";

export type { Database };

let _service: SupabaseClient<Database> | null = null;

/** Browser/edge-safe (anon key). Safe to ship to the client. */
export function supabaseBrowser(): SupabaseClient<Database> {
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } },
  );
}

/** Server-only (service role). Never import into a client component. */
export function supabaseService(): SupabaseClient<Database> {
  if (typeof window !== "undefined") {
    throw new Error("supabaseService() must not be called in the browser");
  }
  if (_service) return _service;
  const url = requireServerEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireServerEnv("SUPABASE_SERVICE_ROLE_KEY");
  _service = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _service;
}
