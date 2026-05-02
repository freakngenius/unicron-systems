import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listCrossPollinationMatches } from './crossPollinationClient';
import { bucketFor } from './contracts/crossPollination';

describe('crossPollinationClient (mock-mode)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_CROSS_POLL_API_ENABLED', 'false');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('lists fixture rows sorted by confidence desc', async () => {
    const rows = await listCrossPollinationMatches({ customer_org_id: 'zedcor' });
    expect(rows.length).toBeGreaterThan(0);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1].match_confidence).toBeGreaterThanOrEqual(rows[i].match_confidence);
    }
  });

  it('filters by lead_id', async () => {
    const rows = await listCrossPollinationMatches({ lead_id: 'lead-pgh-3401' });
    expect(rows.every((r) => r.lead_id === 'lead-pgh-3401')).toBe(true);
  });

  it('filters by lead_ids batch', async () => {
    const rows = await listCrossPollinationMatches({
      lead_ids: ['lead-pgh-3401', 'lead-hou-2207'],
    });
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) =>
      expect(['lead-pgh-3401', 'lead-hou-2207']).toContain(r.lead_id),
    );
  });

  it('filters by min_confidence threshold', async () => {
    const rows = await listCrossPollinationMatches({ min_confidence: 0.85 });
    rows.forEach((r) => expect(r.match_confidence).toBeGreaterThanOrEqual(0.85));
  });

  it('bucketFor classifies high / ambiguous / low correctly', () => {
    expect(bucketFor(0.95)).toBe('high');
    expect(bucketFor(0.9)).toBe('high');
    expect(bucketFor(0.85)).toBe('ambiguous');
    expect(bucketFor(0.7)).toBe('ambiguous');
    expect(bucketFor(0.65)).toBe('low');
  });
});
