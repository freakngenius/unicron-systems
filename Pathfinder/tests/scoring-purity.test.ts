// tests/scoring-purity.test.ts — runtime guard that lib/scoring.ts stays pure.
//
// This is the second of two gates protecting the Phase-2 transplant:
//   1. ESLint `no-restricted-imports` override on lib/scoring.ts (authoring time)
//   2. THIS test (CI / pre-merge time)
//
// The check reads the raw source as a string and matches every `import`
// statement against a deny list. Type-only imports (`import type` from
// `@/lib/types`) are erased at compile time and therefore allowed.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCORING_PATH = resolve(__dirname, '..', 'lib', 'scoring.ts');

// Imports that would defeat the Phase-2 transplant — reaching the cloud,
// touching Node-only APIs, or pulling in the full Next.js runtime — must
// never appear inside lib/scoring.ts.
const FORBIDDEN_PATTERNS: (string | RegExp)[] = [
  '@supabase',
  '@anthropic',
  /^next(\/|$)/,
  /^node:/,
  /^fs(\/|$)/,
  /^http(s)?(\/|$)/,
  /^stream(\/|$)/,
  /^crypto(\/|$)/,
  '@/lib/supabase',
  '@/lib/claude',
  '@/lib/anthropic',
  '@/lib/realtime',
];

// Match `import … from 'X'` and bare `import 'X'` (covers side-effect imports).
const IMPORT_RE = /^\s*import\b[^'"]*?from\s*['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;

function extractImportSources(src: string): string[] {
  const out: string[] = [];
  for (const match of src.matchAll(IMPORT_RE)) {
    const spec = match[1] ?? match[2];
    if (spec) out.push(spec);
  }
  return out;
}

function isForbidden(spec: string): string | null {
  for (const pat of FORBIDDEN_PATTERNS) {
    if (typeof pat === 'string') {
      if (spec.includes(pat)) return String(pat);
    } else if (pat.test(spec)) {
      return pat.source;
    }
  }
  return null;
}

describe('lib/scoring.ts purity', () => {
  it('source file exists and is readable', async () => {
    const src = await readFile(SCORING_PATH, 'utf-8');
    expect(src.length).toBeGreaterThan(0);
  });

  it('contains no forbidden imports', async () => {
    const src = await readFile(SCORING_PATH, 'utf-8');
    const specs = extractImportSources(src);
    const offences: { spec: string; matched: string }[] = [];
    for (const spec of specs) {
      const hit = isForbidden(spec);
      if (hit) offences.push({ spec, matched: hit });
    }
    if (offences.length > 0) {
      const detail = offences.map((o) => `  ${o.spec} (matched: ${o.matched})`).join('\n');
      throw new Error(
        `lib/scoring.ts imports forbidden modules — Phase-2 transplant gate. Offending:\n${detail}`,
      );
    }
    expect(offences).toEqual([]);
  });

  it('only allowed import path is @/lib/types (type-only, erased at runtime)', async () => {
    const src = await readFile(SCORING_PATH, 'utf-8');
    const specs = extractImportSources(src);
    const allowed = new Set(['@/lib/types']);
    const unknown = specs.filter((s) => !allowed.has(s));
    expect(unknown, `unexpected imports in lib/scoring.ts: ${unknown.join(', ')}`).toEqual([]);
  });
});
