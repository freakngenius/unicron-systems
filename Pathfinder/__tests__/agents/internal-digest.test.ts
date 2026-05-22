// __tests__/agents/internal-digest.test.ts
//
// Stage 8 — Internal daily digest composer.
//
// Pure function: no I/O, no LLM. Asserts ranking, top-N, the empty-state
// branch, and the Slack block shape.

import { describe, it, expect } from 'vitest';
import { composeInternalDigest, readEntry } from '@/lib/agents/internal/digest';
import type { Project } from '@/lib/types';

function project(overrides: Partial<Project> & { id?: string } = {}): Project {
  return {
    id: 'p1',
    source: 'sam-gov',
    source_id: 'p1',
    title: 'Acme Site Services',
    summary: '',
    lat: null,
    lon: null,
    project_value: null,
    project_stage: null,
    posted_date: null,
    raw_payload: {
      internal_enrichment: { service_category: 'temp-fence' },
      internal_geo: { hq_state: 'TX', operating_states: ['TX', 'OK'] },
    },
    rationale: null,
    rationale_streamed_at: null,
    score: 80,
    nearest_branch_id: null,
    distance_miles: null,
    outreach_hook: 'Reach out to the VP of Sales Jane Doe',
    warm_for_customer_id: null,
    ingested_at: new Date().toISOString(),
    ranked_at: new Date().toISOString(),
    organization_id: '2ff1197b-36f8-4210-aa11-65cf025ad83b',
    verified: true,
    ...overrides,
  } as unknown as Project;
}

describe('composeInternalDigest', () => {
  it('ranks projects by score descending', () => {
    const projects = [
      project({ id: 'a', title: 'Acme A', score: 70 }),
      project({ id: 'b', title: 'Acme B', score: 90 }),
      project({ id: 'c', title: 'Acme C', score: 80 }),
    ];
    const d = composeInternalDigest({ projects });
    expect(d.entries.map((e) => e.company_name)).toEqual(['Acme B', 'Acme C', 'Acme A']);
  });

  it('caps to top_n', () => {
    const projects = Array.from({ length: 25 }, (_, i) =>
      project({ id: `p${i}`, title: `Acme ${i}`, score: 100 - i }),
    );
    const d = composeInternalDigest({ projects, top_n: 5 });
    expect(d.entries).toHaveLength(5);
    expect(d.entries[0].score).toBe(100);
  });

  it('emits an empty-state message when no companies are present', () => {
    const d = composeInternalDigest({ projects: [], display_name: 'Unicron Internal' });
    expect(d.entries).toEqual([]);
    expect(d.slack_text).toContain('no new verified companies');
    expect(d.slack_blocks[0]).toHaveProperty('type', 'header');
  });

  it('builds entries that include service_category, hq, ops, and first_step', () => {
    const e = readEntry(project());
    expect(e.company_name).toBe('Acme Site Services');
    expect(e.service_category).toBe('temp-fence');
    expect(e.hq_state).toBe('TX');
    expect(e.operating_states).toEqual(['TX', 'OK']);
    expect(e.first_step).toBe('Reach out to the VP of Sales Jane Doe');
    expect(e.url).toContain('/internal/lead/');
  });

  it('renders slack blocks that quote the company name and score', () => {
    const d = composeInternalDigest({ projects: [project()] });
    const sectionBlock = d.slack_blocks.find((b) => b.type === 'section') as
      | { text?: { text?: string } }
      | undefined;
    expect(sectionBlock?.text?.text).toContain('Acme Site Services');
    expect(sectionBlock?.text?.text).toContain('80/100');
  });
});
