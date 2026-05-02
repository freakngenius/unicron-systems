// Adapter tests — pure-function coverage for the Stream D wire → Stream C
// legacy UI shape conversion. No I/O, no network.

import { describe, expect, it } from 'vitest';
import {
  archProposalRowToLegacy,
  architectureToLines,
  architectureToSystemConfig,
  decompositionApiToLegacy,
  relativeTime,
  typeToCategory,
} from './architectAdapters';
import type {
  ArchitectProposalRow,
  DecompositionApiResponse,
  DecompositionArchitecture,
} from './contracts/architect';

const exampleArchitecture: DecompositionArchitecture = {
  buyer: 'physical-security-services',
  buying_signal: 'new construction site needing temporary security',
  data_sources_proposed: [
    {
      type: 'harris-county-permits',
      jurisdictions: ['TX-Harris'],
      expected_daily_volume: 80,
    },
    {
      type: 'austin-tx-permits',
      jurisdictions: ['TX-Travis'],
      expected_daily_volume: 40,
    },
  ],
  data_sources_rejected: [
    { type: 'sec-edgar', reason: 'not relevant to construction-site security' },
  ],
  layer_2_watchers: [
    { source_type: 'harris-county-permits', instruction: 'poll daily' },
    { source_type: 'austin-tx-permits', instruction: 'poll daily' },
  ],
  layer_3_agents: [
    { role: 'qualifier', instruction: 'Score the permit for security need.' },
    { role: 'enricher', instruction: 'Add value, contractor, schedule.' },
  ],
  layer_4_agents: [
    { role: 'ranker', instruction: 'Score 0-100.' },
    { role: 'outreach-drafter', instruction: 'Draft 3-channel outreach.' },
  ],
  estimates: {
    daily_qualified_volume: 12,
    cost_per_lead_usd: 0.04,
    architecture_confidence: 'high',
  },
  open_questions: [],
};

const exampleApiResponse: DecompositionApiResponse = {
  proposal_id: 'prop-1',
  session_id: 'sess-1',
  architecture: exampleArchitecture,
  reasoning: ['Looking up sources for construction.', 'Finalizing.'],
  cost_usd: 0.43,
  duration_ms: 14_200,
  status: 'completed',
};

describe('decompositionApiToLegacy', () => {
  it('maps session_id, cost, and confidence to legacy shape', () => {
    const legacy = decompositionApiToLegacy(exampleApiResponse, 'I want construction security');
    expect(legacy.sessionId).toBe('sess-1');
    expect(legacy.costUsd).toBe(0.43);
    expect(legacy.confidence).toBe(0.85);                  // 'high' → 0.85
    expect(legacy.recommendedConfig.status).toBe('configured');
    expect(legacy.recommendedConfig.buyerPain).toBe('I want construction security');
  });

  it('produces lines starting with BUYER and BUYING SIGNAL', () => {
    const legacy = decompositionApiToLegacy(exampleApiResponse, 'pain');
    const lines = legacy.lines.map((l) => l.text);
    expect(lines[0]).toMatch(/^BUYER/);
    expect(lines[1]).toMatch(/^BUYING SIGNAL/);
  });

  it('renders proposed sources and architecture layers', () => {
    const legacy = decompositionApiToLegacy(exampleApiResponse, 'pain');
    const all = legacy.lines.map((l) => l.text).join('\n');
    expect(all).toMatch(/PUBLIC DATA SOURCES/);
    expect(all).toMatch(/harris-county-permits/);
    expect(all).toMatch(/PROPOSED ARCHITECTURE/);
    expect(all).toMatch(/L3 {2}qualifier/);
    expect(all).toMatch(/L4 {2}ranker/);
  });

  it('flags reasoning as kind="cost" so settings can hide it', () => {
    const legacy = decompositionApiToLegacy(exampleApiResponse, 'pain');
    const reasoningLines = legacy.lines.filter((l) => l.kind === 'cost');
    expect(reasoningLines.length).toBeGreaterThan(0);
    expect(reasoningLines.some((l) => l.text.includes('decomposition cost: $'))).toBe(true);
  });

  it('emits a confidence summary line', () => {
    const legacy = decompositionApiToLegacy(exampleApiResponse, 'pain');
    const conf = legacy.lines.find((l) => l.kind === 'confidence');
    expect(conf?.text).toMatch(/CONFIDENCE/);
    expect(conf?.text).toMatch(/high/);
    expect(conf?.text).toMatch(/12 qualified\/day/);
  });
});

describe('architectureToSystemConfig', () => {
  it('renders watchers + Layer 3 + Layer 4 agents into SystemConfig', () => {
    const cfg = architectureToSystemConfig(exampleArchitecture, 'pain');
    expect(cfg.dataSources.length).toBe(2);
    expect(cfg.agents.filter((a) => a.layer === 2).length).toBe(2);
    expect(cfg.agents.filter((a) => a.layer === 3).length).toBe(2);
    expect(cfg.agents.filter((a) => a.layer === 4).length).toBe(2);
  });

  it('weights data sources proportionally to expected_daily_volume', () => {
    const cfg = architectureToSystemConfig(exampleArchitecture, 'pain');
    const harris = cfg.dataSources.find((s) => s.id.includes('harris'));
    const austin = cfg.dataSources.find((s) => s.id.includes('austin'));
    expect(harris?.weight).toBeDefined();
    expect(austin?.weight).toBeDefined();
    expect((harris?.weight ?? 0) + (austin?.weight ?? 0)).toBeCloseTo(1, 2);
    // harris has 80 events/day, austin has 40 — harris should weigh more.
    expect(harris!.weight).toBeGreaterThan(austin!.weight);
  });

  it('maps known source types to platform DataSourceType', () => {
    const cfg = architectureToSystemConfig(exampleArchitecture, 'pain');
    for (const s of cfg.dataSources) {
      expect(s.type).toBe('permits');
    }
  });

  it('falls back to even weights when expected volumes are zero', () => {
    const arch: DecompositionArchitecture = {
      ...exampleArchitecture,
      data_sources_proposed: [
        { type: 'a', jurisdictions: [], expected_daily_volume: 0 },
        { type: 'b', jurisdictions: [], expected_daily_volume: 0 },
      ],
      layer_2_watchers: [],
    };
    const cfg = architectureToSystemConfig(arch, 'p');
    expect(cfg.dataSources[0].weight).toBeCloseTo(0.5, 2);
  });
});

describe('architectureToLines', () => {
  it('renders open_questions as a separate block when present', () => {
    const arch: DecompositionArchitecture = {
      ...exampleArchitecture,
      open_questions: ['need to clarify branch coverage radius'],
    };
    const lines = architectureToLines(arch, []);
    const text = lines.map((l) => l.text).join('\n');
    expect(text).toMatch(/OPEN QUESTIONS/);
    expect(text).toMatch(/branch coverage radius/);
  });

  it('omits the rejected sources block when none', () => {
    const arch: DecompositionArchitecture = {
      ...exampleArchitecture,
      data_sources_rejected: [],
    };
    const lines = architectureToLines(arch, []);
    const text = lines.map((l) => l.text).join('\n');
    expect(text).not.toMatch(/REJECTED SOURCES/);
  });
});

describe('archProposalRowToLegacy', () => {
  const baseRow: ArchitectProposalRow = {
    id: 'p-1',
    session_id: 'sess-1',
    vertical_id: 'pathfinder-default',
    type: 'source_discovery',
    headline: 'Add Travis County, TX',
    body: '23% of qualified leads in the last 7 days reference projects in Travis County.',
    details: {
      candidate_jurisdiction: 'TX-Travis',
      source_type: 'austin-tx-permits',
      source_url: 'https://data.austintexas.gov/dataset/Permits-Issued/3syk-w9eu',
      source_name: 'City of Austin permits',
      tier: 'tier_1',
      reference_rate: 0.23,
      lift_per_day: 4.8,
      confidence: 0.82,
    },
    confidence: 0.82,
    status: 'pending',
    resolved_at: null,
    resolved_by_user_email: null,
    resolution_notes: null,
    source_input_summary: null,
    created_at: new Date(Date.now() - 8 * 60_000).toISOString(),
  };

  it('maps source_discovery → category=sources + label', () => {
    const ui = archProposalRowToLegacy(baseRow);
    expect(ui.category).toBe('sources');
    expect(ui.type).toBe('SOURCE DISCOVERY');
  });

  it('emits relative time string', () => {
    const ui = archProposalRowToLegacy(baseRow);
    expect(ui.time).toMatch(/^(\d+s|\d+m|\d+h|\d+d) ago$/);
  });

  it('flattens details jsonb into [{k,v}] for the source_discovery type', () => {
    const ui = archProposalRowToLegacy(baseRow);
    const keys = ui.details.map((d) => d.k);
    expect(keys).toContain('jurisdiction');
    expect(keys).toContain('source');
    expect(keys).toContain('tier');
    expect(keys).toContain('reference rate');
    expect(keys).toContain('estimated lift');
    expect(keys).toContain('url');
  });

  it('formats reference_rate as percent', () => {
    const ui = archProposalRowToLegacy(baseRow);
    const ref = ui.details.find((d) => d.k === 'reference rate');
    expect(ref?.v).toBe('23%');
  });

  it('maps tuning_suggestion → category=tuning + shadow test details', () => {
    const tuningRow: ArchitectProposalRow = {
      ...baseRow,
      type: 'tuning_suggestion',
      details: {
        agent_role: 'geo-mapper',
        cluster_key: 'wrong-geography',
        cluster_count: 4,
        shadow_test: {
          sample_size: 10,
          wins: 8,
          losses: 2,
          side_effects: 0,
          win_rate: 0.8,
          side_effect_rate: 0,
          method: 'model_introspective_estimate',
        },
        confidence: 0.7,
        estimated_impact: '-80% wrong-geo dismissals',
      },
    };
    const ui = archProposalRowToLegacy(tuningRow);
    expect(ui.category).toBe('tuning');
    expect(ui.details.find((d) => d.k === 'shadow win rate')?.v).toBe('80%');
    expect(ui.details.find((d) => d.k === 'estimated impact')?.v).toMatch(/wrong-geo/);
  });

  it('maps vertical_configuration + agent_proposal → category=agents', () => {
    expect(typeToCategory('vertical_configuration')).toBe('agents');
    expect(typeToCategory('agent_proposal')).toBe('agents');
  });
});

describe('relativeTime', () => {
  it('formats seconds, minutes, hours, days', () => {
    const now = Date.now();
    expect(relativeTime(new Date(now - 30_000).toISOString())).toMatch(/^\d+s ago$/);
    expect(relativeTime(new Date(now - 5 * 60_000).toISOString())).toMatch(/^5m ago$/);
    expect(relativeTime(new Date(now - 3 * 3600_000).toISOString())).toMatch(/^3h ago$/);
    expect(relativeTime(new Date(now - 2 * 86_400_000).toISOString())).toMatch(/^2d ago$/);
  });

  it('handles invalid timestamps gracefully', () => {
    expect(relativeTime('nonsense')).toBe('');
  });
});
