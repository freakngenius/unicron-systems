// __tests__/agents/internal-geo.test.ts
//
// Stage 5 — Internal geo-mapper.
//
// Pure function: no LLM, no I/O. Asserts the payload-first state mapping
// and the free-text scanner.

import { describe, it, expect } from 'vitest';
import { mapInternalGeo, normalizeStateCode } from '@/lib/agents/internal/geo';

describe('mapInternalGeo', () => {
  it('uses payload.hq_state when present', () => {
    const r = mapInternalGeo({ raw_payload: { hq_state: 'TX' } });
    expect(r.hq_state).toBe('TX');
    expect(r.operating_states).toContain('TX');
  });

  it('falls back to payload.state when hq_state is absent', () => {
    const r = mapInternalGeo({ raw_payload: { state: 'CA' } });
    expect(r.hq_state).toBe('CA');
  });

  it('expands operating_states array on the payload', () => {
    const r = mapInternalGeo({
      raw_payload: { hq_state: 'TX', operating_states: ['OK', 'LA', 'NM'] },
    });
    expect(r.hq_state).toBe('TX');
    expect(r.operating_states.sort()).toEqual(['LA', 'NM', 'OK', 'TX']);
  });

  it('extracts state codes from title + summary text', () => {
    const r = mapInternalGeo({
      title: 'Acme Construction TX',
      summary: 'Operates in OK and AR',
    });
    expect(r.operating_states.sort()).toEqual(['AR', 'OK', 'TX']);
  });

  it('extracts long state names from text', () => {
    const r = mapInternalGeo({
      title: 'Acme Construction',
      summary: 'Headquartered in Texas with operations in Oklahoma and New Mexico',
    });
    expect(r.operating_states.sort()).toEqual(['NM', 'OK', 'TX']);
  });

  it('returns null hq_state when no signal is present', () => {
    const r = mapInternalGeo({ title: 'Acme Whatever', summary: 'Generic copy' });
    expect(r.hq_state).toBeNull();
    expect(r.operating_states).toEqual([]);
  });

  it('normalizeStateCode handles names and codes', () => {
    expect(normalizeStateCode('TX')).toBe('TX');
    expect(normalizeStateCode('texas')).toBe('TX');
    expect(normalizeStateCode('Texas')).toBe('TX');
    expect(normalizeStateCode('XX')).toBeNull();
    expect(normalizeStateCode(null)).toBeNull();
  });
});
