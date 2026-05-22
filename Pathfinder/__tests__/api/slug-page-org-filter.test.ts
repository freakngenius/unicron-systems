// __tests__/api/slug-page-org-filter.test.ts
//
// Stage 10 — regression test for the pre-existing slug-page bug at
// app/[slug]/page.tsx. The page filtered projects by `org_id`, but the
// projects table column is `organization_id`. Result: every non-Zedcor
// slug rendered with 0 leads. This test guards the fix by parsing the
// source file's projects-fetch call.
//
// Runs as a string check rather than a component render because the
// page is a server component with Supabase + Next.js auth imports that
// are non-trivial to mock at unit-test scope. Source-level guarantee is
// enough to keep this regression locked.

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

describe('[slug]/page.tsx — projects filter uses organization_id', () => {
  it('filters projects by organization_id, not org_id', async () => {
    const path = resolve(__dirname, '../../app/[slug]/page.tsx');
    const src = await readFile(path, 'utf8');
    expect(src).toContain("from('projects')");
    expect(src).toContain(".eq('organization_id', org.id)");
    expect(src).not.toContain(".eq('org_id', org.id)");
  });
});
