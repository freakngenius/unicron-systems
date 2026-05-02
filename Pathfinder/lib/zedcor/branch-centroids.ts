// City-centroid lookup table for Zedcor's 34-branch list.
//
// Per SPEC - Zedcor Data Ingestion.md Appendix A. City-level precision is
// acceptable for the 200mi radius use case; specific branch street
// addresses are the post-pilot enhancement when CTO Kyle sends them.
//
// State-level entries (Alabama, Arkansas, Georgia, Illinois, Iowa,
// Missouri, Ohio, Oregon, Pennsylvania, South Carolina, Washington,
// Wisconsin) resolve to the most likely city for a Zedcor branch. For
// Pennsylvania this is Pittsburgh, matching the Tuesday demo plan's
// 200mi-from-Pittsburgh-Metro callout. Operator can override post-demo.

export type CentroidEntry = { lat: number; lon: number; city: string };

export const BRANCH_CENTROIDS: Record<string, CentroidEntry> = {
  // Canada
  'Calgary,AB': { lat: 51.0447, lon: -114.0719, city: 'Calgary' },
  'Chilliwack,BC': { lat: 49.1579, lon: -121.9515, city: 'Chilliwack' },
  'Leduc,AB': { lat: 53.2594, lon: -113.5520, city: 'Leduc' },
  'Ottawa,ON': { lat: 45.4215, lon: -75.6972, city: 'Ottawa' },
  'Toronto,ON': { lat: 43.6532, lon: -79.3832, city: 'Toronto' },
  'Winnipeg,MB': { lat: 49.8954, lon: -97.1385, city: 'Winnipeg' },
  // USA — explicit cities
  'Albuquerque,NM': { lat: 35.0844, lon: -106.6504, city: 'Albuquerque' },
  'Austin,TX': { lat: 30.2672, lon: -97.7431, city: 'Austin' },
  'Charlotte,NC': { lat: 35.2271, lon: -80.8431, city: 'Charlotte' },
  'Dallas,TX': { lat: 32.7767, lon: -96.797, city: 'Dallas' },
  'Denver,CO': { lat: 39.7392, lon: -104.9903, city: 'Denver' },
  'Houston,TX': { lat: 29.7604, lon: -95.3698, city: 'Houston' },
  'Jacksonville,FL': { lat: 30.3322, lon: -81.6557, city: 'Jacksonville' },
  'Las Vegas,NV': { lat: 36.1699, lon: -115.1398, city: 'Las Vegas' },
  'Los Angeles,CA': { lat: 34.0522, lon: -118.2437, city: 'Los Angeles' },
  'Midland,TX': { lat: 31.9974, lon: -102.0779, city: 'Midland' },
  'Nashville,TN': { lat: 36.1627, lon: -86.7816, city: 'Nashville' },
  'New York,NY': { lat: 40.7128, lon: -74.006, city: 'New York' },
  'Phoenix,AZ': { lat: 33.4484, lon: -112.074, city: 'Phoenix' },
  'Sacramento,CA': { lat: 38.5816, lon: -121.4944, city: 'Sacramento' },
  'San Antonio,TX': { lat: 29.4241, lon: -98.4936, city: 'San Antonio' },
  'Tampa,FL': { lat: 27.9506, lon: -82.4572, city: 'Tampa' },
  // USA — state-level entries resolved to most likely city
  'Alabama,AL': { lat: 32.3617, lon: -86.2792, city: 'Montgomery' },
  'Arkansas,AR': { lat: 34.7361, lon: -92.3311, city: 'Little Rock' },
  'Georgia,GA': { lat: 33.749, lon: -84.388, city: 'Atlanta' },
  'Illinois,IL': { lat: 41.8781, lon: -87.6298, city: 'Chicago' },
  'Iowa,IA': { lat: 41.5868, lon: -93.625, city: 'Des Moines' },
  'Missouri,MO': { lat: 38.627, lon: -90.1994, city: 'St. Louis' },
  'Ohio,OH': { lat: 39.9612, lon: -82.9988, city: 'Columbus' },
  'Oregon,OR': { lat: 45.5152, lon: -122.6784, city: 'Portland' },
  // Pennsylvania → Pittsburgh per Tuesday demo plan callout (200mi from
  // Pittsburgh Metro). Operator can override if Zedcor's PA branch is
  // actually Philadelphia or elsewhere.
  'Pennsylvania,PA': { lat: 40.4406, lon: -79.9959, city: 'Pittsburgh' },
  'South Carolina,SC': { lat: 34.0007, lon: -81.0348, city: 'Columbia' },
  'Washington,WA': { lat: 47.6062, lon: -122.3321, city: 'Seattle' },
  'Wisconsin,WI': { lat: 43.0389, lon: -87.9065, city: 'Milwaukee' },
};

export function lookupCentroid(branchName: string, state: string): CentroidEntry | null {
  const key = `${branchName},${state}`;
  return BRANCH_CENTROIDS[key] ?? null;
}
