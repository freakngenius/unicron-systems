// lib/zedcor/google-geocoder.ts — Z-F finish Option B: real city/zip geocoder.
//
// Replaces the state-centroid fallback (lib/zedcor/state-centroids.ts) as the
// primary coord-resolution path when the source payload carries a city +
// state but no explicit lat/lon. State-centroids are too coarse for big
// states (PA centroid is 146mi from Pittsburgh; CA centroid is 164mi from
// LA), which collapsed Pittsburgh and LA scores during the Z-F integrator
// run. This module hits Google Maps Geocoding API for precise lat/lon.
//
// Cost: $5 / 1k geocodes. With ~150 null-coord projects + 200 fresh leads
// per cron tick, full backfill ≤ $0.75. New ingest cycles ≤ $1/day.
//
// Caching: in-memory Map keyed by `${city}|${state}|${country}`. The
// process is a Vercel Lambda so the cache is per-invocation, but adapters
// repeat the same metros within a single cycle. Caching halves call
// volume in practice.
//
// Auth: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is reused. The same key powers
// the dashboard map; restrict it server-side via API key restrictions in
// Google Cloud if exposure is a concern. Server-side fetch is fine because
// Vercel cron Lambdas don't expose env to the client.

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

export interface GeocodeResult {
  lat: number;
  lon: number;
  /** 0..1 — derived from Google's `location_type`. */
  confidence: number;
  /** Google's place_id for caching / debugging. */
  place_id: string | null;
}

const cache = new Map<string, GeocodeResult | null>();

function cacheKey(city: string | null, state: string | null, country: string | null): string {
  return [
    (city ?? '').trim().toLowerCase(),
    (state ?? '').trim().toUpperCase(),
    (country ?? '').trim().toUpperCase(),
  ].join('|');
}

function locationTypeToConfidence(t: string | undefined): number {
  // Google Maps location_type values, ordered by precision.
  switch (t) {
    case 'ROOFTOP':
      return 1.0;
    case 'RANGE_INTERPOLATED':
      return 0.9;
    case 'GEOMETRIC_CENTER':
      return 0.8;
    case 'APPROXIMATE':
      return 0.7;
    default:
      return 0.6;
  }
}

interface GoogleGeocodeResponse {
  status?: string;
  results?: Array<{
    geometry?: {
      location?: { lat?: number; lng?: number };
      location_type?: string;
    };
    place_id?: string;
  }>;
  error_message?: string;
}

/** Geocode a (city, state, country) triple to lat/lon. Returns null when
 *  Google can't resolve, the API key is missing, or the call errors. */
export async function geocodeLocation(args: {
  city?: string | null;
  state?: string | null;
  country?: string | null;
  zip?: string | null;
  /** Hard timeout (ms). Default 8s — safely under Vercel cron's 60s. */
  timeoutMs?: number;
}): Promise<GeocodeResult | null> {
  const { city, state, country, zip, timeoutMs = 8_000 } = args;

  const apiKey =
    process.env.GOOGLE_GEOCODING_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  if (!apiKey) return null;

  const trimmedCity = (city ?? '').trim();
  const trimmedState = (state ?? '').trim();
  const trimmedCountry = (country ?? '').trim();
  const trimmedZip = (zip ?? '').trim();

  if (!trimmedCity && !trimmedState && !trimmedZip) return null;

  const key = `${cacheKey(trimmedCity, trimmedState, trimmedCountry)}|${trimmedZip}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  // Build the address query string. Google geocoding handles loose formats:
  // "Pittsburgh, PA, USA" or "94103" or "Sacramento, California".
  const parts: string[] = [];
  if (trimmedCity) parts.push(trimmedCity);
  if (trimmedState) parts.push(trimmedState);
  if (trimmedZip) parts.push(trimmedZip);
  if (trimmedCountry) parts.push(trimmedCountry);
  const address = parts.join(', ');

  const params = new URLSearchParams({ address, key: apiKey });

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(`${GEOCODE_URL}?${params.toString()}`, {
      method: 'GET',
      signal: ac.signal,
    });
    if (!res.ok) {
      cache.set(key, null);
      return null;
    }
    const json = (await res.json()) as GoogleGeocodeResponse;
    if (json.status !== 'OK' || !json.results || json.results.length === 0) {
      cache.set(key, null);
      return null;
    }
    const top = json.results[0];
    const lat = top?.geometry?.location?.lat;
    const lon = top?.geometry?.location?.lng;
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      cache.set(key, null);
      return null;
    }
    const result: GeocodeResult = {
      lat,
      lon,
      confidence: locationTypeToConfidence(top?.geometry?.location_type),
      place_id: top?.place_id ?? null,
    };
    cache.set(key, result);
    return result;
  } catch {
    // Network / timeout / abort — cache the miss to avoid retry storms in
    // the same Lambda invocation.
    cache.set(key, null);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Test-only — clear the in-memory cache between unit-test cases. */
export function __resetGeocoderCache(): void {
  cache.clear();
}
