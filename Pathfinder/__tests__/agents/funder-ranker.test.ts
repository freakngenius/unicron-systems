// __tests__/agents/funder-ranker.test.ts
// Funder onboarding Stage 5 — extractor + rationale tests.

import { describe, it, expect } from 'vitest';
import { scoreGenericProject } from '@/lib/agents/ranker/genericScorer';
import {
  buildSystemPrompt,
  buildUserPayload,
  parseSonnetOutput,
} from '@/lib/agents/ranker/genericRationale';
import { resolveArchitecture } from '@/lib/config/resolveArchitecture';
import funderFixture from '../fixtures/funder-architecture.json';
import type { Project } from '@/lib/types';

const { _comment: _x, ...funderInput } = funderFixture as unknown as Record<string, unknown>;
const FUNDER_ARCH = resolveArchitecture(funderInput);

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    source: 'custom-propublica-nonprofit-explorer',
    source_id: 'p1',
    title: 'Alignment Research Inc',
    summary: 'AI safety research nonprofit working on alignment.',
    lat: null,
    lon: null,
    project_value: null,
    project_stage: null,
    posted_date: new Date(Date.now() - 14 * 86_400_000).toISOString(),
    raw_payload: {
      funder_inferred_thesis: 'ai-safety',
      thesis_match: 'ai-safety',
      founder_affiliation: 'OpenAI alignment team',
    },
    rationale: null,
    rationale_streamed_at: null,
    score: null,
    nearest_branch_id: null,
    distance_miles: null,
    outreach_hook: null,
    warm_for_customer_id: null,
    ingested_at: new Date().toISOString(),
    ranked_at: null,
    organization_id: 'funder-uuid',
    ...overrides,
  };
}

describe('Funder ranker extractors', () => {
  it('scores a well-shaped Funder candidate above 60/100', () => {
    const result = scoreGenericProject(makeProject(), FUNDER_ARCH);
    expect(result.score).toBeGreaterThan(60);
    // All 6 Funder extractors should have components.
    expect(result.components.thesis_fit).toBe(1);
    expect(result.components.founder_credential).toBe(1);
    expect(result.components.recency).toBe(1);
    expect(result.components.talent_density).toBeGreaterThan(0);
  });

  it('drops thesis_fit to 0 when no thesis signal present', () => {
    const p = makeProject({
      raw_payload: { founder_affiliation: 'Goldman Sachs' },
      summary: 'Investment banking spinoff.',
    });
    const result = scoreGenericProject(p, FUNDER_ARCH);
    expect(result.components.thesis_fit).toBe(0);
  });

  it('founder_credential tier 1 vs tier 2 vs unknown', () => {
    const tier1 = scoreGenericProject(
      makeProject({ raw_payload: { founder_affiliation: 'Anthropic' }, summary: '' }),
      FUNDER_ARCH,
    );
    const tier2 = scoreGenericProject(
      makeProject({ raw_payload: { founder_affiliation: 'Harvard' }, summary: '' }),
      FUNDER_ARCH,
    );
    const unknown = scoreGenericProject(
      makeProject({ raw_payload: {}, summary: 'No affiliation listed' }),
      FUNDER_ARCH,
    );
    expect(tier1.components.founder_credential).toBe(1);
    expect(tier2.components.founder_credential).toBe(0.7);
    expect(unknown.components.founder_credential).toBe(0.2);
  });

  it('raise_stage maps fundraising_stage payload to score', () => {
    const active = scoreGenericProject(
      makeProject({ raw_payload: { fundraising_stage: 'actively-raising' } }),
      FUNDER_ARCH,
    );
    const raised = scoreGenericProject(
      makeProject({ raw_payload: { fundraising_stage: 'raised' } }),
      FUNDER_ARCH,
    );
    expect(active.components.raise_stage).toBe(1);
    expect(raised.components.raise_stage).toBeLessThan(0.2);
  });

  it('recency decays with age', () => {
    const fresh = scoreGenericProject(
      makeProject({ posted_date: new Date().toISOString() }),
      FUNDER_ARCH,
    );
    const old = scoreGenericProject(
      makeProject({ posted_date: new Date(Date.now() - 500 * 86_400_000).toISOString() }),
      FUNDER_ARCH,
    );
    expect(fresh.components.recency).toBe(1);
    expect(old.components.recency).toBeLessThanOrEqual(0.2);
  });

  it('peer_funder_signal lifts when peer name is in haystack', () => {
    const withPeer = scoreGenericProject(
      makeProject({
        summary: 'Project receives funding from Open Philanthropy.',
        raw_payload: {},
      }),
      FUNDER_ARCH,
    );
    expect(withPeer.components.peer_funder_signal).toBeGreaterThanOrEqual(0.7);
  });

  it('Zedcor-shaped extractors are not invoked for Funder (architecture has no weights for them)', () => {
    const result = scoreGenericProject(makeProject(), FUNDER_ARCH);
    // scoreGenericProject only invokes an extractor when the architecture
    // has a weight for it. Funder's architecture only weights the 6 new
    // Funder extractors, so the Zedcor-shaped ones simply don't appear in
    // components. The Zedcor extractor *code* is unchanged.
    expect(result.components.basis_fit).toBeUndefined();
    expect(result.components.unit_count_fit).toBeUndefined();
    expect(result.components.geography_match).toBeUndefined();
    expect(result.components.asset_class_match).toBeUndefined();
  });
});

describe('Funder generic rationale prompt construction', () => {
  it('system prompt uses architecture branding and persona', () => {
    const sys = buildSystemPrompt(FUNDER_ARCH);
    expect(sys).toContain('Funder');
    expect(sys).toContain('philanthropic deal-sourcing lead');
    expect(sys).toContain('opportunity'); // lead_unit.name
    expect(sys.toLowerCase()).toContain('weekly curated deal memo'); // business_summary.what_they_get
    expect(sys).toContain('RATIONALE:');
    expect(sys).toContain('FIRST_STEP:');
  });

  it('user payload surfaces score components and qualifier-set raw_payload keys', () => {
    const project = makeProject();
    const payload = JSON.parse(
      buildUserPayload({
        project,
        architecture: FUNDER_ARCH,
        scoreComposite: 82,
        scoreComponents: { thesis_fit: 1, founder_credential: 0.7, recency: 0.8 },
      }),
    ) as { project: { raw_payload_excerpt: Record<string, unknown> }; score: { composite_0_100: number } };
    expect(payload.project.raw_payload_excerpt.funder_inferred_thesis).toBe('ai-safety');
    expect(payload.score.composite_0_100).toBe(82);
  });
});

describe('Sonnet output parser', () => {
  it('parses RATIONALE: / FIRST_STEP: format', () => {
    const text = `RATIONALE: This org is a clean fit. Founders ship.
FIRST_STEP: Email the founder next Tuesday after their podcast appearance.`;
    const out = parseSonnetOutput(text);
    expect(out.rationale).toContain('clean fit');
    expect(out.first_step).toContain('Tuesday');
  });

  it('falls back to whole-text rationale when format is malformed', () => {
    const out = parseSonnetOutput('just some prose');
    expect(out.rationale).toBe('just some prose');
    expect(out.first_step).toBe('');
  });
});
