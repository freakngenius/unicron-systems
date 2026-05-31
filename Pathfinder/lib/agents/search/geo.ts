// lib/agents/search/geo.ts — resolveGeoRadius for ICP Saved Search.
//
// SPEC: docs/SPEC-ICP-Search.md (S2 slice).
//
// Geocodes the operator-typed region string, then expands the search to
// every US state whose population centroid lies within (radius + pad) of
// the geocoded center. Honest about coverage: counties + metros come back
// empty because we don't yet ship a CBSA / county dataset in-repo; states
// alone satisfy the SAM.gov / USAspending place-of-performance filters.
//
// Dependencies are injected so unit tests don't hit Google Geocoding.

import {
  geocodeLocation as geocodeLocationLive,
  type GeocodeResult,
} from '@/lib/zedcor/google-geocoder';
import {
  centroidByCode,
  centroidByName,
  type StateCentroid,
} from '@/lib/zedcor/state-centroids';
import {
  bboxFromCenterAndRadius,
  statesWithinRadius,
} from '@/lib/geo/radius';
import type { GeoExpansion } from './types';

export interface GeoDeps {
  geocodeLocation?: (args: {
    city?: string | null;
    state?: string | null;
    country?: string | null;
    zip?: string | null;
    timeoutMs?: number;
  }) => Promise<GeocodeResult | null>;
}

const ZIP_RE = /\b\d{5}(?:-\d{4})?\b/;
const STATE_CODE_RE = /\b([A-Z]{2})\b/;

interface ParsedRegion {
  city: string | null;
  state: string | null;
  zip: string | null;
}

export function parseRegionString(region: string): ParsedRegion {
  const cleaned = (region ?? '').trim();
  if (!cleaned) return { city: null, state: null, zip: null };

  const zipMatch = cleaned.match(ZIP_RE);
  const zip = zipMatch ? zipMatch[0] : null;

  const parts = cleaned
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  let city: string | null = null;
  let state: string | null = null;

  if (parts.length >= 2) {
    const head = parts[0] ?? '';
    // A bare zip in the first slot is not a city; leave city null in that case.
    if (!ZIP_RE.test(head)) city = head;
    const tail = parts[parts.length - 1] ?? '';
    const codeMatch = tail.match(STATE_CODE_RE);
    if (codeMatch) state = codeMatch[1] ?? null;
    else if (centroidByName(tail)) state = centroidByName(tail)!.state_code;
  } else if (parts.length === 1) {
    const only = parts[0] ?? '';
    if (ZIP_RE.test(only)) {
      // Pure zip query — already captured in `zip`; nothing else to do.
    } else {
      const codeMatch = only.match(STATE_CODE_RE);
      if (codeMatch && only.length <= 3) {
        state = codeMatch[1] ?? null;
      } else if (centroidByName(only)) {
        state = centroidByName(only)!.state_code;
      } else {
        city = only;
      }
    }
  }
  return { city, state, zip };
}

function stateFromCenterFallback(state: string | null): StateCentroid | null {
  if (!state) return null;
  return centroidByCode(state) ?? centroidByName(state);
}

/**
 * Resolve a region+radius pair to a GeoExpansion. Region is a free-form
 * string ("Houston, TX", "94103", "California"). Radius is in miles; values
 * outside [0, 1000] are clamped.
 *
 * Geocoding hit: returns the precise center plus radius-fenced states.
 * Geocoding miss: falls back to the state centroid parsed out of the region
 * string. Total miss (no usable signal): throws — the search cannot proceed
 * without at least a coarse anchor.
 */
export async function resolveGeoRadius(
  region: string,
  radius_mi: number,
  deps: GeoDeps = {},
): Promise<GeoExpansion> {
  const cleanedRegion = (region ?? '').trim();
  if (!cleanedRegion) {
    throw new Error('resolveGeoRadius: region must not be empty');
  }
  const clampedRadius = Math.max(0, Math.min(1000, Math.round(radius_mi ?? 0)));

  const geocode = deps.geocodeLocation ?? geocodeLocationLive;
  const parsed = parseRegionString(cleanedRegion);

  let lat: number | null = null;
  let lon: number | null = null;
  let label = cleanedRegion;

  const geo = await geocode({
    city: parsed.city,
    state: parsed.state,
    country: 'US',
    zip: parsed.zip,
  });
  if (geo && typeof geo.lat === 'number' && typeof geo.lon === 'number') {
    lat = geo.lat;
    lon = geo.lon;
  } else {
    const fallback = stateFromCenterFallback(parsed.state);
    if (fallback) {
      lat = fallback.lat;
      lon = fallback.lon;
      label = `${cleanedRegion} (state centroid)`;
    }
  }
  if (lat == null || lon == null) {
    throw new Error(
      `resolveGeoRadius: could not resolve region "${cleanedRegion}" via geocoder or state centroid fallback`,
    );
  }

  const states = statesWithinRadius(lat, lon, clampedRadius);
  // Ensure the parsed state is present even when its centroid sits just
  // outside the radius+pad fence (e.g. a SoCal query whose center is closer
  // to NV than to the CA centroid).
  if (parsed.state && !states.includes(parsed.state)) states.unshift(parsed.state);
  const bbox = bboxFromCenterAndRadius(lat, lon, clampedRadius);

  return {
    region: cleanedRegion,
    radius_mi: clampedRadius,
    center: { lat, lon, label },
    states,
    counties: [],
    metros: [],
    bbox,
  };
}
