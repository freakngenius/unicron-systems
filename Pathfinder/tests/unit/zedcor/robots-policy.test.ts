// Sprint Z6 — Verifies the robots-policy whitelist routes procurement
// portal URLs to the tiered fetch strategy and leaves non-listed hosts on
// the default robots-honoring path.

import { describe, expect, it } from 'vitest';

import {
  policyForUrl,
  ROBOTS_POLICY_VERSION,
  __WHITELIST_FOR_TESTS,
} from '@/lib/adapters/zedcor/robots-policy';

describe('robots-policy', () => {
  it('exposes a version string', () => {
    expect(ROBOTS_POLICY_VERSION).toMatch(/^z6-/);
  });

  describe('procurement portals (whitelisted)', () => {
    it.each([
      'https://galveston.bonfirehub.com/portal/?tab=openOpportunities&opportunityId=123',
      'https://brazoriacounty.bonfirehub.com/opportunities/456',
      'https://houstonisd.ionwave.net/Bids/Public/BidSummary/9999',
      'https://www.demandstar.com/bids/7777',
      'https://purchasing.harriscountytx.gov/Pages/default.aspx',
      'https://www.publicworks.houstontx.gov/business/bid-opportunities.html',
    ])('bypasses robots for %s', (url) => {
      const p = policyForUrl(url);
      expect(p.bypassRobots).toBe(true);
      expect(p.strategy).toBe('whitelist-tiered');
    });
  });

  describe('non-whitelisted hosts', () => {
    it.each([
      'https://www.enr.com/articles/123-some-award',
      'https://www.bizjournals.com/houston/news/construction/2026/05/28/foo.html',
      'https://www.bxtexas.org/projects/abc',
      'https://example.com/whatever',
    ])('honors robots for %s', (url) => {
      const p = policyForUrl(url);
      expect(p.bypassRobots).toBe(false);
      expect(p.strategy).toBe('tiered');
    });
  });

  it('returns a safe default for malformed URLs', () => {
    const p = policyForUrl('not-a-url');
    expect(p.bypassRobots).toBe(false);
    expect(p.strategy).toBe('tiered');
  });

  it('whitelist contains the spec-required procurement portals', () => {
    const patterns = __WHITELIST_FOR_TESTS.map((r) => r.pattern);
    for (const required of [
      '*.bonfirehub.com',
      '*.ionwave.net',
      '*.workdayspend.com',
      '*.demandstar.com',
      '*.publicpurchase.com',
      '*.bidcontract.com',
    ]) {
      expect(patterns).toContain(required);
    }
  });
});
