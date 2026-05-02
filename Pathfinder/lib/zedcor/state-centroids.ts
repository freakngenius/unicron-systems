// lib/zedcor/state-centroids.ts — state-level fallback geocoder.
//
// The Ingestor (USAspending + SAM.gov) returns place-of-performance state
// codes but no lat/lon. For the Tuesday demo we need every newly-ingested
// project mapped to its nearest Zedcor branch so the radius map and
// branch-filtered lead lists actually have rows.
//
// State-level centroid is the simplest deterministic fallback that is good
// enough at 200mi radius: most projects in TN end up nearest to Nashville,
// most in PA end up nearest to Pittsburgh's Pennsylvania-coded branch, etc.
// Replaceable later by a real geocoder (Mapbox/Google) when we want street
// accuracy.
//
// Source: NOAA / U.S. Census state population centers. Coverage: 50 states +
// DC + PR + VI + GU. Codes are the standard 2-letter postal codes returned
// by both ingestor sources.

export interface StateCentroid {
  state_code: string;
  state_name: string;
  lat: number;
  lon: number;
}

const RAW: ReadonlyArray<readonly [string, string, number, number]> = [
  ['AL', 'Alabama', 32.806671, -86.79113],
  ['AK', 'Alaska', 61.370716, -152.404419],
  ['AZ', 'Arizona', 33.729759, -111.431221],
  ['AR', 'Arkansas', 34.969704, -92.373123],
  ['CA', 'California', 36.116203, -119.681564],
  ['CO', 'Colorado', 39.059811, -105.311104],
  ['CT', 'Connecticut', 41.597782, -72.755371],
  ['DE', 'Delaware', 39.318523, -75.507141],
  ['DC', 'District of Columbia', 38.897438, -77.026817],
  ['FL', 'Florida', 27.766279, -81.686783],
  ['GA', 'Georgia', 33.040619, -83.643074],
  ['HI', 'Hawaii', 21.094318, -157.498337],
  ['ID', 'Idaho', 44.240459, -114.478828],
  ['IL', 'Illinois', 40.349457, -88.986137],
  ['IN', 'Indiana', 39.849426, -86.258278],
  ['IA', 'Iowa', 42.011539, -93.210526],
  ['KS', 'Kansas', 38.5266, -96.726486],
  ['KY', 'Kentucky', 37.66814, -84.670067],
  ['LA', 'Louisiana', 31.169546, -91.867805],
  ['ME', 'Maine', 44.693947, -69.381927],
  ['MD', 'Maryland', 39.063946, -76.802101],
  ['MA', 'Massachusetts', 42.230171, -71.530106],
  ['MI', 'Michigan', 43.326618, -84.536095],
  ['MN', 'Minnesota', 45.694454, -93.900192],
  ['MS', 'Mississippi', 32.741646, -89.678696],
  ['MO', 'Missouri', 38.456085, -92.288368],
  ['MT', 'Montana', 46.921925, -110.454353],
  ['NE', 'Nebraska', 41.12537, -98.268082],
  ['NV', 'Nevada', 38.313515, -117.055374],
  ['NH', 'New Hampshire', 43.452492, -71.563896],
  ['NJ', 'New Jersey', 40.298904, -74.521011],
  ['NM', 'New Mexico', 34.840515, -106.248482],
  ['NY', 'New York', 42.165726, -74.948051],
  ['NC', 'North Carolina', 35.630066, -79.806419],
  ['ND', 'North Dakota', 47.528912, -99.784012],
  ['OH', 'Ohio', 40.388783, -82.764915],
  ['OK', 'Oklahoma', 35.565342, -96.928917],
  ['OR', 'Oregon', 44.572021, -122.070938],
  ['PA', 'Pennsylvania', 40.590752, -77.209755],
  ['RI', 'Rhode Island', 41.680893, -71.51178],
  ['SC', 'South Carolina', 33.856892, -80.945007],
  ['SD', 'South Dakota', 44.299782, -99.438828],
  ['TN', 'Tennessee', 35.747845, -86.692345],
  ['TX', 'Texas', 31.054487, -97.563461],
  ['UT', 'Utah', 40.150032, -111.862434],
  ['VT', 'Vermont', 44.045876, -72.710686],
  ['VA', 'Virginia', 37.769337, -78.169968],
  ['WA', 'Washington', 47.400902, -121.490494],
  ['WV', 'West Virginia', 38.491226, -80.954453],
  ['WI', 'Wisconsin', 44.268543, -89.616508],
  ['WY', 'Wyoming', 42.755966, -107.30249],
  ['PR', 'Puerto Rico', 18.220833, -66.590149],
  ['VI', 'U.S. Virgin Islands', 18.335765, -64.896335],
  ['GU', 'Guam', 13.444304, 144.793731],
];

const BY_CODE = new Map<string, StateCentroid>();
const BY_NAME = new Map<string, StateCentroid>();
for (const [code, name, lat, lon] of RAW) {
  const row: StateCentroid = { state_code: code, state_name: name, lat, lon };
  BY_CODE.set(code, row);
  BY_NAME.set(name.toLowerCase(), row);
}

/** Return the population centroid for a US state code (2-letter postal). */
export function centroidByCode(code: string | null | undefined): StateCentroid | null {
  if (!code) return null;
  const norm = code.trim().toUpperCase();
  if (norm.length !== 2) return null;
  return BY_CODE.get(norm) ?? null;
}

/** Return the population centroid for a US state name (case-insensitive). */
export function centroidByName(name: string | null | undefined): StateCentroid | null {
  if (!name) return null;
  return BY_NAME.get(name.trim().toLowerCase()) ?? null;
}

/**
 * Best-effort extraction of a state code from an ingestor raw_payload blob.
 * Covers the four shapes seen in production data:
 *   - USAspending: { 'Place of Performance State Code': 'TN' }
 *   - SAM.gov v2 API: { placeOfPerformance: { state: { code: 'TN', name: 'Tennessee' } } }
 *   - SAM.gov real-world: { place_of_performance: 'Memphis, TN' }  (string)
 *   - Z-A seeded sam.gov rows: { place_of_performance: 'Stickney, IL' }
 */
export function extractStateFromPayload(
  payload: Record<string, unknown> | null | undefined,
): StateCentroid | null {
  if (!payload) return null;

  // Shape 1 — USAspending
  const usCode = payload['Place of Performance State Code'];
  if (typeof usCode === 'string') {
    const c = centroidByCode(usCode);
    if (c) return c;
  }

  // Shape 2 — SAM.gov v2 nested object
  const sgPop = payload['placeOfPerformance'];
  if (sgPop && typeof sgPop === 'object') {
    const state = (sgPop as { state?: unknown }).state;
    if (state && typeof state === 'object') {
      const code = (state as { code?: unknown }).code;
      if (typeof code === 'string') {
        const c = centroidByCode(code);
        if (c) return c;
      }
      const name = (state as { name?: unknown }).name;
      if (typeof name === 'string') {
        const c = centroidByName(name);
        if (c) return c;
      }
    } else if (typeof state === 'string') {
      const c = centroidByCode(state) ?? centroidByName(state);
      if (c) return c;
    }
  }

  // Shape 3/4 — flat 'place_of_performance' string like "Memphis, TN" or
  // "Stickney, IL". Take the trailing 2 chars after the last comma.
  const flat = payload['place_of_performance'];
  if (typeof flat === 'string' && flat.includes(',')) {
    const tail = flat.split(',').pop()?.trim() ?? '';
    // tail might be "TN" or "TN 38133" or "Tennessee"
    const codeMatch = tail.match(/^([A-Za-z]{2})\b/);
    if (codeMatch) {
      const c = centroidByCode(codeMatch[1]);
      if (c) return c;
    }
    const c = centroidByName(tail);
    if (c) return c;
  }

  return null;
}
