// __tests__/adapters/zedcor-news-gc-extractor.test.ts
//
// Sprint Z14 — unit smoke for the news-snippet GC-name regex extractor.
// The Anthropic fallback is exercised via integration only (gated on
// ANTHROPIC_API_KEY); here we lock the regex patterns down so future edits
// don't silently drop the cases the ENR + HBJ RSS adapters depend on.

import { describe, it, expect } from 'vitest';
import { extractGcNameWithRegex, extractGcNameFromNewsSnippet } from '@/lib/adapters/zedcor/news-gc-extractor';

describe('extractGcNameWithRegex', () => {
  it('catches "X awarded contract" prefix pattern', () => {
    const r = extractGcNameWithRegex('Skanska awarded $1.2B contract for I-35 expansion');
    expect(r.gc_name).toBe('Skanska');
    expect(r.layer).toBe('regex');
  });

  it('catches "named X as the general contractor" pattern', () => {
    const r = extractGcNameWithRegex('Owner named Webcor Builders as the general contractor for the new campus');
    expect(r.gc_name).toBe('Webcor Builders');
    expect(r.layer).toBe('regex');
  });

  it('catches multi-word company with corporate suffix', () => {
    const r = extractGcNameWithRegex('Turner Construction wins $400M Houston medical tower contract');
    expect(r.gc_name).toBe('Turner Construction');
    expect(r.layer).toBe('regex');
  });

  it('catches "awarded to X" suffix pattern', () => {
    const r = extractGcNameWithRegex('The $250M contract was awarded to Hensel Phelps last week');
    expect(r.gc_name).toBe('Hensel Phelps');
    expect(r.layer).toBe('regex');
  });

  it('catches "general contractor X" structural pattern', () => {
    const r = extractGcNameWithRegex('Crews from general contractor JE Dunn began site work this week');
    expect(r.gc_name).toBe('JE Dunn');
    expect(r.layer).toBe('regex');
  });

  it('rejects when no GC pattern is present', () => {
    const r = extractGcNameWithRegex('Concrete prices fell 3% in Q1 according to ENR data');
    expect(r.gc_name).toBeNull();
    expect(r.layer).toBe('none');
  });

  it('rejects bare suffix words without a preceding company token', () => {
    const r = extractGcNameWithRegex('Construction begins on the new wing');
    expect(r.gc_name).toBeNull();
  });

  it('preserves a citation excerpt for surviving matches', () => {
    const r = extractGcNameWithRegex('DPR Construction was selected as the prime contractor for the project.');
    expect(r.gc_name).toBe('DPR Construction');
    expect(r.citation).toContain('DPR Construction');
  });
});

describe('extractGcNameFromNewsSnippet', () => {
  it('returns regex result without calling Anthropic when regex matches', async () => {
    const r = await extractGcNameFromNewsSnippet(
      'Skanska awarded $500M Texas highway contract',
      'Officials announced the award yesterday in Austin.',
      { skipAnthropic: true },
    );
    expect(r.gc_name).toBe('Skanska');
    expect(r.layer).toBe('regex');
  });

  it('returns null + none layer when both regex misses and Anthropic is skipped', async () => {
    const r = await extractGcNameFromNewsSnippet(
      'Construction trends Q2 outlook',
      'A quarterly update on commercial activity.',
      { skipAnthropic: true },
    );
    expect(r.gc_name).toBeNull();
    expect(r.layer).toBe('none');
  });
});
