// Unit tests for the unified dashboard filter pipeline
// (Pathfinder/lib/dashboard-filters.ts). Demo Polish UX § Gate 1E.

import { describe, it, expect } from 'vitest';
import {
  applyNonBranchFilters,
  applyBranchFilter,
  groupCountsByBranch,
} from '@/lib/dashboard-filters';
import type { Project } from '@/lib/types';

function p(over: Partial<Project> & { id: string }): Project {
  return {
    id: over.id,
    source: over.source ?? 'usaspending',
    source_id: over.source_id ?? `src-${over.id}`,
    title: over.title ?? `Project ${over.id}`,
    summary: null,
    lat: null,
    lon: null,
    project_value: null,
    project_stage: null,
    posted_date: null,
    raw_payload: null,
    rationale: null,
    rationale_streamed_at: null,
    score: over.score ?? 0,
    nearest_branch_id: over.nearest_branch_id ?? null,
    distance_miles: over.distance_miles ?? null,
    outreach_hook: null,
    warm_for_customer_id: over.warm_for_customer_id ?? null,
    ingested_at: '2026-05-01T00:00:00Z',
    ranked_at: null,
  } as Project;
}

const empty = new Set<string>();

describe('applyNonBranchFilters', () => {
  it('passes everything through with default filters', () => {
    const projects = [p({ id: 'a' }), p({ id: 'b' })];
    const out = applyNonBranchFilters({
      projects,
      source: 'all',
      crossPoll: false,
      hidden: empty,
      state: { range: 'all', minScore: 0 },
      maxDistance: 250,
    });
    expect(out).toHaveLength(2);
  });

  it('drops hidden ids', () => {
    const projects = [p({ id: 'a' }), p({ id: 'b' })];
    const out = applyNonBranchFilters({
      projects,
      source: 'all',
      crossPoll: false,
      hidden: new Set(['a']),
      state: { range: 'all', minScore: 0 },
      maxDistance: 250,
    });
    expect(out.map((x) => x.id)).toEqual(['b']);
  });

  it('crossPoll keeps only warm-for matches', () => {
    const projects = [
      p({ id: 'a', warm_for_customer_id: 'cust-1' }),
      p({ id: 'b' }),
    ];
    const out = applyNonBranchFilters({
      projects,
      source: 'all',
      crossPoll: true,
      hidden: empty,
      state: { range: 'all', minScore: 0 },
      maxDistance: 250,
    });
    expect(out.map((x) => x.id)).toEqual(['a']);
  });

  it('range=within drops projects beyond maxDistance + projects with unknown distance', () => {
    const projects = [
      p({ id: 'near', distance_miles: 50 }),
      p({ id: 'far', distance_miles: 400 }),
      p({ id: 'unknown', distance_miles: null }),
    ];
    const out = applyNonBranchFilters({
      projects,
      source: 'all',
      crossPoll: false,
      hidden: empty,
      state: { range: 'within', minScore: 0 },
      maxDistance: 250,
    });
    expect(out.map((x) => x.id)).toEqual(['near']);
  });

  it('minScore filters out below-floor projects', () => {
    const projects = [
      p({ id: 'lo', score: 30 }),
      p({ id: 'mid', score: 50 }),
      p({ id: 'hi', score: 90 }),
    ];
    const out = applyNonBranchFilters({
      projects,
      source: 'all',
      crossPoll: false,
      hidden: empty,
      state: { range: 'all', minScore: 50 },
      maxDistance: 250,
    });
    expect(out.map((x) => x.id)).toEqual(['mid', 'hi']);
  });

  it('source filter narrows to a single source', () => {
    const projects = [
      p({ id: 'a', source: 'usaspending' }),
      p({ id: 'b', source: 'sam.gov' }),
    ];
    const out = applyNonBranchFilters({
      projects,
      source: 'sam',
      crossPoll: false,
      hidden: empty,
      state: { range: 'all', minScore: 0 },
      maxDistance: 250,
    });
    expect(out.map((x) => x.id)).toEqual(['b']);
  });
});

describe('applyBranchFilter', () => {
  it('returns the input unchanged when no branch is selected', () => {
    const projects = [p({ id: 'a', nearest_branch_id: 'hou-002' })];
    expect(applyBranchFilter(projects, null)).toBe(projects);
  });

  it('narrows to projects whose nearest_branch_id matches', () => {
    const projects = [
      p({ id: 'a', nearest_branch_id: 'hou-002' }),
      p({ id: 'b', nearest_branch_id: 'nas-007' }),
      p({ id: 'c', nearest_branch_id: null }),
    ];
    const out = applyBranchFilter(projects, 'nas-007');
    expect(out.map((x) => x.id)).toEqual(['b']);
  });
});

describe('groupCountsByBranch', () => {
  it('seeds zero-counts for every branch id and counts hi-priority by threshold', () => {
    const projects = [
      p({ id: 'a', nearest_branch_id: 'hou-002', score: 92 }),
      p({ id: 'b', nearest_branch_id: 'hou-002', score: 60 }),
      p({ id: 'c', nearest_branch_id: 'nas-007', score: 85 }),
    ];
    const out = groupCountsByBranch(projects, ['hou-002', 'nas-007', 'lax-006'], 80);
    expect(out).toEqual({
      'hou-002': { count: 2, hi: 1 },
      'nas-007': { count: 1, hi: 1 },
      'lax-006': { count: 0, hi: 0 },
    });
  });

  it('drops projects whose nearest_branch_id is not in the seeded list', () => {
    const projects = [
      p({ id: 'a', nearest_branch_id: 'hou-002', score: 90 }),
      p({ id: 'b', nearest_branch_id: 'phx-001', score: 90 }),
    ];
    const out = groupCountsByBranch(projects, ['hou-002'], 80);
    expect(out).toEqual({ 'hou-002': { count: 1, hi: 1 } });
  });
});
