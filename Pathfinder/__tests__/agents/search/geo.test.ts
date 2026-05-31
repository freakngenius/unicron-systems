// __tests__/agents/search/geo.test.ts — ICP Saved Search S2.
//
// Geocoder is mocked; verifies parse + expand + bbox + fallback.

import { describe, it, expect, vi } from 'vitest';
import { parseRegionString, resolveGeoRadius } from '@/lib/agents/search/geo';

describe('parseRegionString', () => {
  it('splits "City, ST" into city + state', () => {
    expect(parseRegionString('Houston, TX')).toEqual({ city: 'Houston', state: 'TX', zip: null });
  });

  it('extracts a US zip', () => {
    expect(parseRegionString('94103')).toEqual({ city: null, state: null, zip: '94103' });
  });

  it('recognizes a full state name', () => {
    expect(parseRegionString('California')).toEqual({ city: null, state: 'CA', zip: null });
  });

  it('returns nulls for an empty input', () => {
    expect(parseRegionString('')).toEqual({ city: null, state: null, zip: null });
  });

  it('keeps a city-only entry as city', () => {
    expect(parseRegionString('Houston')).toEqual({ city: 'Houston', state: null, zip: null });
  });
});

describe('resolveGeoRadius', () => {
  it('throws on empty region', async () => {
    await expect(resolveGeoRadius('', 100)).rejects.toThrow(/must not be empty/);
  });

  it('uses the geocoded center when the geocoder hits', async () => {
    const geocodeLocation = vi.fn().mockResolvedValue({ lat: 29.76, lon: -95.37, confidence: 1, place_id: 'p1' });
    const result = await resolveGeoRadius('Houston, TX', 200, { geocodeLocation });
    expect(geocodeLocation).toHaveBeenCalledOnce();
    expect(result.center.lat).toBeCloseTo(29.76);
    expect(result.center.lon).toBeCloseTo(-95.37);
    expect(result.region).toBe('Houston, TX');
    expect(result.radius_mi).toBe(200);
    expect(result.states).toContain('TX');
    expect(result.bbox.north).toBeGreaterThan(29.76);
  });

  it('falls back to state centroid when geocoder misses', async () => {
    const geocodeLocation = vi.fn().mockResolvedValue(null);
    const result = await resolveGeoRadius('Texas', 100, { geocodeLocation });
    expect(result.states).toContain('TX');
    expect(result.center.label).toMatch(/state centroid/);
  });

  it('throws when neither geocoder nor parser can resolve', async () => {
    const geocodeLocation = vi.fn().mockResolvedValue(null);
    await expect(
      resolveGeoRadius('Nowheresville', 100, { geocodeLocation }),
    ).rejects.toThrow(/could not resolve region/);
  });

  it('always includes the parsed state even when its centroid sits outside the fence', async () => {
    // Center near the WA-OR border but the parsed state says OR — both should appear.
    const geocodeLocation = vi.fn().mockResolvedValue({ lat: 45.52, lon: -122.68, confidence: 1, place_id: 'p1' });
    const result = await resolveGeoRadius('Portland, OR', 25, { geocodeLocation });
    expect(result.states).toContain('OR');
  });

  it('clamps wild radius values', async () => {
    const geocodeLocation = vi.fn().mockResolvedValue({ lat: 29.76, lon: -95.37, confidence: 1, place_id: 'p1' });
    const result = await resolveGeoRadius('Houston, TX', 99_999, { geocodeLocation });
    expect(result.radius_mi).toBe(1000);
  });
});
