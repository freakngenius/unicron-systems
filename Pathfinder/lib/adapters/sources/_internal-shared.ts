// lib/adapters/sources/_internal-shared.ts
//
// Shared constants and helpers used by the six Internal source adapters
// (Pathfinder org #4, slug 'internal'). These adapters target construction-
// vertical B2B prospects; the construction NAICS codes here are the
// canonical filter set from Pathfinder-Internal-Blueprint.md §8.
//
// Spec: Pathfinder/Pathfinder-Internal-Blueprint.md §8 (sources priorities)
//       Pathfinder/docs/PLAN-internal-onboarding.md §"Stage 5, Source adapters".

/**
 * Construction-vertical NAICS codes used to filter every Internal adapter
 * that supports server-side NAICS filtering (sam-gov, usaspending).
 *
 * - 236: Construction of Buildings
 * - 237: Heavy and Civil Engineering Construction
 * - 238: Specialty Trade Contractors
 * - 532412: Construction, Mining & Forestry Machinery Rental & Leasing
 *           (covers equipment-rental / temp-power / crane-rental motions)
 */
export const CONSTRUCTION_NAICS = ['236', '237', '238', '532412'] as const;

/**
 * NAICS family prefix check. Used by qualifier-style filters that compare
 * a 6-digit NAICS code against the 3-digit family codes above. Matches
 * "236*", "237*", "238*", or exact "532412".
 */
export function isConstructionNaics(naics: string | null | undefined): boolean {
  if (!naics) return false;
  const n = String(naics).trim();
  if (!n) return false;
  return n.startsWith('236') || n.startsWith('237') || n.startsWith('238') || n === '532412';
}

/**
 * User-agent shared by every Internal adapter. Mirrors the Funder pattern
 * so polite-fetch behavior is consistent across orgs.
 */
export const INTERNAL_UA = 'Pathfinder/Internal (kyle@freakngenius.com)';

/**
 * Construction-sales keyword set. Used by the job-postings adapter to
 * filter raw Greenhouse / aggregator jobs down to sales / BD roles that
 * are construction-vertical relevant. Matches against title + department.
 */
export const SALES_TITLE_KEYWORDS = [
  'sales',
  'account executive',
  'business development',
  'bd ',
  'bdr',
  'sdr',
  'territory',
  'commercial',
  'go-to-market',
  'go to market',
  'pre-sales',
  'presales',
];

/**
 * Construction-vertical keyword set. Used together with SALES_TITLE_KEYWORDS
 * by the job-postings adapter when filtering jobs from non-construction-
 * dedicated boards (e.g. a horizontal B2B SaaS that occasionally hires for
 * a construction GTM team).
 */
export const CONSTRUCTION_KEYWORDS = [
  'construction',
  'contractor',
  'jobsite',
  'job site',
  'building',
  'civil engineering',
  'specialty trade',
  'equipment rental',
  'temp fence',
  'modular',
  'crane',
  'roofing',
  'site services',
];
