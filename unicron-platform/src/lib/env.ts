// Environment variables for the operator UI.
//
// Vite exposes `import.meta.env.VITE_*` to the browser. Anything not prefixed
// with `VITE_` will not be bundled.
//
// All envs are validated lazily on first access via getEnv(). Throwing here is
// intentional — it surfaces a misconfigured deploy at boot rather than letting
// queries fail silently.

type RuntimeEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** When true, the app requires a signed-in Supabase session before rendering. */
  authRequired: boolean;
  /** Operator email recorded against architect_proposals.resolved_by_user_email when approving / dismissing. */
  operatorEmail?: string;
  /** Atrium internal cockpit — enabled when VITE_ATRIUM_ENABLED=true. */
  atriumEnabled: boolean;
  /** Comma-separated list of emails allowed into Atrium. Empty = no allowlist enforced. */
  atriumEmailAllowlist: string[];
};

let cached: RuntimeEnv | null = null;

export function getEnv(): RuntimeEnv {
  if (cached) return cached;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing required env vars VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
        'Copy .env.example to .env.local and fill in the values from your Supabase project.',
    );
  }

  // Wave 3 Phase B: VITE_ARCHITECT_API_TOKEN is no longer read client-side.
  // The bearer token lives only on Vercel as `ARCHITECT_API_TOKEN` and is
  // injected by the same-origin proxy at `/api/architect/*-proxy`.
  const operatorEmail = import.meta.env.VITE_OPERATOR_EMAIL as string | undefined;

  const atriumAllowlistRaw = import.meta.env.VITE_ATRIUM_EMAIL_ALLOWLIST as string | undefined;

  cached = {
    supabaseUrl,
    supabaseAnonKey,
    authRequired: import.meta.env.VITE_AUTH_REQUIRED === 'true',
    operatorEmail: operatorEmail && operatorEmail.length > 0 ? operatorEmail : undefined,
    atriumEnabled: import.meta.env.VITE_ATRIUM_ENABLED === 'true',
    atriumEmailAllowlist: atriumAllowlistRaw
      ? atriumAllowlistRaw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
      : [],
  };

  return cached;
}

// Test seam — clears the memoized cache between tests.
export function __resetEnvForTests() {
  cached = null;
}
