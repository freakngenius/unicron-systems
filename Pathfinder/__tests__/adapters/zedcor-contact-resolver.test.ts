import { describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '../../lib/adapters/zedcor/contact-cache';
import {
  generateEmailCandidates,
  inferDomainCandidates,
} from '../../lib/adapters/zedcor/email-pattern-guesser';

describe('Z7 — contact-cache.normalizeCompanyName', () => {
  it('lowercases and strips corporate suffixes', () => {
    expect(normalizeCompanyName('Acme, Inc.')).toBe('acme');
    expect(normalizeCompanyName('ACME inc')).toBe('acme');
    expect(normalizeCompanyName('Pepper Lawson Construction')).toBe('pepper lawson');
    expect(normalizeCompanyName('Skanska USA LLC')).toBe('skanska usa');
  });

  it('collapses whitespace and trims punctuation', () => {
    expect(normalizeCompanyName('   Bartlett   Cocke  ')).toBe('bartlett cocke');
    expect(normalizeCompanyName('Tellepsen Builders LLC.')).toBe('tellepsen');
  });
});

describe('Z7 — email-pattern-guesser.inferDomainCandidates', () => {
  it('produces domain stems for multi-word GC names', () => {
    const candidates = inferDomainCandidates('Pepper Lawson Construction');
    expect(candidates).toContain('pepperlawson.com');
    expect(candidates).toContain('pepper-lawson.com');
    expect(candidates).toContain('pepperlawson.net');
  });

  it('returns at most a small handful of candidates', () => {
    const candidates = inferDomainCandidates('Acme');
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(12);
  });

  it('handles single-token names', () => {
    expect(inferDomainCandidates('Skanska')).toContain('skanska.com');
  });

  it('returns no duplicates', () => {
    const candidates = inferDomainCandidates('Foo');
    const set = new Set(candidates);
    expect(set.size).toBe(candidates.length);
  });
});

describe('Z7 — email-pattern-guesser.generateEmailCandidates', () => {
  it('produces generic-mailbox candidates for a domain', () => {
    const candidates = generateEmailCandidates('example.com');
    expect(candidates).toContain('contact@example.com');
    expect(candidates).toContain('info@example.com');
    expect(candidates).toContain('estimating@example.com');
  });
});
