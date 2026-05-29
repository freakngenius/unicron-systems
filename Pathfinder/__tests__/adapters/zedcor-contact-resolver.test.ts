import { describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '../../lib/adapters/zedcor/contact-cache';
import {
  domainRoot,
  generateEmailCandidates,
  inferDomainCandidates,
  rejectLowQualityDomain,
  rejectLowQualityEmail,
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

describe('Z14.1 — email-pattern-guesser quality filter', () => {
  describe('domainRoot', () => {
    it('strips the TLD', () => {
      expect(domainRoot('the.com')).toBe('the');
      expect(domainRoot('acme-construction.net')).toBe('acme-construction');
      expect(domainRoot('foo.co.uk')).toBe('foo.co');
    });
  });

  describe('rejectLowQualityDomain', () => {
    it('rejects stop-word domain roots', () => {
      expect(rejectLowQualityDomain('the.com')).toBe('stop_word_domain');
      expect(rejectLowQualityDomain('and.com')).toBe('stop_word_domain');
      expect(rejectLowQualityDomain('of.com')).toBe('stop_word_domain');
      expect(rejectLowQualityDomain('inc.com')).toBe('stop_word_domain');
      expect(rejectLowQualityDomain('llc.com')).toBe('stop_word_domain');
      expect(rejectLowQualityDomain('co.com')).toBe('stop_word_domain');
    });

    it('rejects domain roots with fewer than 3 alpha chars', () => {
      expect(rejectLowQualityDomain('ma.com')).toBe('short_domain');
      expect(rejectLowQualityDomain('jc.com')).toBe('short_domain');
      expect(rejectLowQualityDomain('a1.com')).toBe('short_domain');
    });

    it('accepts plausible-looking company domains', () => {
      expect(rejectLowQualityDomain('skanska.com')).toBeNull();
      expect(rejectLowQualityDomain('pepperlawson.com')).toBeNull();
      expect(rejectLowQualityDomain('hensel-phelps.com')).toBeNull();
    });
  });

  describe('rejectLowQualityEmail', () => {
    it('rejects contact@<short-root> outputs', () => {
      // Z14 backfill surfaced exactly these classes — kfc.com / amg.com
      // have valid MX but the contact@ local on a short root is below
      // the signal threshold we ship at.
      expect(rejectLowQualityEmail('contact@kfc.com')).toBe('contact_with_short_domain');
      expect(rejectLowQualityEmail('contact@opr.com')).toBe('contact_with_short_domain');
      expect(rejectLowQualityEmail('contact@amg.com')).toBe('contact_with_short_domain');
    });

    it('accepts contact@ on domain roots ≥6 chars', () => {
      expect(rejectLowQualityEmail('contact@skanska.com')).toBeNull();
      expect(rejectLowQualityEmail('contact@henselphelps.com')).toBeNull();
    });

    it('accepts non-contact locals regardless of root length', () => {
      // The short-root guard is contact-specific because contact@ is the
      // first candidate in the generic list — other locals only fire if
      // contact@ is rejected, and short roots with specific locals are
      // less suspicious.
      expect(rejectLowQualityEmail('estimating@kfc.com')).toBeNull();
      expect(rejectLowQualityEmail('info@amg.com')).toBeNull();
    });
  });
});
