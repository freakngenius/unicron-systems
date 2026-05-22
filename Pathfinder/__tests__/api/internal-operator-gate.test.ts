// __tests__/api/internal-operator-gate.test.ts
//
// Stage 3 of internal-onboarding — assert the operator-allowlist gate at
// `app/[slug]/layout.tsx` is slug-generic. The gate runs the same flow
// for /zedcor, /funder, /realberry, /internal: org lookup → access-token
// → Supabase getUser → operator_allowlist row check → redirect on miss.
//
// We do NOT spin up Next.js here; we read the source and confirm there
// is no per-slug fork. This is a guardrail test — if a future change
// introduces an `if (slug === 'internal')` branch, this fails and the
// author has to justify the fork explicitly.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const LAYOUT_PATH = path.resolve(__dirname, '../../app/[slug]/layout.tsx');

describe('app/[slug]/layout.tsx is slug-generic (Stage 3 guardrail)', () => {
  const src = readFileSync(LAYOUT_PATH, 'utf8');

  it('does not fork on a specific slug value', () => {
    // The layout receives `params.slug` and uses it ONLY as a Supabase
    // .eq('slug', slug) lookup key. Any `if (slug ===` or
    // `slug === 'internal'` style branch is a per-org fork and must be
    // justified.
    expect(src).not.toMatch(/slug\s*===\s*['"]/);
    expect(src).not.toMatch(/switch\s*\(\s*slug\s*\)/);
  });

  it('checks operator_allowlist on every request', () => {
    expect(src).toContain("from('operator_allowlist')");
    expect(src).toContain("redirect('/login?error=unauthorized')");
  });

  it('requires a valid Supabase session before the allowlist check', () => {
    expect(src).toContain('pf-access-token');
    expect(src).toContain("redirect('/login')");
  });
});
