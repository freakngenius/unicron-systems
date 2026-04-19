import { z } from "zod";

const Schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  ANTHROPIC_API_KEY: z.string().min(10).optional(),
  NOTION_API_KEY: z.string().min(10).optional(),
  NOTION_PRODUCT_PAGE_ID: z.string().length(32).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  ADMIN_PASSCODE: z.string().min(1).optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

type Env = z.infer<typeof Schema>;

const parsed = Schema.safeParse(process.env);
// Never throw at module load — would break `next build`. requireServerEnv()
// reads live process.env and fails loudly at call time for the specific key
// that's actually missing. Vercel runtime env is available there.

export const env: Env = (parsed.success ? parsed.data : (process.env as unknown as Env));

export function requireServerEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  // Read live from process.env so tests can mutate env safely and so
  // Vercel's late-bound runtime env is respected.
  const v = process.env[key as string];
  if (v == null || v === "") {
    throw new Error(`Missing required server env: ${String(key)}`);
  }
  return v as NonNullable<Env[K]>;
}
