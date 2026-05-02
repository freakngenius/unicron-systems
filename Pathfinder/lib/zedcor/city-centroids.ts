// lib/zedcor/city-centroids.ts — small US/CAN city lookup for the
// coordinate-extraction fallback (Demo Polish P1, Layer B).
//
// Used by lib/geography/coord-extractor.ts when the Haiku model returns a
// city/state pair for a project that arrived with null lat/lon. We don't
// need full CLI-level coverage — the Tuesday demo Zedcor branches map
// onto a few dozen MSAs, and SAM.gov / USAspending payloads tend to
// reference recognizable city names when they reference one at all.
//
// State centroid stays as the fallback within state (lib/zedcor/state-
// centroids.ts), so even if a city isn't in this table the project still
// gets a plausible coordinate. This file just sharpens the location for
// the major MSAs the lead list shows most often.

import { centroidByCode } from './state-centroids';

export interface CityCentroid {
  city: string; // lower-case, trimmed
  state: string; // 2-letter postal
  lat: number;
  lon: number;
}

const RAW: ReadonlyArray<readonly [string, string, number, number]> = [
  // US — Zedcor branch cities + major MSAs the demo data references.
  ['nashville', 'TN', 36.1627, -86.7816],
  ['memphis', 'TN', 35.1495, -90.049],
  ['knoxville', 'TN', 35.9606, -83.9207],
  ['chattanooga', 'TN', 35.0456, -85.3097],
  ['pittsburgh', 'PA', 40.4406, -79.9959],
  ['philadelphia', 'PA', 39.9526, -75.1652],
  ['harrisburg', 'PA', 40.2732, -76.8867],
  ['los angeles', 'CA', 34.0522, -118.2437],
  ['san francisco', 'CA', 37.7749, -122.4194],
  ['san diego', 'CA', 32.7157, -117.1611],
  ['sacramento', 'CA', 38.5816, -121.4944],
  ['fresno', 'CA', 36.7378, -119.7871],
  ['houston', 'TX', 29.7604, -95.3698],
  ['austin', 'TX', 30.2672, -97.7431],
  ['dallas', 'TX', 32.7767, -96.797],
  ['san antonio', 'TX', 29.4241, -98.4936],
  ['fort worth', 'TX', 32.7555, -97.3308],
  ['midland', 'TX', 31.9974, -102.0779],
  ['el paso', 'TX', 31.7619, -106.485],
  ['atlanta', 'GA', 33.749, -84.388],
  ['savannah', 'GA', 32.0809, -81.0912],
  ['phoenix', 'AZ', 33.4484, -112.074],
  ['tucson', 'AZ', 32.2226, -110.9747],
  ['las vegas', 'NV', 36.1699, -115.1398],
  ['reno', 'NV', 39.5296, -119.8138],
  ['denver', 'CO', 39.7392, -104.9903],
  ['colorado springs', 'CO', 38.8339, -104.8214],
  ['seattle', 'WA', 47.6062, -122.3321],
  ['tacoma', 'WA', 47.2529, -122.4443],
  ['spokane', 'WA', 47.6588, -117.426],
  ['portland', 'OR', 45.5152, -122.6784],
  ['eugene', 'OR', 44.0521, -123.0868],
  ['new york', 'NY', 40.7128, -74.006],
  ['buffalo', 'NY', 42.8864, -78.8784],
  ['rochester', 'NY', 43.1566, -77.6088],
  ['chicago', 'IL', 41.8781, -87.6298],
  ['stickney', 'IL', 41.8194, -87.7836],
  ['boston', 'MA', 42.3601, -71.0589],
  ['miami', 'FL', 25.7617, -80.1918],
  ['orlando', 'FL', 28.5383, -81.3792],
  ['tampa', 'FL', 27.9506, -82.4572],
  ['jacksonville', 'FL', 30.3322, -81.6557],
  ['detroit', 'MI', 42.3314, -83.0458],
  ['cleveland', 'OH', 41.4993, -81.6944],
  ['columbus', 'OH', 39.9612, -82.9988],
  ['cincinnati', 'OH', 39.1031, -84.512],
  ['indianapolis', 'IN', 39.7684, -86.1581],
  ['st. louis', 'MO', 38.627, -90.1994],
  ['saint louis', 'MO', 38.627, -90.1994],
  ['kansas city', 'MO', 39.0997, -94.5786],
  ['minneapolis', 'MN', 44.9778, -93.265],
  ['saint paul', 'MN', 44.9537, -93.09],
  ['milwaukee', 'WI', 43.0389, -87.9065],
  ['madison', 'WI', 43.0731, -89.4012],
  ['charlotte', 'NC', 35.2271, -80.8431],
  ['raleigh', 'NC', 35.7796, -78.6382],
  ['greensboro', 'NC', 36.0726, -79.7919],
  ['charleston', 'SC', 32.7765, -79.9311],
  ['columbia', 'SC', 34.0007, -81.0348],
  ['louisville', 'KY', 38.2527, -85.7585],
  ['lexington', 'KY', 38.0406, -84.5037],
  ['birmingham', 'AL', 33.5186, -86.8104],
  ['mobile', 'AL', 30.6954, -88.0399],
  ['huntsville', 'AL', 34.7304, -86.5861],
  ['new orleans', 'LA', 29.9511, -90.0715],
  ['baton rouge', 'LA', 30.4515, -91.1871],
  ['oklahoma city', 'OK', 35.4676, -97.5164],
  ['tulsa', 'OK', 36.154, -95.9928],
  ['little rock', 'AR', 34.7465, -92.2896],
  ['salt lake city', 'UT', 40.7608, -111.891],
  ['boise', 'ID', 43.615, -116.2023],
  ['anchorage', 'AK', 61.2181, -149.9003],
  ['honolulu', 'HI', 21.3069, -157.8583],
  ['washington', 'DC', 38.8951, -77.0364],
  ['baltimore', 'MD', 39.2904, -76.6122],
  ['richmond', 'VA', 37.5407, -77.436],
  ['norfolk', 'VA', 36.8508, -76.2859],
  ['virginia beach', 'VA', 36.8529, -75.978],
  ['albuquerque', 'NM', 35.0844, -106.6504],
  ['santa fe', 'NM', 35.6869, -105.9378],
  ['des moines', 'IA', 41.5868, -93.625],
  ['omaha', 'NE', 41.2565, -95.9345],
  ['wichita', 'KS', 37.6872, -97.3301],
  // Canada — for Zedcor's Calgary / Edmonton / Toronto / Ottawa / Winnipeg / BC branches.
  ['calgary', 'AB', 51.0447, -114.0719],
  ['edmonton', 'AB', 53.5461, -113.4938],
  ['leduc', 'AB', 53.2594, -113.552],
  ['toronto', 'ON', 43.6532, -79.3832],
  ['ottawa', 'ON', 45.4215, -75.6972],
  ['winnipeg', 'MB', 49.8954, -97.1385],
  ['vancouver', 'BC', 49.2827, -123.1207],
  ['chilliwack', 'BC', 49.1579, -121.9515],
  ['montreal', 'QC', 45.5017, -73.5673],
  ['quebec city', 'QC', 46.8139, -71.208],
];

const BY_KEY = new Map<string, CityCentroid>();
for (const [city, state, lat, lon] of RAW) {
  BY_KEY.set(`${city}|${state}`, { city, state, lat, lon });
  // Also key by city alone — first-write-wins so the more populous city
  // (typically listed first) takes precedence on ambiguous lookups.
  if (!BY_KEY.has(city)) {
    BY_KEY.set(city, { city, state, lat, lon });
  }
}

/** Resolve a city + (optional) 2-letter state to a centroid. Falls back to
 *  the state centroid when the city isn't in the table; returns null when
 *  neither yields a hit. */
export function centroidForCity(
  city: string | null | undefined,
  state: string | null | undefined,
): { lat: number; lon: number } | null {
  const c = (city ?? '').trim().toLowerCase();
  const s = (state ?? '').trim().toUpperCase();
  if (c && s) {
    const exact = BY_KEY.get(`${c}|${s}`);
    if (exact) return { lat: exact.lat, lon: exact.lon };
  }
  if (c) {
    const cityOnly = BY_KEY.get(c);
    if (cityOnly) return { lat: cityOnly.lat, lon: cityOnly.lon };
  }
  if (s) {
    const stateCentroid = centroidByCode(s);
    if (stateCentroid) return { lat: stateCentroid.lat, lon: stateCentroid.lon };
  }
  return null;
}
