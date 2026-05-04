// Unit tests for `lib/demo-branches.ts`.
//
// Covers the canonical four-city set (Gate 1C) and the Gate 17A
// `NEXT_PUBLIC_DEMO_HOUSTON_ONLY` narrowing — when the flag is set the
// dashboard surface narrows to Houston only; when unset / 0 the
// behavior is byte-identical to pre-17A.

import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  DEMO_BRANCH_IDS,
  HOUSTON_ONLY_DEMO_BRANCH_IDS,
  isDemoBranchId,
  isHoustonOnlyMode,
  getActiveDemoBranchIds,
  pickDemoBranches,
} from '@/lib/demo-branches';

interface BranchLike {
  id: string;
  name?: string;
}

const FOUR_CITIES: BranchLike[] = [
  { id: 'lax-008', name: 'Los Angeles' },
  { id: 'pit-007', name: 'Pittsburgh' },
  { id: 'hou-002', name: 'Houston' },
  { id: 'nsh-006', name: 'Nashville' },
  // Off-list rows that happen to ride along on the same fetch — must be
  // dropped by `pickDemoBranches` regardless of mode.
  { id: 'phx-001', name: 'Phoenix' },
  { id: 'atl-005', name: 'Atlanta' },
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('DEMO_BRANCH_IDS / HOUSTON_ONLY_DEMO_BRANCH_IDS', () => {
  it('canonical set is exactly the four demo cities in narrative order', () => {
    expect([...DEMO_BRANCH_IDS]).toEqual(['hou-002', 'lax-008', 'nsh-006', 'pit-007']);
  });

  it('Houston-only subset is just hou-002', () => {
    expect([...HOUSTON_ONLY_DEMO_BRANCH_IDS]).toEqual(['hou-002']);
  });
});

describe('isDemoBranchId', () => {
  it('returns true for each canonical demo id', () => {
    for (const id of DEMO_BRANCH_IDS) {
      expect(isDemoBranchId(id)).toBe(true);
    }
  });

  it('returns false for off-list branches and nullish input', () => {
    expect(isDemoBranchId('phx-001')).toBe(false);
    expect(isDemoBranchId('atl-005')).toBe(false);
    expect(isDemoBranchId(null)).toBe(false);
    expect(isDemoBranchId(undefined)).toBe(false);
    expect(isDemoBranchId('')).toBe(false);
  });

  it('does NOT narrow under Houston-only mode (canonical set is the backend contract)', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_HOUSTON_ONLY', '1');
    // LAX, NSH, PIT rows still exist in pathfinder.zedcor_branches and the
    // ingestor / cross-poll code keys off them. `isDemoBranchId` is the
    // backend predicate and stays at the four-city set even with the UI
    // flag on.
    expect(isDemoBranchId('lax-008')).toBe(true);
    expect(isDemoBranchId('nsh-006')).toBe(true);
    expect(isDemoBranchId('pit-007')).toBe(true);
  });
});

describe('isHoustonOnlyMode', () => {
  it('is false when the env flag is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_HOUSTON_ONLY', '');
    expect(isHoustonOnlyMode()).toBe(false);
  });

  it('is false when the env flag is "0"', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_HOUSTON_ONLY', '0');
    expect(isHoustonOnlyMode()).toBe(false);
  });

  it('is true when the env flag is exactly "1"', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_HOUSTON_ONLY', '1');
    expect(isHoustonOnlyMode()).toBe(true);
  });

  it('is false for other truthy-ish strings (strict "1" check)', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_HOUSTON_ONLY', 'true');
    expect(isHoustonOnlyMode()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_DEMO_HOUSTON_ONLY', 'yes');
    expect(isHoustonOnlyMode()).toBe(false);
  });
});

describe('getActiveDemoBranchIds', () => {
  it('returns the canonical four-city set when the flag is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_HOUSTON_ONLY', '');
    expect([...getActiveDemoBranchIds()]).toEqual(['hou-002', 'lax-008', 'nsh-006', 'pit-007']);
  });

  it('returns the canonical four-city set when the flag is "0"', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_HOUSTON_ONLY', '0');
    expect([...getActiveDemoBranchIds()]).toEqual(['hou-002', 'lax-008', 'nsh-006', 'pit-007']);
  });

  it('returns Houston only when the flag is "1"', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_HOUSTON_ONLY', '1');
    expect([...getActiveDemoBranchIds()]).toEqual(['hou-002']);
  });
});

describe('pickDemoBranches', () => {
  it('returns the four cities in narrative order regardless of input order (default mode)', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_HOUSTON_ONLY', '');
    const out = pickDemoBranches(FOUR_CITIES);
    expect(out.map((b) => b.id)).toEqual(['hou-002', 'lax-008', 'nsh-006', 'pit-007']);
  });

  it('drops off-list branches (Phoenix / Atlanta still in pathfinder.branches)', () => {
    const out = pickDemoBranches(FOUR_CITIES);
    expect(out.map((b) => b.id)).not.toContain('phx-001');
    expect(out.map((b) => b.id)).not.toContain('atl-005');
  });

  it('returns Houston only when Gate 17A flag is set', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_HOUSTON_ONLY', '1');
    const out = pickDemoBranches(FOUR_CITIES);
    expect(out.map((b) => b.id)).toEqual(['hou-002']);
  });

  it('returns an empty array when Houston is not present in the input under Gate 17A mode', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_HOUSTON_ONLY', '1');
    const noHouston = FOUR_CITIES.filter((b) => b.id !== 'hou-002');
    expect(pickDemoBranches(noHouston)).toEqual([]);
  });

  it('preserves the input row reference (no mutation, no copy)', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_HOUSTON_ONLY', '1');
    const out = pickDemoBranches(FOUR_CITIES);
    const houstonInput = FOUR_CITIES.find((b) => b.id === 'hou-002');
    expect(out[0]).toBe(houstonInput);
  });

  it('handles an empty input gracefully', () => {
    expect(pickDemoBranches([])).toEqual([]);
    vi.stubEnv('NEXT_PUBLIC_DEMO_HOUSTON_ONLY', '1');
    expect(pickDemoBranches([])).toEqual([]);
  });
});
