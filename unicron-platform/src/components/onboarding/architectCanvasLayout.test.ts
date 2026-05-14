import { describe, it, expect } from 'vitest';
import { buildArchitectGraph } from './architectCanvasLayout';
import type { DecompositionArchitecture } from '../../lib/contracts/architect';

const arch: DecompositionArchitecture = {
  buyer: 'distributors of temporary construction-site security',
  buying_signal: 'large new commercial construction permits, value > $1M',
  data_sources_proposed: [
    { type: 'permits', jurisdictions: ['Pittsburgh, PA'], expected_daily_volume: 110 },
    { type: 'sam_gov', jurisdictions: ['US national'], expected_daily_volume: 38 },
  ],
  data_sources_rejected: [],
  layer_2_watchers: [
    { source_type: 'permits', instruction: 'Poll permit feeds.' },
    { source_type: 'sam_gov', instruction: 'Watch sam.gov.' },
  ],
  layer_3_agents: [
    { role: 'Qualifier', instruction: 'Filter by value.' },
    { role: 'Enricher', instruction: 'Resolve GC contact.' },
  ],
  layer_4_agents: [
    { role: 'Ranker', instruction: 'Score qualified events.' },
  ],
  estimates: {
    daily_qualified_volume: 7,
    cost_per_lead_usd: 0.06,
    architecture_confidence: 'high',
  },
  open_questions: [],
  business_summary: {
    lead_type: 'GC projects',
    business_area: 'Construction security',
    problem_solved: 'Manual permit scraping',
    what_they_get: 'A ranked daily list of qualified projects',
  },
};

describe('buildArchitectGraph', () => {
  it('produces a node for each source, watcher, agent, plus dashboard', () => {
    const { nodes } = buildArchitectGraph(arch);
    const sources = nodes.filter((n) => n.id.startsWith('src-'));
    const l2 = nodes.filter((n) => n.id.startsWith('l2-'));
    const l3 = nodes.filter((n) => n.id.startsWith('l3-'));
    const l4 = nodes.filter((n) => n.id.startsWith('l4-'));
    const dash = nodes.find((n) => n.id === 'dashboard');

    expect(sources).toHaveLength(2);
    expect(l2).toHaveLength(2);
    expect(l3).toHaveLength(2);
    expect(l4).toHaveLength(1);
    expect(dash).toBeDefined();
  });

  it('top-down ordering: sources at top y, dashboard at bottom y', () => {
    const { nodes } = buildArchitectGraph(arch);
    const sourceY = nodes.find((n) => n.id === 'src-0')!.position.y;
    const l4Y = nodes.find((n) => n.id === 'l4-0')!.position.y;
    const dashY = nodes.find((n) => n.id === 'dashboard')!.position.y;

    expect(sourceY).toBeLessThan(l4Y);
    expect(l4Y).toBeLessThan(dashY);
  });

  it('matches source→watcher edges by source_type', () => {
    const { edges } = buildArchitectGraph(arch);
    // src-0 is 'permits' → l2-0 ('permits' watcher). src-1 is 'sam_gov' → l2-1.
    expect(edges.some((e) => e.source === 'src-0' && e.target === 'l2-0')).toBe(true);
    expect(edges.some((e) => e.source === 'src-1' && e.target === 'l2-1')).toBe(true);
    // No spurious cross edges (sam_gov source to permits watcher).
    expect(edges.some((e) => e.source === 'src-1' && e.target === 'l2-0')).toBe(false);
  });

  it('terminates with an edge into dashboard from the deepest agent layer', () => {
    const { edges } = buildArchitectGraph(arch);
    const intoDash = edges.filter((e) => e.target === 'dashboard');
    // L4 has 1 agent → exactly 1 edge into dashboard.
    expect(intoDash).toHaveLength(1);
    expect(intoDash[0].source).toBe('l4-0');
  });

  it('handles empty architecture without throwing', () => {
    const empty: DecompositionArchitecture = {
      ...arch,
      data_sources_proposed: [],
      layer_2_watchers: [],
      layer_3_agents: [],
      layer_4_agents: [],
    };
    const { nodes, edges } = buildArchitectGraph(empty);
    expect(nodes.find((n) => n.id === 'dashboard')).toBeDefined();
    expect(edges).toHaveLength(0);
  });
});
