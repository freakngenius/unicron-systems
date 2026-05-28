// lib/adapters/zedcor/robots-policy.ts
//
// Sprint Z6 — Per-domain robots policy + fetch-strategy router for the
// upgraded detail-page-fetcher.
//
// Why this exists: procurement portals (Bonfire, IonWave, Workday public,
// DemandStar, PublicPurchase, BidContract) explicitly publish opportunities
// for vendor consumption, then ship blanket Disallow: / in robots.txt that
// blocks every tool that isn't a major search-engine crawler. The intent of
// those robots files is to keep low-effort scrapers from hammering them;
// Pathfinder is a vendor-facing intelligence tool reading public bid
// notices. We treat those domains as whitelisted and ignore robots.txt.
//
// Every other domain still honors robots.txt via the parser in
// detail-page-fetcher.ts.

export type FetchStrategy =
  | 'native'           // Layer 1 — plain fetch with browser UA
  | 'scrapingbee'      // Layer 2 — ScrapingBee proxy with render_js
  | 'playwright'       // Layer 3 — headless Chromium (@sparticuz/chromium)
  | 'whitelist-tiered' // Try L1 → L2/L3 → fail
  | 'tiered';          // Default for non-whitelisted hosts: L1 only, then native fallbacks

interface DomainRule {
  /** Domain or `*.domain` suffix glob. */
  pattern: string;
  /** Skip robots.txt check entirely when true. */
  bypassRobots: boolean;
  /** Preferred strategy order; the fetcher walks tiers until one succeeds. */
  strategy: FetchStrategy;
  /** Why this is on the list — for PR audit + governance. */
  rationale: string;
}

// ---------------------------------------------------------------------------
// Whitelist — procurement portals + agency procurement subdomains.
//
// Each whitelisted host:
//   - skips robots.txt (we have explicit operator approval to read
//     bid notices published for vendor consumption)
//   - uses the tiered fetch strategy (L1 native UA → L2 ScrapingBee →
//     L3 Playwright → L4 'cloudflare_blocked')
//
// To add a new procurement portal, append to this list and bump
// ROBOTS_POLICY_VERSION below for audit-trail traceability.
// ---------------------------------------------------------------------------

const PROCUREMENT_WHITELIST: ReadonlyArray<DomainRule> = [
  {
    pattern: '*.bonfirehub.com',
    bypassRobots: true,
    strategy: 'whitelist-tiered',
    rationale: 'Bonfire portal: public bid notices for vendors.',
  },
  {
    pattern: '*.ionwave.net',
    bypassRobots: true,
    strategy: 'whitelist-tiered',
    rationale: 'IonWave portal: school district + municipal solicitations.',
  },
  {
    pattern: '*.workdayspend.com',
    bypassRobots: true,
    strategy: 'whitelist-tiered',
    rationale: 'Workday Strategic Sourcing public supplier portal.',
  },
  {
    pattern: '*.demandstar.com',
    bypassRobots: true,
    strategy: 'whitelist-tiered',
    rationale: 'DemandStar: state/local public procurement aggregator.',
  },
  {
    pattern: '*.publicpurchase.com',
    bypassRobots: true,
    strategy: 'whitelist-tiered',
    rationale: 'PublicPurchase: government bid aggregator.',
  },
  {
    pattern: '*.bidcontract.com',
    bypassRobots: true,
    strategy: 'whitelist-tiered',
    rationale: 'BidContract: public-sector bid aggregator.',
  },
  // Texas county / city / agency procurement subdomains explicitly enumerated
  // in pathfinder.data_sources for Zedcor Houston.
  {
    pattern: 'purchasing.harriscountytx.gov',
    bypassRobots: true,
    strategy: 'whitelist-tiered',
    rationale: 'Harris County Purchasing (Bonfire-backed).',
  },
  {
    pattern: 'galvestoncountytx.gov',
    bypassRobots: true,
    strategy: 'whitelist-tiered',
    rationale: 'Galveston County purchasing landing.',
  },
  {
    pattern: 'www.fortbendcountytx.gov',
    bypassRobots: true,
    strategy: 'whitelist-tiered',
    rationale: 'Fort Bend County purchasing landing.',
  },
  {
    pattern: 'www.brazoria-county.com',
    bypassRobots: true,
    strategy: 'whitelist-tiered',
    rationale: 'Brazoria County purchasing landing.',
  },
  {
    pattern: 'purchasing.houstontx.gov',
    bypassRobots: true,
    strategy: 'whitelist-tiered',
    rationale: 'City of Houston OBO / Purchasing.',
  },
  {
    pattern: 'www.houstontx.gov',
    bypassRobots: true,
    strategy: 'whitelist-tiered',
    rationale: 'City of Houston primary domain (public-works + OBO).',
  },
  {
    pattern: 'www.publicworks.houstontx.gov',
    bypassRobots: true,
    strategy: 'whitelist-tiered',
    rationale: 'Houston Public Works bid notices.',
  },
  {
    pattern: '*.ridemetro.org',
    bypassRobots: true,
    strategy: 'whitelist-tiered',
    rationale: 'Houston METRO procurement.',
  },
  {
    pattern: '*.porthouston.com',
    bypassRobots: true,
    strategy: 'whitelist-tiered',
    rationale: 'Port Houston procurement.',
  },
  {
    pattern: '*.txdot.gov',
    bypassRobots: true,
    strategy: 'whitelist-tiered',
    rationale: 'TxDOT Houston district letting page.',
  },
  {
    pattern: '*.houstonisd.org',
    bypassRobots: true,
    strategy: 'whitelist-tiered',
    rationale: 'Houston ISD IonWave portal.',
  },
];

/** Bumped when the whitelist changes. Surfaced in fetch logs for audit. */
export const ROBOTS_POLICY_VERSION = 'z6-2026-05-28';

export interface DomainPolicy {
  host: string;
  bypassRobots: boolean;
  strategy: FetchStrategy;
  rationale: string | null;
}

function hostMatchesPattern(host: string, pattern: string): boolean {
  const h = host.toLowerCase();
  const p = pattern.toLowerCase();
  if (p.startsWith('*.')) {
    const suffix = p.slice(1); // ".bonfirehub.com"
    return h === suffix.slice(1) || h.endsWith(suffix);
  }
  return h === p;
}

/**
 * Resolve a fetch policy for the given URL. Hosts in PROCUREMENT_WHITELIST
 * get robots-bypass + tiered strategy; all other hosts get native-only
 * with robots honored.
 */
export function policyForUrl(url: string): DomainPolicy {
  let host: string;
  try {
    host = new URL(url).host.toLowerCase();
  } catch {
    return {
      host: '',
      bypassRobots: false,
      strategy: 'tiered',
      rationale: null,
    };
  }
  for (const rule of PROCUREMENT_WHITELIST) {
    if (hostMatchesPattern(host, rule.pattern)) {
      return {
        host,
        bypassRobots: rule.bypassRobots,
        strategy: rule.strategy,
        rationale: rule.rationale,
      };
    }
  }
  return {
    host,
    bypassRobots: false,
    strategy: 'tiered',
    rationale: null,
  };
}

/** Test-only — exposed for unit tests on policy resolution. */
export const __WHITELIST_FOR_TESTS = PROCUREMENT_WHITELIST;
