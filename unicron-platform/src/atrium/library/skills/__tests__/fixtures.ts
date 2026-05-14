// Test fixtures for Sprint 9 Stream C component + hook tests.

import type { Skill, SkillSearchResult } from '../types';

export function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill-1',
    name: 'run_zedcor_weekly_digest',
    description: 'Generate the weekly digest for Zedcor across procurement and ops.',
    domain: 'productivity',
    lifecycle_status: 'approved',
    version: 1,
    parent_skill_id: null,
    author_kind: 'human',
    author_id: null,
    approved_by: null,
    approved_at: null,
    taboo_check_id: null,
    run_count: 12,
    success_count: 11,
    last_run_at: '2026-05-10T10:00:00.000Z',
    decay_at: '2026-11-10T10:00:00.000Z',
    customer_id: null,
    evidence: [],
    status: 'active',
    type: 'manual',
    inputs_schema: { type: 'object', properties: {} },
    outputs_schema: { type: 'object' },
    refusal_gate: false,
    budget_usd_per_run: 1.25,
    active: true,
    skill_md_path: 'wiki/skills/run-zedcor-weekly-digest.md',
    run_endpoint: '/api/atrium/skills/run',
    execution: 'api',
    schedule_cron: null,
    trigger_event: null,
    created_at: '2026-05-01T10:00:00.000Z',
    updated_at: '2026-05-10T10:00:00.000Z',
    ...overrides,
  };
}

export function makeSearchResult(
  skill: Partial<Skill>,
  score: number,
  reasons: string[] = [],
): SkillSearchResult {
  return { skill: makeSkill(skill), score, reasons };
}
