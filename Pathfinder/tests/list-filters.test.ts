// Unit tests for the lead-list URL filter helpers
// (Pathfinder/lib/list-filters.ts).
//
// SPEC reference: SPEC - Demo Polish & Geography Filters.md § 3.3.

import { describe, it, expect } from 'vitest';
import {
  parseListFilterState,
  serializeListFilterState,
  DEFAULT_LIST_FILTER_STATE,
  type ListFilterState,
} from '@/lib/list-filters';

function qs(input: string) {
  // URLSearchParams already implements `get(key): string | null`, which
  // matches both the QueryLike signature and the shape that Next's
  // ReadonlyURLSearchParams exposes.
  return new URLSearchParams(input);
}

describe('parseListFilterState', () => {
  it('returns the default state when query is empty', () => {
    expect(parseListFilterState(qs(''))).toEqual(DEFAULT_LIST_FILTER_STATE);
  });

  it('returns the default state when query is null/undefined', () => {
    expect(parseListFilterState(null)).toEqual(DEFAULT_LIST_FILTER_STATE);
    expect(parseListFilterState(undefined)).toEqual(DEFAULT_LIST_FILTER_STATE);
  });

  it('parses the canonical spec example', () => {
    const parsed = parseListFilterState(
      qs('sort=score&dir=desc&range=within&min_score=80'),
    );
    expect(parsed).toEqual({
      sort: 'score',
      dir: 'desc',
      range: 'within',
      minScore: 80,
      filter: 'all',
    });
  });

  it('parses every valid sort + range combo', () => {
    const parsed = parseListFilterState(
      qs('sort=distance&dir=asc&range=outside&min_score=30&filter=starred'),
    );
    expect(parsed).toEqual({
      sort: 'distance',
      dir: 'asc',
      range: 'outside',
      minScore: 30,
      filter: 'starred',
    });
  });

  it('falls back to defaults for unknown sort/range/dir/filter values', () => {
    const parsed = parseListFilterState(
      qs('sort=lol&dir=sideways&range=mars&filter=on-fire&min_score=abc'),
    );
    expect(parsed).toEqual(DEFAULT_LIST_FILTER_STATE);
  });

  it('snaps min_score to the nearest valid step and clamps to 0..90', () => {
    expect(parseListFilterState(qs('min_score=27')).minScore).toBe(30);
    expect(parseListFilterState(qs('min_score=24')).minScore).toBe(20);
    expect(parseListFilterState(qs('min_score=-50')).minScore).toBe(0);
    expect(parseListFilterState(qs('min_score=999')).minScore).toBe(90);
    expect(parseListFilterState(qs('min_score=85')).minScore).toBe(90); // 85 rounds to 90
  });
});

describe('serializeListFilterState', () => {
  it('emits an empty string when state matches defaults', () => {
    expect(serializeListFilterState(DEFAULT_LIST_FILTER_STATE)).toBe('');
  });

  it('round-trips the canonical spec example', () => {
    const state: ListFilterState = {
      sort: 'score',
      dir: 'desc',
      range: 'within',
      minScore: 80,
      filter: 'all',
    };
    // sort=score, dir=desc are defaults so the serialized form drops them.
    const serialized = serializeListFilterState(state);
    expect(serialized).toBe('range=within&min_score=80');
    expect(parseListFilterState(qs(serialized))).toEqual(state);
  });

  it('round-trips a fully non-default state', () => {
    const state: ListFilterState = {
      sort: 'distance',
      dir: 'asc',
      range: 'outside',
      minScore: 50,
      filter: 'starred',
    };
    const serialized = serializeListFilterState(state);
    expect(parseListFilterState(qs(serialized))).toEqual(state);
  });

  it('omits min_score=0 from the serialized form', () => {
    const state: ListFilterState = {
      ...DEFAULT_LIST_FILTER_STATE,
      range: 'within',
      minScore: 0,
    };
    expect(serializeListFilterState(state)).toBe('range=within');
  });
});
