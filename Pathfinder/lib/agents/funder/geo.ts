// lib/agents/funder/geo.ts
//
// Funder onboarding Stage 4 — deterministic hub assignment.
//
// Funder's geo model is fundamentally different from Zedcor's: no
// branches, no coverage radius, no haversine. The architecture's
// lead_unit.schema.geo_hub enum is the canonical set
// (sf-bay, nyc, dc-metro, boston, london, remote, other). This module
// maps a raw city/state pair to one of those hubs.
//
// Pure heuristic, no LLM. Returns 'other' when the input doesn't match
// any hub rule — keeping the assignment honest rather than guessing.
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 4.

export type FunderHub =
  | 'sf-bay'
  | 'nyc'
  | 'dc-metro'
  | 'boston'
  | 'london'
  | 'remote'
  | 'other';

interface HubInput {
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

const SF_BAY_CITIES = new Set([
  'san francisco',
  'oakland',
  'berkeley',
  'palo alto',
  'mountain view',
  'menlo park',
  'redwood city',
  'san mateo',
  'san jose',
  'cupertino',
  'sunnyvale',
  'fremont',
  'santa clara',
  'emeryville',
  'south san francisco',
]);

const NYC_CITIES = new Set([
  'new york',
  'new york city',
  'manhattan',
  'brooklyn',
  'queens',
  'bronx',
  'staten island',
  'jersey city',
  'hoboken',
]);

const DC_METRO_CITIES = new Set([
  'washington',
  'arlington',
  'alexandria',
  'bethesda',
  'silver spring',
  'reston',
  'mclean',
]);

const BOSTON_CITIES = new Set([
  'boston',
  'cambridge',
  'somerville',
  'brookline',
  'newton',
  'watertown',
]);

const LONDON_CITIES = new Set([
  'london',
  'greater london',
]);

export function assignHub(input: HubInput): FunderHub {
  const city = (input.city ?? '').toLowerCase().trim();
  const state = (input.state ?? '').toUpperCase().trim();
  const country = (input.country ?? '').toLowerCase().trim();

  // London is the easy disambiguation — if country is UK / GB or city is london in UK.
  if (LONDON_CITIES.has(city) && (!country || country === 'gbr' || country === 'gb' || country === 'uk' || country === 'united kingdom')) {
    return 'london';
  }

  // SF Bay: by city OR by state=CA with city blank but country=USA. (Conservative —
  // CA without a known SF Bay city falls through to 'other' rather than mislabeling LA.)
  if (SF_BAY_CITIES.has(city)) return 'sf-bay';

  // NYC: by city OR state=NY + likely NYC borough
  if (NYC_CITIES.has(city)) return 'nyc';
  if (state === 'NY' && (city === '' || city.includes('new york'))) return 'nyc';

  // DC metro
  if (DC_METRO_CITIES.has(city)) return 'dc-metro';
  if ((state === 'DC' || state === 'D.C.') && !city) return 'dc-metro';

  // Boston
  if (BOSTON_CITIES.has(city)) return 'boston';
  if (state === 'MA' && city === '') return 'boston';

  // No city + no state = remote (no signal at all)
  if (!city && !state) return 'remote';

  return 'other';
}
