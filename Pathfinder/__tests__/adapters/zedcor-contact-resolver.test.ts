import { describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '../../lib/adapters/zedcor/contact-cache';
import {
  domainRoot,
  generateEmailCandidates,
  inferDomainCandidates,
  isJointVenture,
  rejectLowQualityCatchall,
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

    it('extends the short-root guard to ALL generic locals (post-Z14.1)', () => {
      // Earlier assumption (Z14.1 ship): only `contact@` needed the
      // short-root guard because it's the first candidate. The Zedcor
      // backfill disproved this — when `contact@cdm.com` was cleared the
      // resolver's fallthrough produced `info@cdm.com`, which then re-
      // populated the row. Every generic local in GENERIC_FIRST_NAMES
      // shares the same low-signal failure mode and is now screened.
      expect(rejectLowQualityEmail('info@cdm.com')).toBe('generic_local_with_short_domain');
      expect(rejectLowQualityEmail('estimating@kfc.com')).toBe('generic_local_with_short_domain');
      expect(rejectLowQualityEmail('info@amg.com')).toBe('generic_local_with_short_domain');
      expect(rejectLowQualityEmail('projects@bccga.com')).toBe('generic_local_with_short_domain');
    });

    it('keeps contact-specific reason string for telemetry parity', () => {
      // pre-extension callers (z14_1_cleanup markers in pathfinder.projects)
      // recorded `contact_with_short_domain` — preserved so historical
      // skip-count aggregations remain comparable.
      expect(rejectLowQualityEmail('contact@cdm.com')).toBe('contact_with_short_domain');
      expect(rejectLowQualityEmail('contact@kfc.com')).toBe('contact_with_short_domain');
    });

    it('still accepts non-generic locals', () => {
      // Real human-name locals are not screened — only the generic
      // catchall set fires the short-root guard.
      expect(rejectLowQualityEmail('jsmith@cdm.com')).toBeNull();
      expect(rejectLowQualityEmail('mary.jones@kfc.com')).toBeNull();
    });
  });

  describe('rejectLowQualityCatchall (extended Z14.1 predicate)', () => {
    it('rejects generic-local emails on non-com TLDs (when root passes length)', () => {
      // contact@american.net, contact@record.co — root passes the
      // short-domain guard (≥6 alpha), TLD .net/.co triggers the
      // noncom-tld gate. The resolver landed on a parked-domain miss
      // because the firstWord stem only resolved on the wrong TLD.
      expect(rejectLowQualityCatchall('contact@american.net')).toBe('generic_local_with_noncom_tld');
      expect(rejectLowQualityCatchall('contact@therobins.net')).toBe('generic_local_with_noncom_tld');
      expect(rejectLowQualityCatchall('contact@miraclesystems.net')).toBe('generic_local_with_noncom_tld');
      expect(rejectLowQualityCatchall('contact@record.co')).toBe('generic_local_with_noncom_tld');
      expect(rejectLowQualityCatchall('contact@healtheon.co')).toBe('generic_local_with_noncom_tld');
      expect(rejectLowQualityCatchall('contact@fisher.net')).toBe('generic_local_with_noncom_tld');
    });

    it('short-domain check fires before noncom-tld for shorter roots', () => {
      // info@walsh.net — walsh is 5 chars, short_domain wins before
      // the noncom-tld gate fires. Both gates would NULL the row;
      // the earlier reason is reported for skip-count telemetry.
      expect(rejectLowQualityCatchall('info@walsh.net')).toBe('generic_local_with_short_domain');
    });

    it('rejects generic-local emails when the domain root contains a digit', () => {
      // contact@a3technology.com — A3 TECHNOLOGY INC. Digit in the root
      // is a strong signal the resolver landed on an acronym/serial guess.
      expect(rejectLowQualityCatchall('contact@a3technology.com')).toBe(
        'generic_local_with_digit_in_domain',
      );
      expect(rejectLowQualityCatchall('contact@e1corp.com')).toBe(
        'generic_local_with_digit_in_domain',
      );
    });

    it('rejects generic-local emails when the company name carries a JV marker', () => {
      // HURLEY JV, LLP → contact@hurley.com; the bare hurley.com is a
      // different company (Nike-owned surf brand). JV/LLPs rarely own a
      // standalone domain; firstWord fallback lands on a stranger.
      // Domain root must pass the earlier (length + tld + digit) gates
      // for the JV gate to fire — hurley (6 chars, .com, no digits) does.
      expect(
        rejectLowQualityCatchall('contact@hurley.com', { companyName: 'HURLEY JV, LLP' }),
      ).toBe('generic_local_for_joint_venture');
      expect(
        rejectLowQualityCatchall('contact@partneragency.com', {
          companyName: 'PARTNER AGENCY JOINT VENTURE',
        }),
      ).toBe('generic_local_for_joint_venture');
      // No JV marker → predicate passes.
      expect(
        rejectLowQualityCatchall('contact@hurley.com', { companyName: 'HURLEY MANUFACTURING' }),
      ).toBeNull();
    });

    it('preserves Class-B legit-company-domain catchalls', () => {
      // The Zedcor verbatim Class-B set must survive the predicate.
      const classB: ReadonlyArray<readonly [string, string]> = [
        ['contact@brasfield.com', 'BRASFIELD & GORRIE LLC'],
        ['contact@kiewit.com', 'KIEWIT INFRASTRUCTURE SOUTH CO'],
        ['contact@clarkconstructiongroup.com', 'CLARK CONSTRUCTION GROUP LLC'],
        ['contact@henselphelpsconstruction.com', 'HENSEL PHELPS CONSTRUCTION CO.'],
        ['contact@caddell.com', 'CADDELL CONSTRUCTION CO. (DE), LLC'],
        ['contact@consigli.com', 'CONSIGLI CONSTRUCTION CO., INC.'],
        ['contact@jedunnconstruction.com', 'J. E. DUNN CONSTRUCTION COMPANY'],
        ['contact@whiting-turner.com', 'WHITING-TURNER CONTRACTING COMPANY, THE'],
      ];
      for (const [email, companyName] of classB) {
        expect(rejectLowQualityCatchall(email, { companyName })).toBeNull();
      }
    });

    it('does not screen non-generic locals on the new gates', () => {
      // Only the generic catchall set fires the new gates. A real
      // human-name local on .net or with a digit is not the resolver's
      // problem space.
      expect(rejectLowQualityCatchall('jsmith@walsh.net')).toBeNull();
      expect(rejectLowQualityCatchall('mary.jones@a3technology.com')).toBeNull();
    });

    it('delegates to rejectLowQualityDomain + rejectLowQualityEmail first', () => {
      // The composed predicate inherits the existing Z14.1 reasons.
      expect(rejectLowQualityCatchall('contact@the.com')).toBe('stop_word_domain');
      expect(rejectLowQualityCatchall('contact@ma.com')).toBe('short_domain');
      expect(rejectLowQualityCatchall('contact@cdm.com')).toBe('contact_with_short_domain');
      expect(rejectLowQualityCatchall('info@cdm.com')).toBe('generic_local_with_short_domain');
    });
  });

  describe('isJointVenture', () => {
    it('detects token-level and phrase-level JV markers', () => {
      expect(isJointVenture('HURLEY JV, LLP')).toBe(true);
      expect(isJointVenture('BCCG A JOINT VENTURE')).toBe(true);
      expect(isJointVenture('SOME COMPANY JV')).toBe(true);
      expect(isJointVenture('joint venture partners')).toBe(true);
    });

    it('does not false-positive on look-alike substrings', () => {
      // "Javelin" contains "jav" but not the token "jv"; "rejvenated"
      // does too. The check is token-level, not substring.
      expect(isJointVenture('JAVELIN CONSTRUCTION LLC')).toBe(false);
      expect(isJointVenture('KIEWIT INFRASTRUCTURE SOUTH CO')).toBe(false);
      expect(isJointVenture('BRASFIELD & GORRIE LLC')).toBe(false);
    });
  });
});
