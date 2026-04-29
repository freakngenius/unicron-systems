// __tests__/api/outreach-drafts.test.ts — narrow coverage of the
// /api/outreach-drafts route's input validation. The Supabase-touching
// happy paths (counts shape, drafts shape) are exercised manually
// against the live deploy because mocking the supabase-js chainable
// just to check the JSON envelope adds more test maintenance than
// signal. The 400-validation path doesn't reach Supabase at all and
// is worth a unit test as a contract pin.
//
// Mirrors the verifier-schema test pattern: if the supabase env vars
// aren't present (CI without secrets, vitest without .env.local) the
// suite skips so importing the route doesn't throw at module load.

import { describe, expect, it } from 'vitest';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: '.env.local' });
dotenvConfig();

const haveCreds = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

describe.runIf(haveCreds)('GET /api/outreach-drafts — input validation', () => {
  it('returns 400 when project_id exceeds 200 characters', async () => {
    // Lazy import — the supabase client throws on import when env vars are
    // unset, so we defer until after the runIf guard has confirmed creds.
    const { GET } = await import('@/app/api/outreach-drafts/route');
    const longId = 'x'.repeat(201);
    const req = new Request(
      `http://localhost/pathfinder/api/outreach-drafts?project_id=${longId}`,
    );
    const res = await GET(req as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid project_id/);
  });
});
