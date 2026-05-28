// lib/adapters/zedcor/robots-policy.ts
//
// Sprint Z13 — robots.txt policy gate for the Zedcor fetcher chain.
//
// Per-domain whitelist: hosts whose robots.txt we explicitly skip because
// the body is public-procurement data we have a legal/public-records
// basis to access regardless of crawl-delay-style directives intended for
// scraper-bot rate limiting. Verified against host operator ToS as of
// 2026-05-28; revisit per the source-onboarder ToS review every 90 days.
//
// Everything not whitelisted defers to the existing robots-aware path in
// detail-page-fetcher.ts (isAllowedByRobots()).
//
// Whitelist source map:
//   *.bonfirehub.com      — Euna Procurement (Galveston/Fort Bend/Harris)
//   *.ionwave.net         — IONWave (HISD, Houston ISD, Plano ISD)
//   *.workdayspend.com    — Workday Spend (UT System, Texas state agencies)
//   *.demandstar.com      — DemandStar (Texas/Houston aggregator)
//   *.publicpurchase.com  — Public Purchase (various TX cities)
//   *.bidcontract.com     — BidContract (TxDOT bid items index mirror)
//   each Texas county/city procurement subdomain — enumerated below
//
// Strictly additive: this module exports pure-function helpers consumed
// by detail-page-fetcher.ts. No side effects, no I/O.

const WILDCARD_WHITELIST: ReadonlyArray<string> = [
  '.bonfirehub.com',
  '.ionwave.net',
  '.workdayspend.com',
  '.demandstar.com',
  '.publicpurchase.com',
  '.bidcontract.com',
];

// Per-host whitelist for the Texas county/city procurement subdomains
// that we already crawl via SOURCE_ADAPTERS. Kept here so the policy
// surface is reviewable in one place.
const EXACT_WHITELIST: ReadonlyArray<string> = [
  'www.houstontx.gov',
  'purchasing.houstontx.gov',
  'www.fortbendcountytx.gov',
  'www.harriscountytx.gov',
  'www.galvestoncountytx.gov',
  'www.brazoria-county.com',
  'www.houston.gov',
  'www.houstonpublicworks.org',
  'www.ridemetro.org',
  'www.porthouston.com',
  'www.fortworthtexas.gov',
  'www.tarrantcounty.com',
  'www.dallasisd.org',
  'www.dfwairport.com',
  'www.arlingtontx.gov',
  'www.plano.gov',
  'www.garlandtx.gov',
  'www.cityofirving.org',
  'www.austintexas.gov',
  'www.abia.org',
  'www.traviscountytx.gov',
  'www.utsystem.edu',
  'www.sanantonio.gov',
  'www.bexar.org',
  'www.sanantonioairport.com',
  'www.nisd.net',
  'www.cctexas.com',
  'www.co.nueces.tx.us',
  'www.portofcc.com',
  'www.cityoflaredo.com',
  'data.texas.gov',
  // Z13 news + aggregator sources
  'www.enr.com',
  'www.txconstructionindustry.com',
  'www.bizjournals.com',
  'www.bxtexas.org',
];

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Sprint Z13 — true when the URL's host matches the Z13 whitelist and
 * the fetcher chain should SKIP robots.txt enforcement (proceed to the
 * tiered native → ScrapingBee → Playwright chain unconditionally).
 *
 * Returns false for everything else; the caller then runs the standard
 * RFC-9309 robots.txt check.
 */
export function isWhitelisted(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  if (EXACT_WHITELIST.includes(host)) return true;
  for (const suffix of WILDCARD_WHITELIST) {
    if (host === suffix.slice(1) || host.endsWith(suffix)) return true;
  }
  return false;
}

/**
 * Sprint Z13 — fetch-strategy hint per host. Hosts known to be behind
 * Cloudflare or bot-walled return 'bypass' so the fetcher chain skips
 * Layer 1 and goes straight to ScrapingBee/Playwright. Saves a guaranteed
 * 403 round-trip on every bonfire detail page.
 *
 * Default is 'tiered' — Layer 1 → Layer 2 → Layer 3 → Layer 4 in order.
 */
export type FetchStrategy = 'tiered' | 'bypass' | 'native_only';

const BYPASS_HOSTS: ReadonlyArray<string> = ['.bonfirehub.com', '.ionwave.net'];
const NATIVE_ONLY_HOSTS: ReadonlyArray<string> = ['data.texas.gov']; // Socrata serves clean JSON

export function fetchStrategyFor(url: string): FetchStrategy {
  const host = hostOf(url);
  if (!host) return 'tiered';
  for (const suffix of NATIVE_ONLY_HOSTS) {
    if (host === suffix || host.endsWith(suffix)) return 'native_only';
  }
  for (const suffix of BYPASS_HOSTS) {
    if (host === suffix.slice(1) || host.endsWith(suffix)) return 'bypass';
  }
  return 'tiered';
}
