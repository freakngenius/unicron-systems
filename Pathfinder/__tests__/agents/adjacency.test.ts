// Unit tests for AdjacencyMapper — Stream A Gate A2.
// Stubs the LLM gateway. Asserts:
//   - request attribution (model, surface, agentName, recencyDays)
//   - JSON parse path: well-formed candidates flow through; over-quota
//     candidates truncate to MAX_CANDIDATES; bad rows drop without
//     poisoning the array
//   - failure paths surface a `parse_error` instead of throwing

import { afterEach, describe, expect, it, vi } from 'vitest';

const mockRun = vi.fn();
vi.mock('@/lib/llm/run', () => ({ run: (req: unknown) => mockRun(req) }));

import {
  findAdjacent,
  parseAdjacencyResponse,
  ADJACENCY_MODEL,
} from '@/lib/agents/adjacency';

describe('lib/agents/adjacency — parseAdjacencyResponse', () => {
  it('parses the canonical strict-JSON shape', () => {
    const txt = JSON.stringify({
      candidates: [
        { company_name: 'Acme Restoration', rationale: 'Multi-branch FL', location: 'Tampa, FL' },
        { company_name: 'Bravo Fence', rationale: 'Adjacent vertical' },
      ],
    });
    const r = parseAdjacencyResponse(txt);
    expect(r.parse_error).toBeNull();
    expect(r.candidates).toHaveLength(2);
    expect(r.candidates[0].company_name).toBe('Acme Restoration');
    expect(r.candidates[0].location).toBe('Tampa, FL');
    expect(r.candidates[1].location).toBeNull();
  });

  it('caps candidates at MAX_CANDIDATES (5) when the model returns more', () => {
    const oversize = {
      candidates: Array.from({ length: 9 }, (_, i) => ({
        company_name: `Co ${i}`,
        rationale: `r${i}`,
      })),
    };
    const r = parseAdjacencyResponse(JSON.stringify(oversize));
    expect(r.parse_error).toBeNull();
    expect(r.candidates).toHaveLength(5);
  });

  it('drops malformed candidate rows without crashing', () => {
    const txt = JSON.stringify({
      candidates: [
        { company_name: 'OK Co', rationale: 'fine' },
        { company_name: 'No rationale' },
        { rationale: 'no name' },
        null,
        { company_name: 'Missing rationale Co', rationale: '' },
        { company_name: 'Second OK', rationale: 'also fine' },
      ],
    });
    const r = parseAdjacencyResponse(txt);
    expect(r.parse_error).toBeNull();
    expect(r.candidates).toHaveLength(2);
    expect(r.candidates.map((c) => c.company_name)).toEqual(['OK Co', 'Second OK']);
  });

  it('truncates rationale to 240 chars', () => {
    const long = 'x'.repeat(400);
    const r = parseAdjacencyResponse(
      JSON.stringify({ candidates: [{ company_name: 'X', rationale: long }] }),
    );
    expect(r.candidates[0].rationale).toHaveLength(240);
  });

  it('surfaces a parse_error for malformed JSON', () => {
    const r = parseAdjacencyResponse('not json');
    expect(r.candidates).toHaveLength(0);
    expect(r.parse_error).toContain('json_parse');
  });

  it('surfaces a parse_error when candidates is missing', () => {
    const r = parseAdjacencyResponse(JSON.stringify({ other: 1 }));
    expect(r.parse_error).toBe('candidates_not_array');
  });

  it('surfaces a parse_error for empty input', () => {
    const r = parseAdjacencyResponse('   ');
    expect(r.parse_error).toBe('empty_response');
  });
});

describe('lib/agents/adjacency — findAdjacent', () => {
  afterEach(() => {
    mockRun.mockReset();
  });

  it('builds a Sonar request with adjacency attribution and recency=30', async () => {
    mockRun.mockResolvedValueOnce({
      content: JSON.stringify({
        candidates: [
          { company_name: 'Servpro of West Houston', rationale: 'multi-branch restoration in TX', location: 'Houston, TX' },
        ],
      }),
      citations: [{ url: 'https://example.com', title: 'example.com' }],
      model: 'sonar',
      usage: { inputTokens: 200, outputTokens: 200, costUsd: 0.0009, latencyMs: 3000, cacheHit: false, cachedInputTokens: 0 },
    });

    const out = await findAdjacent({
      project_id: 'sam.gov:xyz',
      title: 'Federal facility maintenance',
      summary: 'Multi-year facility services contract.',
      geo_hint: 'Houston, TX',
      customer_names: ['Zedcor Security'],
      agentRunId: 7,
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const req = mockRun.mock.calls[0][0] as {
      model: string;
      surface: string;
      agentName: string;
      agentRunId: number;
      recencyDays: number;
      messages: { content: string }[];
    };
    expect(req.model).toBe(ADJACENCY_MODEL);
    expect(req.surface).toBe('cron');
    expect(req.agentName).toBe('adjacency-mapper');
    expect(req.agentRunId).toBe(7);
    expect(req.recencyDays).toBe(30);
    expect(req.messages[0].content).toContain('Houston, TX');
    expect(req.messages[0].content).toContain('Zedcor Security');

    expect(out.project_id).toBe('sam.gov:xyz');
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0].company_name).toBe('Servpro of West Houston');
    expect(out.citations).toHaveLength(1);
    expect(out.cost_usd).toBeCloseTo(0.0009);
  });

  it('returns an empty candidates array (not throw) when the model returns malformed JSON', async () => {
    mockRun.mockResolvedValueOnce({
      content: 'sorry, no candidates surfaced',
      citations: [],
      model: 'sonar',
      usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.0003, latencyMs: 1500, cacheHit: false, cachedInputTokens: 0 },
    });
    const out = await findAdjacent({ project_id: 'p', title: 't' });
    expect(out.candidates).toHaveLength(0);
    expect(out.raw_response).toContain('sorry');
  });

  it('rejects missing project_id', async () => {
    await expect(findAdjacent({ project_id: '', title: 't' })).rejects.toThrow('project_id');
  });
  it('rejects missing title', async () => {
    await expect(findAdjacent({ project_id: 'p', title: '' })).rejects.toThrow('title');
  });
});
