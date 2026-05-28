// lib/adapters/zedcor/construction-keywords.ts
//
// Sprint Z12 — shared construction-relevance gate.
//
// Used by:
//   - cross-pollination.ts        (skip fuzzy-match against zedcor_customer_sites
//                                  when the project title isn't construction-relevant)
//   - notion/zedcor-writer.ts     (pre-window solicitation rows only push to
//                                  Notion when the title passes this gate)
//
// Why a shared module: the keyword list is canonical; centralising prevents
// the two callers from drifting out of sync. Pure function, no I/O.
//
// Spec: SPEC-zedcor-z12-gc-enrichment-fixes.md §"File ownership" →
//   "Project title or summary must contain at least one of:
//    rehab, replacement, construction, renovation, repair, improvement,
//    expansion, infrastructure, channel, bridge, road, paving, roof,
//    HVAC, mechanical, demolition, drainage, water, levee, basin, dock,
//    building, facility, site. If no match, skip cross-pollination
//    evaluation. Prevents matches like 'FRENCH PRESS' → National Homes."

export const CONSTRUCTION_KEYWORDS: readonly string[] = [
  'rehab',
  'replacement',
  'construction',
  'renovation',
  'repair',
  'improvement',
  'expansion',
  'infrastructure',
  'channel',
  'bridge',
  'road',
  'paving',
  'roof',
  'hvac',
  'mechanical',
  'demolition',
  'drainage',
  'water',
  'levee',
  'basin',
  'dock',
  'building',
  'facility',
  'site',
];

const KEYWORD_REGEX = new RegExp(
  // word-boundary on each side; case-insensitive
  `\\b(?:${CONSTRUCTION_KEYWORDS.map(escapeRe).join('|')})\\b`,
  'i',
);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns true if any of the supplied text fragments contains at least one
 * construction keyword. Null/undefined fragments are ignored.
 *
 * Intentionally lenient: a single hit on title OR summary OR any one
 * fragment is enough to pass. The goal is to filter OUT federal product
 * contracts (coffee makers, contact lenses, dental supplies), not to
 * gate-keep against real Texas construction work that happens to use
 * unusual wording.
 */
export function isConstructionRelevant(
  ...fragments: Array<string | null | undefined>
): boolean {
  for (const f of fragments) {
    if (!f) continue;
    if (KEYWORD_REGEX.test(f)) return true;
  }
  return false;
}
