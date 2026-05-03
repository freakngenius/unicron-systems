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
  /**
   * Feature flags that swap mocked panel implementations for the real
   * downstream agent contracts. Default false until streams D and E ship.
   */
  architectApiEnabled: boolean;
  sourceOnboarderEnabled: boolean;
  /** Operator email recorded against architect_proposals.resolved_by_user_email when approving / dismissing. */
  operatorEmail?: string;
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

  cached = {
    supabaseUrl,
    supabaseAnonKey,
    authRequired: import.meta.env.VITE_AUTH_REQUIRED === 'true',
    architectApiEnabled: import.meta.env.VITE_ARCHITECT_API_ENABLED === 'true',
    sourceOnboarderEnabled: import.meta.env.VITE_SOURCE_ONBOARDER_ENABLED === 'true',
    operatorEmail: operatorEmail && operatorEmail.length > 0 ? operatorEmail : undefined,
  };

  return cached;
}

// Test seam — clears the memoized cache between tests.
export function __resetEnvForTests() {
  cached = null;
}
