// __tests__/internal-chat/lead-chat-context.test.ts
//
// Pure unit tests for the Sonar system-prompt builder used by the Internal
// Lead Chat Agent. The builder is the only place that decides what real
// data the agent sees, so it carries the SPEC's "answers from real data"
// invariant: every fact it emits must be derivable from the supplied
// CompanyLeadView or the six qualitative signal evidence strings.

import { describe, it, expect } from 'vitest';
import {
  buildLeadChatSystemPrompt,
  projectBundle,
} from '@/lib/chat/lead-chat-context';
import type { Project } from '@/lib/types';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'sam:THALLE',
    source: 'sam.gov',
    source_id: 'THALLE',
    title: 'Thalle Construction Company',
    summary: 'Heavy civil contractor based in NC.',
    lat: null as unknown as number,
    lon: null as unknown as number,
    nearest_branch_id: null,
    distance_miles: null,
    score: 55,
    rationale: 'Federal awardee; AGC membership; outbound BD hiring posted.',
    project_value: null,
    project_stage: null,
    posted_date: '2026-04-12',
    warm_for_customer_id: null,
    raw_payload: {
      internal_enrichment: {
        service_category: 'specialty-trade',
        sales_motion: 'active-outbound',
        associations: ['AGC', 'NUCA'],
      },
      internal_geo: { hq_state: 'NC', operating_states: ['NC', 'SC', 'VA'] },
      internal_federal_registration: 'federal-awardee',
      internal_warm_intro: 'Mutual contact at AGC chapter.',
    } as unknown as Project['raw_payload'],
    verified: true,
    operator_viewed: null,
    organization_id: 'org-internal',
    outreach_hook: 'Open with the federal awardee angle.',
    ...overrides,
  } as Project;
}

describe('projectBundle', () => {
  it('projects a Project row to a CompanyLeadView + the six weighted signals', () => {
    const { view, signals } = projectBundle(makeProject());
    expect(view.company_name).toBe('Thalle Construction Company');
    expect(view.score).toBe(55);
    expect(view.federal_registration).toBe('Federal awardee');
    expect(view.associations).toEqual(['AGC', 'NUCA']);
    expect(view.warm_intro).toBe('Mutual contact at AGC chapter.');
    expect(signals).toHaveLength(6);
    const ids = signals.map((s) => s.id);
    expect(ids).toContain('sales_motion_strength');
    expect(ids).toContain('federal_signal');
    expect(ids).toContain('association_presence');
    const federal = signals.find((s) => s.id === 'federal_signal')!;
    expect(federal.evidence).toBe('Federal awardee');
  });
});

describe('buildLeadChatSystemPrompt', () => {
  const focalProject = makeProject();
  const focal = { project: focalProject, ...projectBundle(focalProject) };

  it('includes the focal company name and score from real data', () => {
    const prompt = buildLeadChatSystemPrompt({
      orgName: 'Internal',
      scopeLabel: 'Thalle Construction Company',
      focal,
      list: [],
      history: [],
    });
    expect(prompt).toContain('Thalle Construction Company');
    expect(prompt).toContain('SCORE: 55 / 100');
    expect(prompt).toContain('FEDERAL REGISTRATION: Federal awardee');
    expect(prompt).toContain('RATIONALE: Federal awardee; AGC membership; outbound BD hiring posted.');
  });

  it('lists the six weighted signals with their architecture weights and evidence', () => {
    const prompt = buildLeadChatSystemPrompt({
      orgName: 'Internal',
      scopeLabel: 'Thalle',
      focal,
      list: [],
      history: [],
    });
    expect(prompt).toContain('SIX WEIGHTED SIGNALS');
    expect(prompt).toContain('Sales motion strength (weight 25%)');
    expect(prompt).toContain('Operational footprint (weight 20%)');
    expect(prompt).toContain('Federal signal (weight 15%)');
    expect(prompt).toContain('Project-driven fit (weight 15%)');
    expect(prompt).toContain('Recency (weight 15%)');
    expect(prompt).toContain('Association presence (weight 10%)');
  });

  it('does not emit fabricated numeric point contributions for the signals', () => {
    const prompt = buildLeadChatSystemPrompt({
      orgName: 'Internal',
      scopeLabel: 'Thalle',
      focal,
      list: [],
      history: [],
    });
    // The block lists `weight 15%` for Federal signal but never invents a
    // point contribution (e.g. "Federal signal: 8 of 55" or "+8 pts").
    expect(prompt).not.toMatch(/Federal signal[^\n]*\+\d+\s*(pt|pts|points)/);
    expect(prompt).not.toMatch(/contributes\s+\d+\s+(pt|pts|points)/i);
  });

  it('contains no em-dashes or en-dashes (SPEC SHARED rule)', () => {
    const prompt = buildLeadChatSystemPrompt({
      orgName: 'Internal',
      scopeLabel: 'Thalle',
      focal,
      list: [],
      history: [],
    });
    expect(/[—–]/.test(prompt)).toBe(false);
  });

  it('emits a list block when companies in scope are provided', () => {
    const a = makeProject({ id: 'a', title: 'Apex Power', score: 80 });
    const b = makeProject({ id: 'b', title: 'Beacon Civil', score: 70 });
    const prompt = buildLeadChatSystemPrompt({
      orgName: 'Internal',
      scopeLabel: '2 companies',
      focal: null,
      list: [projectBundle(a), projectBundle(b)],
      history: [],
    });
    expect(prompt).toContain('COMPANIES IN SCOPE (top 2)');
    expect(prompt).toContain('Apex Power');
    expect(prompt).toContain('Beacon Civil');
    expect(prompt).toContain('score 80');
    expect(prompt).toContain('score 70');
  });

  it('includes prior turns when history is supplied', () => {
    const prompt = buildLeadChatSystemPrompt({
      orgName: 'Internal',
      scopeLabel: 'list',
      focal: null,
      list: [],
      history: [
        { role: 'user', content: 'top 3 by score' },
        { role: 'assistant', content: 'Apex, Beacon, Thalle.' },
      ],
    });
    expect(prompt).toContain('PRIOR TURNS');
    expect(prompt).toContain('top 3 by score');
    expect(prompt).toContain('Apex, Beacon, Thalle.');
  });
});
