// __tests__/source-onboarder/infer-schema.test.ts
import { describe, expect, it } from 'vitest';
import { inferSchema } from '@/services/source-onboarder/tools/infer-schema';

describe('inferSchema', () => {
  it('produces field map with type union and presenceRatio', () => {
    const samples = [
      { id: '1', value: 100, optional: 'y' },
      { id: '2', value: 50 },
      { id: '3', value: '75' },
    ];
    const s = inferSchema(samples);
    expect(s.type).toBe('array');
    expect(s.sampleSize).toBe(3);
    expect(s.fields.id.types).toContain('string');
    expect(s.fields.value.types).toEqual(expect.arrayContaining(['number', 'string']));
    expect(s.fields.optional.presenceRatio).toBeCloseTo(1 / 3, 2);
    expect(s.fields.id.presenceRatio).toBe(1);
  });

  it('returns empty schema when sample list empty', () => {
    const s = inferSchema([]);
    expect(s.type).toBe('unknown');
    expect(Object.keys(s.fields)).toHaveLength(0);
  });
});
