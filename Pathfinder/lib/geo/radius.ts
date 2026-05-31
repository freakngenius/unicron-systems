// lib/geo/radius.ts — radius expansion utilities for ICP Saved Search.
//
// SPEC: docs/SPEC-ICP-Search.md (S2 slice).
//
// Pure functions. No DB, no fetch — safe to call from anywhere.

import { haversineMiles } from '@/lib/scoring';
import { centroidByCode, type StateCentroid } from '@/lib/zedcor/state-centroids';

const ALL_STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL',
  'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
  'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI',
  'WY', 'PR', 'VI', 'GU',
] as const;

/**
 * Return all 2-letter US state codes whose population centroid lies within
 * `radius_mi` of `(lat, lon)`. Always includes the closest state regardless
 * of radius — even a radius of 0 returns the state the point falls in.
 *
 * State centroids are coarse (the spec acknowledges this), so the radius is
 * treated as an inclusion fence around the metro itself: any state whose
 * centroid is within `radius_mi + STATE_INCLUSION_PAD_MILES` is included.
 * The pad widens the catchment so e.g. a Houston query with radius 200mi
 * still includes LA + OK + AR + MS + NM, not just TX.
 */
export const STATE_INCLUSION_PAD_MILES = 250;

export function statesWithinRadius(
  lat: number,
  lon: number,
  radius_mi: number,
): string[] {
  const ranked: { code: string; distance: number }[] = [];
  for (const code of ALL_STATE_CODES) {
    const c = centroidByCode(code);
    if (!c) continue;
    const distance = haversineMiles(lat, lon, c.lat, c.lon);
    ranked.push({ code, distance });
  }
  ranked.sort((a, b) => a.distance - b.distance);
  const fence = Math.max(0, radius_mi) + STATE_INCLUSION_PAD_MILES;
  const included = ranked.filter((r) => r.distance <= fence).map((r) => r.code);
  if (included.length === 0 && ranked.length > 0) {
    return [ranked[0]!.code];
  }
  return included;
}

/**
 * Cheap rectangular bbox around `(lat, lon)` extending `radius_mi` in each
 * cardinal direction. Uses the small-angle approximation — fine for the
 * radii the front-page form accepts (<= 500mi). Returned bounds are
 * unconditionally clamped to the WGS84 envelope.
 */
const MILES_PER_DEGREE_LAT = 69.0;

export function bboxFromCenterAndRadius(
  lat: number,
  lon: number,
  radius_mi: number,
): { north: number; south: number; east: number; west: number } {
  const r = Math.max(0, radius_mi);
  const latDelta = r / MILES_PER_DEGREE_LAT;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  // Guard the polar case: at the poles cosLat → 0 and lon delta blows up.
  const lonDelta = cosLat > 1e-6 ? r / (MILES_PER_DEGREE_LAT * cosLat) : 180;
  return {
    north: Math.min(90, lat + latDelta),
    south: Math.max(-90, lat - latDelta),
    east: Math.min(180, lon + lonDelta),
    west: Math.max(-180, lon - lonDelta),
  };
}

/**
 * Rank a list of state centroids by haversine distance from `(lat, lon)`.
 * Returned closest-first. Used by callers that want the nearest few states
 * regardless of radius (e.g. to seed Tier 2 templates with the operator's
 * "home" state at the front of the list).
 */
export function rankStatesByDistance(
  lat: number,
  lon: number,
): { centroid: StateCentroid; distance_mi: number }[] {
  const out: { centroid: StateCentroid; distance_mi: number }[] = [];
  for (const code of ALL_STATE_CODES) {
    const c = centroidByCode(code);
    if (!c) continue;
    out.push({ centroid: c, distance_mi: haversineMiles(lat, lon, c.lat, c.lon) });
  }
  out.sort((a, b) => a.distance_mi - b.distance_mi);
  return out;
}
