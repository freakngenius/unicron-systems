// __tests__/architect/decomposition-tools.test.ts — Phase 2 Stream D Gate D1.
// Spec: SPEC - Architect Agent.md §3.
//
// Pure-function tests for the decomposition tool handlers. No LLM calls.
// Verifies catalog grounding, structural validation, cost/volume math.

import { describe, expect, it } from 'vitest';
import {
  estimateCostTool,
  estimateVolumeTool,
  proposeAgentTool,
  proposeSourceTool,
  searchAgentTemplatesTool,
  searchSourceTypesTool,
  validateArchitectureTool,
} from '@/services/architect/tools/decomposition';

async function call(tool: { handler: (i: Record<string, unknown>) => unknown | Promise<unknown> }, input: Record<string, unknown>) {
  return await tool.handler(input);
}

describe('searchSourceTypes', () => {
  it('returns construction-related sources for "construction"', async () => {
    const result = (await call(searchSourceTypesTool, { industry: 'construction' })) as {
      sources: { type: string }[];
    };
    const types = result.sources.map((s) => s.type);
    expect(types).toContain('harris-county-permits');
    expect(types).toContain('austin-tx-permits');
  });

  it('returns FEMA for "disaster_signal"', async () => {
    const result = (await call(searchSourceTypesTool, { industry: 'disaster_signal' })) as {
      sources: { type: string }[];
    };
    expect(result.sources.map((s) => s.type)).toContain('fema-disaster-declarations');
  });

  it('returns no results for nonsense industry', async () => {
    const result = (await call(searchSourceTypesTool, { industry: 'xqxqzyz' })) as {
      sources: unknown[];
    };
    expect(result.sources.length).toBe(0);
  });
});

describe('searchAgentTemplates', () => {
  it('finds qualifier template by role', async () => {
    const result = (await call(searchAgentTemplatesTool, { role: 'qualifier' })) as {
      templates: { role: string }[];
    };
    expect(result.templates.map((t) => t.role)).toContain('qualifier');
  });

  it('returns full set for empty query', async () => {
    const result = (await call(searchAgentTemplatesTool, { role: '' })) as {
      templates: unknown[];
    };
    expect(result.templates.length).toBeGreaterThan(5);
  });
});

describe('proposeAgent', () => {
  it('rejects too-short instruction', async () => {
    const out = (await call(proposeAgentTool, {
      role: 'qualifier',
      layer: 3,
      instruction: 'short',
      inputs: ['raw_event'],
      outputs: ['signal'],
    })) as { ok: boolean; error?: string };
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/instruction/);
  });

  it('normalizes a valid agent', async () => {
    const out = (await call(proposeAgentTool, {
      role: 'qualifier',
      layer: 3,
      instruction: 'Score the construction permit for relevance to physical-security buyers.',
      inputs: ['raw_event.payload'],
      outputs: ['signal.qualified', 'signal.rejected'],
    })) as { ok: boolean; agent: { layer: number } };
    expect(out.ok).toBe(true);
    expect(out.agent.layer).toBe(3);
  });

  it('rejects invalid layer', async () => {
    const out = (await call(proposeAgentTool, {
      role: 'qualifier',
      layer: 99,
      instruction: 'long enough instruction here surely it is',
      inputs: [],
      outputs: [],
    })) as { ok: boolean };
    expect(out.ok).toBe(false);
  });
});

describe('proposeSource', () => {
  it('marks known sources is_known_source: true', async () => {
    const out = (await call(proposeSourceTool, {
      type: 'usaspending',
      jurisdictions: ['national_us'],
    })) as { ok: boolean; source: { is_known_source: boolean; tier: string } };
    expect(out.ok).toBe(true);
    expect(out.source.is_known_source).toBe(true);
    expect(out.source.tier).toBe('tier_1');
  });

  it('marks unknown sources is_known_source: false and tier_3', async () => {
    const out = (await call(proposeSourceTool, {
      type: 'custom-magic-feed',
      jurisdictions: ['na'],
    })) as { source: { is_known_source: boolean; tier: string } };
    expect(out.source.is_known_source).toBe(false);
    expect(out.source.tier).toBe('tier_3');
  });
});

describe('estimateVolume', () => {
  it('scales county-level sources by jurisdiction count', async () => {
    const oneGeo = (await call(estimateVolumeTool, {
      sourceTypes: ['harris-county-permits'],
      geos: ['TX-Harris'],
    })) as { dailyEvents: number };
    const fourGeos = (await call(estimateVolumeTool, {
      sourceTypes: ['harris-county-permits'],
      geos: ['TX-Harris', 'TX-Travis', 'TX-Bexar', 'TX-Dallas'],
    })) as { dailyEvents: number };
    expect(fourGeos.dailyEvents).toBeGreaterThan(oneGeo.dailyEvents);
  });

  it('does not scale national sources by jurisdiction count', async () => {
    const oneGeo = (await call(estimateVolumeTool, {
      sourceTypes: ['usaspending'],
      geos: ['national_us'],
    })) as { dailyEvents: number };
    const fourGeos = (await call(estimateVolumeTool, {
      sourceTypes: ['usaspending'],
      geos: ['a', 'b', 'c', 'd'],
    })) as { dailyEvents: number };
    expect(fourGeos.dailyEvents).toBe(oneGeo.dailyEvents);
  });

  it('returns zero for unknown source types', async () => {
    const out = (await call(estimateVolumeTool, {
      sourceTypes: ['absolutely-not-a-thing'],
      geos: ['a'],
    })) as { dailyEvents: number; knownSources: number };
    expect(out.dailyEvents).toBe(0);
    expect(out.knownSources).toBe(0);
  });
});

describe('estimateCost', () => {
  it('produces a positive cost-per-lead', async () => {
    const out = (await call(estimateCostTool, {
      agentCount: 5,
      llmCallsPerLead: 3,
    })) as { costPerLead: number };
    expect(out.costPerLead).toBeGreaterThan(0);
    expect(out.costPerLead).toBeLessThan(1.0);
  });

  it('scales with llm calls per lead', async () => {
    const a = (await call(estimateCostTool, { agentCount: 3, llmCallsPerLead: 1 })) as {
      costPerLead: number;
    };
    const b = (await call(estimateCostTool, { agentCount: 3, llmCallsPerLead: 5 })) as {
      costPerLead: number;
    };
    expect(b.costPerLead).toBeGreaterThan(a.costPerLead);
  });
});

describe('validateArchitecture', () => {
  const validConfig = {
    data_sources_proposed: [
      { type: 'usaspending', jurisdictions: ['national_us'], expected_daily_volume: 500 },
    ],
    layer_2_watchers: [
      { source_type: 'usaspending', instruction: 'poll usaspending hourly' },
    ],
    layer_3_agents: [
      { role: 'qualifier', instruction: 'Score the federal contract for security-services relevance.' },
      { role: 'enricher', instruction: 'Add place-of-performance + recipient duns data.' },
    ],
    layer_4_agents: [
      { role: 'ranker', instruction: 'Score 0-100 based on $ value, geography, recency.' },
      { role: 'outreach-drafter', instruction: 'Draft 3-channel outreach for top scored signals.' },
    ],
    estimates: { daily_qualified_volume: 20, cost_per_lead_usd: 0.03 },
  };

  it('passes a valid config', async () => {
    const out = (await call(validateArchitectureTool, validConfig)) as {
      ok: boolean;
      issues: string[];
    };
    expect(out.ok).toBe(true);
    expect(out.issues).toEqual([]);
  });

  it('rejects when no data sources', async () => {
    const out = (await call(validateArchitectureTool, {
      ...validConfig,
      data_sources_proposed: [],
    })) as { ok: boolean; issues: string[] };
    expect(out.ok).toBe(false);
    expect(out.issues.some((i) => /empty/.test(i))).toBe(true);
  });

  it('rejects when source has no watcher', async () => {
    const out = (await call(validateArchitectureTool, {
      ...validConfig,
      layer_2_watchers: [],
    })) as { ok: boolean; issues: string[] };
    expect(out.ok).toBe(false);
    expect(out.issues.some((i) => /watcher/.test(i))).toBe(true);
  });

  it('rejects unknown non-custom-prefixed source types', async () => {
    const out = (await call(validateArchitectureTool, {
      ...validConfig,
      data_sources_proposed: [
        { type: 'made-up-feed', jurisdictions: ['x'], expected_daily_volume: 1 },
      ],
      layer_2_watchers: [{ source_type: 'made-up-feed', instruction: 'poll' }],
    })) as { ok: boolean; issues: string[] };
    expect(out.ok).toBe(false);
    expect(out.issues.some((i) => /catalog/.test(i))).toBe(true);
  });

  it('accepts custom-prefixed source types', async () => {
    const out = (await call(validateArchitectureTool, {
      ...validConfig,
      data_sources_proposed: [
        { type: 'custom-vertical-feed', jurisdictions: ['x'], expected_daily_volume: 1 },
      ],
      layer_2_watchers: [
        { source_type: 'custom-vertical-feed', instruction: 'tier_3 onboarding required' },
      ],
    })) as { ok: boolean; issues: string[] };
    expect(out.ok).toBe(true);
  });

  it('rejects too-short agent instructions', async () => {
    const out = (await call(validateArchitectureTool, {
      ...validConfig,
      layer_3_agents: [{ role: 'qualifier', instruction: 'short' }],
    })) as { ok: boolean; issues: string[] };
    expect(out.ok).toBe(false);
    expect(out.issues.some((i) => /too-short/.test(i))).toBe(true);
  });

  it('rejects out-of-bounds estimates', async () => {
    const out = (await call(validateArchitectureTool, {
      ...validConfig,
      estimates: { daily_qualified_volume: 1_000_000, cost_per_lead_usd: 50 },
    })) as { ok: boolean; issues: string[] };
    expect(out.ok).toBe(false);
    expect(out.issues.length).toBeGreaterThan(1);
  });

  it('flags missing synthesis role in layer_4', async () => {
    const out = (await call(validateArchitectureTool, {
      ...validConfig,
      layer_4_agents: [
        { role: 'personalizer', instruction: 'Tailor copy to the recipient based on history.' },
      ],
    })) as { ok: boolean; issues: string[] };
    expect(out.ok).toBe(false);
    expect(out.issues.some((i) => /synthesis/.test(i))).toBe(true);
  });
});
