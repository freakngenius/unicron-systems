// Regression test for the deploy-blocker that landed in main between
// 2026-05-01 PRs #37 → #41. `lib/supabase.ts` previously read
// `process.env.NEXT_PUBLIC_SUPABASE_URL` at module load and threw if it
// was unset. Next.js's "Collecting page data" build phase evaluates
// every API route's module top-level code, so any route importing
// `@/lib/supabase` crashed the build whenever the env var wasn't
// populated.
//
// This test pins the contract: importing the module with no Supabase
// env vars must NOT throw. The throw is allowed (and required) on
// first property access.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';

const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ORIGINAL_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterAll(() => {
  if (ORIGINAL_URL) process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_URL;
  if (ORIGINAL_KEY) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIGINAL_KEY;
  if (ORIGINAL_SERVICE) process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_SERVICE;
});

describe('lib/supabase — lazy construction', () => {
  it('imports without throwing when env vars are absent', async () => {
    // The act of importing alone must not surface the env var error.
    // If the module ever regresses to eager construction, this test
    // throws "NEXT_PUBLIC_SUPABASE_URL is not set" on the import line.
    const mod = await import('@/lib/supabase');
    expect(mod.supabase).toBeDefined();
    expect(mod.supabaseAdmin).toBeInstanceOf(Function);
  });

  it('throws on first property access when NEXT_PUBLIC_SUPABASE_URL is unset', async () => {
    const mod = await import('@/lib/supabase');
    mod.__resetSupabaseForTests();
    expect(() => mod.supabase.from('projects')).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL is not set/,
    );
  });

  it('supabaseAdmin() throws on call when SUPABASE_SERVICE_ROLE_KEY is unset', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    const mod = await import('@/lib/supabase');
    expect(() => mod.supabaseAdmin()).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY is required/,
    );
  });

  it('memoizes the anon client across multiple property accesses', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    const mod = await import('@/lib/supabase');
    mod.__resetSupabaseForTests();
    // Trigger construction twice; the proxy should reuse the cached
    // client rather than building a new one each time.
    const ref1 = mod.supabase.auth;
    const ref2 = mod.supabase.auth;
    expect(ref1).toBe(ref2);
  });
});
