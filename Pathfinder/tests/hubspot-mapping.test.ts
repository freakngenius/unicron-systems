import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HUBSPOT_MAPPING,
  parseMapping,
  validateMappingInput,
} from '@/lib/connectors/hubspot/mapping';

describe('parseMapping', () => {
  it('returns the default for null / non-object input', () => {
    expect(parseMapping(null).deal_fields).toEqual(DEFAULT_HUBSPOT_MAPPING.deal_fields);
    expect(parseMapping('garbage').stage_map).toEqual(DEFAULT_HUBSPOT_MAPPING.stage_map);
  });

  it('round-trips a valid mapping', () => {
    const mapping = {
      deal_fields: [{ pathfinder_field: 'title', hubspot_property: 'dealname', conflict_policy: 'last_write_wins' }],
      contact_fields: [],
      stage_map: [{ pathfinder_stage: 'accepted', hubspot_stage_id: 'stg_xxx', conflict_policy: 'pathfinder_locked' }],
      updated_at: '2026-05-02T17:30:00.000Z',
    };
    const out = parseMapping(mapping);
    expect(out.deal_fields[0]?.hubspot_property).toBe('dealname');
    expect(out.stage_map[0]?.hubspot_stage_id).toBe('stg_xxx');
    expect(out.stage_map[0]?.conflict_policy).toBe('pathfinder_locked');
  });

  it('drops malformed entries instead of throwing', () => {
    const mapping = {
      deal_fields: [
        { pathfinder_field: 'title', hubspot_property: 'dealname', conflict_policy: 'last_write_wins' },
        { pathfinder_field: '', hubspot_property: 'broken', conflict_policy: 'last_write_wins' },
        { hubspot_property: 'no_pf_field' },
      ],
      contact_fields: [],
      stage_map: [],
    };
    const out = parseMapping(mapping);
    expect(out.deal_fields).toHaveLength(1);
    expect(out.deal_fields[0]?.hubspot_property).toBe('dealname');
  });

  it('falls back to default conflict_policy on unknown values', () => {
    const mapping = {
      deal_fields: [{ pathfinder_field: 'title', hubspot_property: 'dealname', conflict_policy: 'bogus' }],
      contact_fields: [],
      stage_map: [],
    };
    expect(parseMapping(mapping).deal_fields[0]?.conflict_policy).toBe('last_write_wins');
  });

  it('rejects unknown pathfinder stages', () => {
    const mapping = {
      deal_fields: [],
      contact_fields: [],
      stage_map: [{ pathfinder_stage: 'imaginary', hubspot_stage_id: 'x', conflict_policy: 'last_write_wins' }],
    };
    // bogus stage row dropped → fallback to DEFAULT_STAGE_MAP
    expect(parseMapping(mapping).stage_map).toEqual(DEFAULT_HUBSPOT_MAPPING.stage_map);
  });
});

describe('validateMappingInput', () => {
  it('reports missing arrays', () => {
    const errors = validateMappingInput({});
    expect(errors).toContain('deal_fields must be an array');
    expect(errors).toContain('contact_fields must be an array');
    expect(errors).toContain('stage_map must be an array');
  });

  it('reports per-row malformations', () => {
    const errors = validateMappingInput({
      deal_fields: [{ hubspot_property: 'x' }],
      contact_fields: [],
      stage_map: [{ pathfinder_stage: 'imaginary', hubspot_stage_id: 'x' }],
    });
    expect(errors.some((e) => e.includes('deal_fields[0]'))).toBe(true);
    expect(errors.some((e) => e.includes('stage_map[0]'))).toBe(true);
  });

  it('returns empty array for a valid submission', () => {
    const errors = validateMappingInput({
      deal_fields: [{ pathfinder_field: 'x', hubspot_property: 'y', conflict_policy: 'last_write_wins' }],
      contact_fields: [],
      stage_map: [{ pathfinder_stage: 'accepted', hubspot_stage_id: 'stg_x', conflict_policy: 'last_write_wins' }],
    });
    expect(errors).toEqual([]);
  });

  it('returns errors on a fully invalid input', () => {
    expect(validateMappingInput(null)).toContain('mapping body is not an object');
  });
});
