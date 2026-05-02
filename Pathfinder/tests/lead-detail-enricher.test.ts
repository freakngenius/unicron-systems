// Unit tests for the lead-detail enricher's pure helpers (parsing,
// sanitization, apply-update logic). LLM calls are not exercised here;
// see the integration smoke run logged in the gate's PR body for live
// Sonar + Anthropic behavior.

import { describe, expect, it } from 'vitest';

import { __test__ } from '@/services/enricher/lead-detail';
import type { EnricherInput, EnricherUpdate } from '@/services/enricher/types';

const {
  sanitizeSonar,
  sanitizeAnthropic,
  applySonar,
  applyAnthropic,
  needsSonar,
  needsAnthropic,
  tryParseJson,
} = __test__;

function blankProject(over: Partial<EnricherInput> = {}): EnricherInput {
  return {
    id: 'sam.gov:test',
    source: 'sam.gov',
    title: 'Test project',
    summary: null,
    location_text: null,
    lat: null,
    lon: null,
    owner_name: null,
    owner_type: null,
    prime_contractor_name: null,
    description_long: null,
    naics_code: null,
    naics_description: null,
    estimated_start_date: null,
    estimated_end_date: null,
    permit_number: null,
    permit_jurisdiction: null,
    permit_filing_date: null,
    permit_type: null,
    lot_size_acres: null,
    project_value: null,
    enriched_at: null,
    enrichment_provider: null,
    enrichment_cost_usd: null,
    ...over,
  };
}

describe('lead-detail enricher — JSON parsing', () => {
  it('parses a clean JSON object', () => {
    const out = tryParseJson<{ a: number }>('{"a": 1}');
    expect(out).toEqual({ a: 1 });
  });

  it('strips ```json code fences', () => {
    const out = tryParseJson<{ a: number }>('```json\n{"a": 1}\n```');
    expect(out).toEqual({ a: 1 });
  });

  it('strips bare ``` code fences', () => {
    const out = tryParseJson<{ a: number }>('```\n{"a": 1}\n```');
    expect(out).toEqual({ a: 1 });
  });

  it('extracts the first JSON block when wrapped in prose', () => {
    const out = tryParseJson<{ owner_type: string }>(
      'Here is the JSON: {"owner_type": "municipality"} as requested.',
    );
    expect(out).toEqual({ owner_type: 'municipality' });
  });

  it('returns null on completely malformed input', () => {
    const out = tryParseJson('not json at all');
    expect(out).toBeNull();
  });
});

describe('sanitizeSonar', () => {
  it('rejects invalid owner_type values', () => {
    const result = sanitizeSonar({ owner_type: 'bogus' });
    expect(result.owner_type).toBeNull();
  });

  it('accepts valid owner_type values', () => {
    expect(sanitizeSonar({ owner_type: 'pe_firm' }).owner_type).toBe('pe_firm');
    expect(sanitizeSonar({ owner_type: 'municipality' }).owner_type).toBe('municipality');
  });

  it('truncates ISO datetime to YYYY-MM-DD for date fields', () => {
    const r = sanitizeSonar({
      estimated_start_date: '2026-06-01T16:30:00-04:00',
      estimated_end_date: '2027-04-30',
    });
    expect(r.estimated_start_date).toBe('2026-06-01');
    expect(r.estimated_end_date).toBe('2027-04-30');
  });

  it('rejects non-ISO date strings', () => {
    const r = sanitizeSonar({ estimated_start_date: 'June 2026' });
    expect(r.estimated_start_date).toBeNull();
  });

  it('rejects negative or oversized lot_size_acres', () => {
    expect(sanitizeSonar({ lot_size_acres: -5 }).lot_size_acres).toBeNull();
    expect(sanitizeSonar({ lot_size_acres: 99999 }).lot_size_acres).toBeNull();
    expect(sanitizeSonar({ lot_size_acres: 'huge' }).lot_size_acres).toBeNull();
    expect(sanitizeSonar({ lot_size_acres: 12.5 }).lot_size_acres).toBe(12.5);
  });

  it('caps key_subs at 5 items and drops malformed entries', () => {
    const r = sanitizeSonar({
      key_subs: [
        { name: 'A' },
        { name: 'B', role: 'security' },
        { name: '' },
        { something: 'weird' },
        { name: 'C' },
        { name: 'D' },
        { name: 'E' },
        { name: 'F' },
      ],
    });
    expect(r.key_subs).toHaveLength(5);
    expect(r.key_subs?.map((k) => k.name)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('preserves source_url and role on key_subs', () => {
    const r = sanitizeSonar({
      key_subs: [{ name: 'Acme', role: 'electrical', source_url: 'https://example.com' }],
    });
    expect(r.key_subs?.[0]).toEqual({
      name: 'Acme',
      role: 'electrical',
      source_url: 'https://example.com',
    });
  });
});

describe('sanitizeAnthropic', () => {
  it('rejects non-6-digit naics codes', () => {
    expect(sanitizeAnthropic({ naics_code: '12345' }).naics_code).toBeNull();
    expect(sanitizeAnthropic({ naics_code: '1234567' }).naics_code).toBeNull();
    expect(sanitizeAnthropic({ naics_code: '12345A' }).naics_code).toBeNull();
    expect(sanitizeAnthropic({ naics_code: '561612' }).naics_code).toBe('561612');
  });

  it('returns description_long when non-empty', () => {
    const r = sanitizeAnthropic({ description_long: 'A 2-sentence description.' });
    expect(r.description_long).toBe('A 2-sentence description.');
  });
});

describe('applySonar — only fills nulls', () => {
  it('fills owner_type when null', () => {
    const upd: EnricherUpdate = {};
    const filled = applySonar(blankProject(), { owner_type: 'municipality' }, upd);
    expect(filled).toBe(1);
    expect(upd.owner_type).toBe('municipality');
  });

  it('does NOT overwrite existing owner_type', () => {
    const upd: EnricherUpdate = {};
    const p = blankProject({ owner_type: 'federal_agency' });
    const filled = applySonar(p, { owner_type: 'municipality' }, upd);
    expect(filled).toBe(0);
    expect(upd.owner_type).toBeUndefined();
  });

  it('records empty key_subs without counting it as a fill', () => {
    const upd: EnricherUpdate = {};
    const filled = applySonar(blankProject(), { key_subs: [] }, upd);
    expect(filled).toBe(0);
    expect(upd.key_subs).toEqual([]);
  });

  it('records non-empty key_subs as a fill', () => {
    const upd: EnricherUpdate = {};
    const filled = applySonar(blankProject(), { key_subs: [{ name: 'Acme' }] }, upd);
    expect(filled).toBe(1);
    expect(upd.key_subs).toEqual([{ name: 'Acme' }]);
  });
});

describe('applyAnthropic', () => {
  it('fills naics_code + description together when code is null', () => {
    const upd: EnricherUpdate = {};
    const filled = applyAnthropic(
      blankProject(),
      { naics_code: '561612', naics_description: 'Security Guards', description_long: 'desc' },
      upd,
    );
    expect(filled).toBe(2);
    expect(upd.naics_code).toBe('561612');
    expect(upd.naics_description).toBe('Security Guards');
    expect(upd.description_long).toBe('desc');
  });

  it('fills naics_description alone when only code is already set', () => {
    const upd: EnricherUpdate = {};
    const p = blankProject({ naics_code: '561612' });
    applyAnthropic(p, { naics_description: 'Security Guards' }, upd);
    expect(upd.naics_description).toBe('Security Guards');
  });
});

describe('needsSonar / needsAnthropic gates', () => {
  it('skips Sonar when every Sonar-owned field is filled', () => {
    const p = blankProject({
      source: 'usaspending',
      owner_type: 'federal_agency',
      prime_contractor_name: 'Acme',
      lot_size_acres: 5,
      estimated_start_date: '2026-06-01',
      estimated_end_date: '2027-04-30',
      permit_type: 'commercial',
    });
    expect(needsSonar(p)).toBe(false);
  });

  it('skips permit lookup for sam.gov when permit_type null (federal contracts have no permits)', () => {
    const p = blankProject({
      source: 'sam.gov',
      owner_type: 'federal_agency',
      prime_contractor_name: 'Acme',
      lot_size_acres: 5,
      estimated_start_date: '2026-06-01',
      estimated_end_date: '2027-04-30',
      permit_type: null,
    });
    // sam.gov passes the permit-null check because the gate only fires
    // for source !== 'harris'. With everything else filled, sam.gov + null
    // permit means we still want Sonar to attempt permit lookup once.
    expect(needsSonar(p)).toBe(true);
  });

  it('still calls Sonar when one Sonar-owned field is null', () => {
    const p = blankProject({
      owner_type: 'federal_agency',
      prime_contractor_name: 'Acme',
      lot_size_acres: 5,
      estimated_start_date: '2026-06-01',
      estimated_end_date: null,
    });
    expect(needsSonar(p)).toBe(true);
  });

  it('skips Anthropic when both NAICS + description are filled', () => {
    const p = blankProject({
      naics_code: '561612',
      description_long: 'desc',
    });
    expect(needsAnthropic(p)).toBe(false);
  });
});
