// __tests__/agents/funder-deal-memo.test.ts
// Funder onboarding Stage 7 — Weekly Deal Memo composer.

import { describe, it, expect } from 'vitest';
import { composeDealMemo } from '@/lib/agents/funder/dealMemo';
import type { Project } from '@/lib/types';

function makeP(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    source: 'custom-propublica-nonprofit-explorer',
    source_id: 'p1',
    title: 'Test Org',
    summary: 's',
    lat: null,
    lon: null,
    project_value: null,
    project_stage: null,
    posted_date: new Date().toISOString(),
    raw_payload: { funder_inferred_thesis: 'ai-safety', founder_affiliation: 'OpenAI', funder_geo_hub: 'sf-bay' },
    rationale: 'Strong AI safety fit.',
    rationale_streamed_at: null,
    score: 88,
    nearest_branch_id: null,
    distance_miles: null,
    outreach_hook: 'Email founder this week.',
    warm_for_customer_id: null,
    ingested_at: new Date().toISOString(),
    ranked_at: new Date().toISOString(),
    organization_id: 'funder-uuid',
    verified: true,
    ...overrides,
  };
}

describe('composeDealMemo', () => {
  it('groups opportunities by thesis_area', () => {
    const memo = composeDealMemo({
      projects: [
        makeP({ id: 'a', title: 'AI Safety Org', raw_payload: { funder_inferred_thesis: 'ai-safety' } }),
        makeP({ id: 'b', title: 'Biosecurity Org', raw_payload: { funder_inferred_thesis: 'biosecurity', funder_compliance_flag: 'biosecurity-review' } }),
        makeP({ id: 'c', title: 'Another AI Safety Org', raw_payload: { funder_inferred_thesis: 'ai-safety' } }),
      ],
    });
    expect(memo.totals.opportunities).toBe(3);
    expect(memo.totals.thesis_areas).toBe(2);
    expect(memo.totals.biosecurity_flagged).toBe(1);
    expect(memo.by_thesis['ai-safety'].length).toBe(2);
    expect(memo.by_thesis.biosecurity.length).toBe(1);
  });

  it('sorts opportunities within thesis by score desc', () => {
    const memo = composeDealMemo({
      projects: [
        makeP({ id: 'a', title: 'Lower', score: 70 }),
        makeP({ id: 'b', title: 'Higher', score: 95 }),
        makeP({ id: 'c', title: 'Middle', score: 80 }),
      ],
    });
    expect(memo.by_thesis['ai-safety'].map((o) => o.org_name)).toEqual(['Higher', 'Middle', 'Lower']);
  });

  it('renders HTML with each opportunity\'s rationale + first_step', () => {
    const memo = composeDealMemo({ projects: [makeP()], display_name: 'Funder' });
    expect(memo.html).toContain('Strong AI safety fit');
    expect(memo.html).toContain('Email founder this week');
    expect(memo.html).toContain('OpenAI'); // founder
    expect(memo.html).toContain('88/100'); // score
    expect(memo.html).toContain('sf-bay');
    expect(memo.html).toContain('Funder Weekly Deal Memo');
  });

  it('escapes HTML in opportunity text', () => {
    const memo = composeDealMemo({
      projects: [
        makeP({
          title: '<script>alert("xss")</script>',
          rationale: 'Look <out>',
        }),
      ],
    });
    expect(memo.html).not.toContain('<script>alert');
    expect(memo.html).toContain('&lt;script&gt;');
    expect(memo.html).toContain('Look &lt;out&gt;');
  });

  it('produces a plain-text alternative with thesis headers', () => {
    const memo = composeDealMemo({ projects: [makeP()] });
    expect(memo.plain).toContain('AI SAFETY (1)');
    expect(memo.plain).toContain('Test Org');
    expect(memo.plain).toContain('First step: Email founder this week');
  });

  it('handles zero opportunities gracefully', () => {
    const memo = composeDealMemo({ projects: [] });
    expect(memo.totals.opportunities).toBe(0);
    expect(memo.totals.thesis_areas).toBe(0);
    expect(memo.html).toContain('Funder Weekly Deal Memo');
    expect(memo.subject).toContain('0 opportunities');
  });
});
