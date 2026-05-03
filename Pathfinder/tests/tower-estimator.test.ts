// tests/tower-estimator.test.ts — Demo Polish UX Gate 11E.
//
// Pure tests for the tower-estimator's prompt builder + JSON parser. The
// full Anthropic round-trip is covered by the demo-prep backfill smoke
// (`pnpm tsx scripts/backfill-estimated-towers.ts`).

import { describe, expect, it } from 'vitest';

import {
  buildTowerEstimatorUserPrompt,
  parseTowerEstimatorResponse,
} from '@/services/tower-estimator/agent';

describe('buildTowerEstimatorUserPrompt', () => {
  it('embeds title, value, NAICS, lot size, location, and description', () => {
    const prompt = buildTowerEstimatorUserPrompt({
      project: {
        id: 'sam.gov:TXDOT-I45-2026-001',
        title: 'TxDOT I-45 Corridor',
        project_value: 4_200_000,
        description_long: '14 highway segments and 6 maintenance yards.',
        summary: null,
        naics_code: '561612',
        naics_description: 'Highway, Street, and Bridge Construction',
        lot_size_acres: null,
        location_text: 'Houston, TX',
        sites_count: null,
        perimeter_feet: null,
      },
    });
    expect(prompt).toContain('TxDOT I-45 Corridor');
    expect(prompt).toContain('$4,200,000');
    expect(prompt).toContain('561612');
    expect(prompt).toContain('Highway, Street, and Bridge Construction');
    expect(prompt).toContain('Houston, TX');
    expect(prompt).toContain('14 highway segments');
  });

  it('falls back to summary when description_long is null', () => {
    const prompt = buildTowerEstimatorUserPrompt({
      project: {
        id: 'p',
        title: 't',
        project_value: null,
        description_long: null,
        summary: 'Short summary instead.',
        naics_code: null,
        naics_description: null,
        lot_size_acres: null,
        location_text: null,
        sites_count: null,
        perimeter_feet: null,
      },
    });
    expect(prompt).toContain('PROJECT SUMMARY:');
    expect(prompt).toContain('Short summary instead.');
  });

  it('embeds caller-provided sites_count and perimeter_feet when supplied', () => {
    const prompt = buildTowerEstimatorUserPrompt({
      project: {
        id: 'p',
        title: 't',
        project_value: null,
        description_long: null,
        summary: null,
        naics_code: null,
        naics_description: null,
        lot_size_acres: null,
        location_text: null,
        sites_count: 20,
        perimeter_feet: 4500,
      },
    });
    expect(prompt).toContain('SITE COUNT (caller-provided): 20');
    expect(prompt).toContain('PERIMETER (caller-provided): 4500 ft');
  });

  it('omits null fields cleanly', () => {
    const prompt = buildTowerEstimatorUserPrompt({
      project: {
        id: 'p',
        title: 't',
        project_value: null,
        description_long: null,
        summary: null,
        naics_code: null,
        naics_description: null,
        lot_size_acres: null,
        location_text: null,
        sites_count: null,
        perimeter_feet: null,
      },
    });
    expect(prompt).not.toContain('PROJECT VALUE:');
    expect(prompt).not.toContain('NAICS:');
    expect(prompt).not.toContain('LOT SIZE:');
    expect(prompt).not.toContain('LOCATION:');
    expect(prompt).not.toContain('SITE COUNT');
    expect(prompt).not.toContain('PROJECT DESCRIPTION');
    expect(prompt).not.toContain('PROJECT SUMMARY');
  });
});

describe('parseTowerEstimatorResponse — happy path', () => {
  it('parses an integer count', () => {
    const out = parseTowerEstimatorResponse(
      JSON.stringify({ count: 32, rationale: '14 segments + 6 yards × 2 = 26-32 towers' }),
    );
    expect(out.count).toBe(32);
    expect(out.rationale).toMatch(/14 segments/);
  });

  it('parses a numeric-string count', () => {
    const out = parseTowerEstimatorResponse(
      JSON.stringify({ count: '12', rationale: 'Open-lot heuristic.' }),
    );
    expect(out.count).toBe(12);
  });

  it('preserves a range string verbatim', () => {
    const out = parseTowerEstimatorResponse(
      JSON.stringify({ count: '25-35', rationale: 'Linear corridor.' }),
    );
    expect(out.count).toBe('25-35');
  });

  it('normalizes a range with whitespace ("25 - 35" → "25-35")', () => {
    const out = parseTowerEstimatorResponse(
      JSON.stringify({ count: '25 - 35', rationale: 'r' }),
    );
    expect(out.count).toBe('25-35');
  });

  it('strips a ```json fence', () => {
    const out = parseTowerEstimatorResponse(
      '```json\n{"count":8,"rationale":"r"}\n```',
    );
    expect(out.count).toBe(8);
    expect(out.rationale).toBe('r');
  });

  it('extracts the first {...} blob when LLM appends trailing prose', () => {
    const out = parseTowerEstimatorResponse(
      '{"count":4,"rationale":"r"}\n\nNote: caveat.',
    );
    expect(out.count).toBe(4);
  });

  it('rounds a fractional integer to nearest whole', () => {
    const out = parseTowerEstimatorResponse(
      JSON.stringify({ count: 7.4, rationale: 'r' }),
    );
    expect(out.count).toBe(7);
  });
});

describe('parseTowerEstimatorResponse — failure paths', () => {
  it('throws on non-JSON content', () => {
    expect(() => parseTowerEstimatorResponse('not json')).toThrow();
  });

  it('throws on empty rationale', () => {
    expect(() =>
      parseTowerEstimatorResponse(JSON.stringify({ count: 4, rationale: '' })),
    ).toThrow(/empty rationale/);
  });

  it('throws on missing count', () => {
    expect(() =>
      parseTowerEstimatorResponse(JSON.stringify({ rationale: 'r' })),
    ).toThrow();
  });

  it('throws on negative count', () => {
    expect(() =>
      parseTowerEstimatorResponse(JSON.stringify({ count: -3, rationale: 'r' })),
    ).toThrow();
  });

  it('throws on malformed count string', () => {
    expect(() =>
      parseTowerEstimatorResponse(
        JSON.stringify({ count: 'lots of towers', rationale: 'r' }),
      ),
    ).toThrow(/malformed count/);
  });
});
