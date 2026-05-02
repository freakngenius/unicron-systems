// tests/country-detect.test.ts — Demo Polish P1 country-detection unit tests.
//
// Covers the structured-payload paths used by the ingestor's Layer A
// filter (sam.gov, USAspending, Harris seed, news hint), plus the news
// body keyword scan.

import { describe, expect, it } from 'vitest';
import {
  detectCountryFromPayload,
  detectCountryFromNewsBody,
  normalizeCountry,
} from '@/lib/zedcor/country-detect';
import { parseHaikuJson } from '@/lib/geography/coord-extractor';

describe('normalizeCountry', () => {
  it('maps common English aliases to ISO-3', () => {
    expect(normalizeCountry('United States')).toBe('USA');
    expect(normalizeCountry('united states of america')).toBe('USA');
    expect(normalizeCountry('US')).toBe('USA');
    expect(normalizeCountry('canada')).toBe('CAN');
  });

  it('passes ISO-3 codes through uppercased', () => {
    expect(normalizeCountry('rou')).toBe('ROU');
    expect(normalizeCountry('GBR')).toBe('GBR');
  });

  it('returns null for empty input', () => {
    expect(normalizeCountry(null)).toBeNull();
    expect(normalizeCountry('')).toBeNull();
    expect(normalizeCountry('   ')).toBeNull();
  });
});

describe('detectCountryFromPayload — sam.gov v2', () => {
  it('reads placeOfPerformance.country.code', () => {
    const payload = {
      placeOfPerformance: {
        city: { name: 'Mihail Kogălniceanu' },
        country: { code: 'ROU', name: 'ROMANIA' },
      },
    };
    expect(detectCountryFromPayload(payload)).toBe('ROU');
  });

  it('reads placeOfPerformance.country.name when code missing', () => {
    const payload = { placeOfPerformance: { country: { name: 'United States' } } };
    expect(detectCountryFromPayload(payload)).toBe('USA');
  });

  it('treats placeOfPerformance.state.code as USA', () => {
    const payload = { placeOfPerformance: { state: { code: 'TN', name: 'Tennessee' } } };
    expect(detectCountryFromPayload(payload)).toBe('USA');
  });
});

describe('detectCountryFromPayload — USAspending', () => {
  it('reads recipient.location.country_code', () => {
    const payload = {
      recipient: { location: { country_code: 'USA' } },
    };
    expect(detectCountryFromPayload(payload)).toBe('USA');
  });

  it('uses state-code-only payload as USA', () => {
    const payload = { 'Place of Performance State Code': 'CA' };
    expect(detectCountryFromPayload(payload)).toBe('USA');
  });
});

describe('detectCountryFromPayload — Harris seed', () => {
  it('treats US-state-suffixed addresses as USA', () => {
    expect(detectCountryFromPayload({ address: '6000 N Terminal Pkwy, Atlanta GA' })).toBe('USA');
    expect(detectCountryFromPayload({ address: '11600 W Irving Park Rd, Chicago IL' })).toBe('USA');
  });
});

describe('detectCountryFromPayload — news hint', () => {
  it('reads the country_hint shape', () => {
    expect(detectCountryFromPayload({ country_hint: 'United States' })).toBe('USA');
    expect(detectCountryFromPayload({ country_hint: 'rou' })).toBe('ROU');
  });

  it('returns null for empty payloads', () => {
    expect(detectCountryFromPayload(null)).toBeNull();
    expect(detectCountryFromPayload(undefined)).toBeNull();
    expect(detectCountryFromPayload({})).toBeNull();
  });
});

describe('detectCountryFromNewsBody', () => {
  it('flags clear US dominance as USA', () => {
    const text = 'A new Texas highway project was approved by the United States DoD.';
    expect(detectCountryFromNewsBody(text)).toMatchObject({ country: 'USA' });
  });

  it('flags Romania-dominated text as ROU', () => {
    const text =
      'Romania awarded a new contract for the Mihail Kogălniceanu air base in Romania to NATO partners. The Romania facility expansion will continue.';
    const result = detectCountryFromNewsBody(text);
    expect(result?.country).toBe('ROU');
    expect(result?.confidence ?? 0).toBeGreaterThan(0.6);
  });

  it('returns null for body with no country signal', () => {
    expect(detectCountryFromNewsBody('Generic project description with no clear geography.')).toBeNull();
  });
});

describe('parseHaikuJson', () => {
  it('parses a clean inline JSON reply', () => {
    const r = parseHaikuJson('{"city":"nashville","state":"TN","country":"USA","confidence":0.92}');
    expect(r).toEqual({ city: 'nashville', state: 'TN', country: 'USA', confidence: 0.92 });
  });

  it('strips a markdown code fence', () => {
    const r = parseHaikuJson('```json\n{"city":"calgary","state":"AB","country":"CAN","confidence":0.8}\n```');
    expect(r).toMatchObject({ city: 'calgary', state: 'AB', country: 'CAN' });
  });

  it('returns the zero result on bad JSON', () => {
    const r = parseHaikuJson('not json at all');
    expect(r).toEqual({ city: null, state: null, country: null, confidence: 0 });
  });

  it('clamps confidence to [0,1]', () => {
    const r = parseHaikuJson('{"country":"USA","confidence":1.5}');
    expect(r.confidence).toBe(1);
    const r2 = parseHaikuJson('{"country":"USA","confidence":-0.3}');
    expect(r2.confidence).toBe(0);
  });
});
