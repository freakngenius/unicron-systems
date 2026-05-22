// Contract-level tests for the C↔D boundary (real-only).
//
// Stream D shipped on 2026-05-01 (PR #37). The boundary is:
//   - POST /api/architect/decompose with body `{ buyer_pain_prompt, ... }`
//     returning Stream D's canonical DecompositionApiResponse, adapted
//     client-side to the legacy UI shape.
//   - listProposals reads `pathfinder.architect_proposals` directly via
//     the supabase client (Stream D ships no HTTP listProposals).
//   - approveProposal / dismissProposal write `architect_proposals.status`
//     via supabase update (Stream D ships no HTTP approve endpoint).
//
// Mock-mode tests were removed when the env-flag-gated mock fallback was
// stripped from architectClient.ts.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  postDecomposition,
  listProposals,
  approveProposal,
  dismissProposal,
} from './architectClient';
import { __resetEnvForTests } from './env';
import { __resetSupabaseForTests } from './supabase';
import type {
  ArchitectProposalRow,
  DecompositionApiResponse,
} from './contracts/architect';

const ORIGINAL_FETCH = global.fetch;

// Vi-mock the supabase module so listProposals + writeProposalStatus go
// through a controllable stub. The factory must be hoisted, so the
// internal store is mutated via the spy refs below.
const supabaseUpdate = vi.fn();
const supabaseSelect = vi.fn();

vi.mock('./supabase', () => {
  const fakeClient = {
    schema: () => fakeClient,
    from: () => fakeClient,
    select: (cols: string) => {
      supabaseSelect(cols);
      return {
        eq: () => ({
          order: () => ({
            limit: async () => supabaseSelect.mock.results[supabaseSelect.mock.calls.length - 1]?.value ?? { data: [], error: null },
          }),
        }),
      };
    },
    update: (patch: Record<string, unknown>) => {
      supabaseUpdate(patch);
      return {
        eq: async () =>
          supabaseUpdate.mock.results[supabaseUpdate.mock.calls.length - 1]?.value ??
          { error: null },
      };
    },
  };
  return {
    getSupabase: () => fakeClient,
    __resetSupabaseForTests: () => {
      supabaseUpdate.mockReset();
      supabaseSelect.mockReset();
    },
  };
});

beforeEach(() => {
  __resetEnvForTests();
  __resetSupabaseForTests();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
  vi.stubEnv('VITE_ARCHITECT_API_URL', 'https://architect.example/');
  vi.stubEnv('VITE_ARCHITECT_API_TOKEN', 'token-abc');
  vi.stubEnv('VITE_OPERATOR_EMAIL', 'kyle@example.com');
});

afterEach(() => {
  vi.unstubAllEnvs();
  global.fetch = ORIGINAL_FETCH;
});

describe('Architect client — real mode', () => {

  it('postDecomposition POSTs to the same-origin proxy with the canonical body and adapts the response', async () => {
    const apiResponse: DecompositionApiResponse = {
      proposal_id: 'prop-1',
      session_id: 'sess-real',
      architecture: {
        buyer: 'security-services',
        buying_signal: 'new construction site',
        data_sources_proposed: [
          {
            type: 'harris-county-permits',
            jurisdictions: ['TX-Harris'],
            expected_daily_volume: 80,
          },
        ],
        data_sources_rejected: [],
        layer_2_watchers: [
          { source_type: 'harris-county-permits', instruction: 'poll daily' },
        ],
        layer_3_agents: [{ role: 'qualifier', instruction: 'score for security need' }],
        layer_4_agents: [{ role: 'ranker', instruction: 'rank by value+distance' }],
        estimates: {
          daily_qualified_volume: 12,
          cost_per_lead_usd: 0.04,
          architecture_confidence: 'high',
        },
        open_questions: [],
      },
      reasoning: ['searching sources', 'finalizing'],
      cost_usd: 0.43,
      duration_ms: 14_200,
      status: 'completed',
    };

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(apiResponse),
      json: async () => apiResponse,
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await postDecomposition({ buyerPain: 'real pain' });

    // URL + method + body are the canonical Stream D shape.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const [url, init] = call;
    // Wave 3 Phase B: client hits the same-origin proxy; the proxy injects
    // the bearer server-side, so the browser request must NOT carry
    // Authorization itself.
    expect(url).toBe('/api/architect/decompose-proxy');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ buyer_pain_prompt: 'real pain' });

    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();

    // Response adapted to legacy UI shape.
    expect(res.sessionId).toBe('sess-real');
    expect(res.costUsd).toBe(0.43);
    expect(res.confidence).toBe(0.85);
    expect(res.lines.some((l) => l.text.startsWith('BUYER'))).toBe(true);
    expect(res.recommendedConfig.status).toBe('configured');
  });

  it('postDecomposition forwards `constraints` when provided (conversational architect)', async () => {
    // Minimal valid response so the call resolves; we only assert the request body.
    const apiResponse: DecompositionApiResponse = {
      proposal_id: 'prop-2',
      session_id: 'sess-2',
      architecture: {
        buyer: 'b',
        buying_signal: 's',
        data_sources_proposed: [],
        data_sources_rejected: [],
        layer_2_watchers: [],
        layer_3_agents: [],
        layer_4_agents: [],
        estimates: {
          daily_qualified_volume: 1,
          cost_per_lead_usd: 0.01,
          architecture_confidence: 'medium',
        },
        open_questions: [],
      },
      reasoning: [],
      cost_usd: 0.01,
      duration_ms: 100,
      status: 'completed',
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(apiResponse),
      json: async () => apiResponse,
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await postDecomposition({
      buyerPain: 'pain',
      constraints: ['drop Florida', 'raise ranker threshold to 75'],
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      buyer_pain_prompt: 'pain',
      constraints: ['drop Florida', 'raise ranker threshold to 75'],
    });
  });

  it('postDecomposition omits `constraints` when empty (preserves first-turn body)', async () => {
    const apiResponse: DecompositionApiResponse = {
      proposal_id: 'prop-3',
      session_id: 'sess-3',
      architecture: {
        buyer: 'b',
        buying_signal: 's',
        data_sources_proposed: [],
        data_sources_rejected: [],
        layer_2_watchers: [],
        layer_3_agents: [],
        layer_4_agents: [],
        estimates: {
          daily_qualified_volume: 1,
          cost_per_lead_usd: 0.01,
          architecture_confidence: 'medium',
        },
        open_questions: [],
      },
      reasoning: [],
      cost_usd: 0.01,
      duration_ms: 100,
      status: 'completed',
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(apiResponse),
      json: async () => apiResponse,
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await postDecomposition({ buyerPain: 'pain', constraints: [] });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ buyer_pain_prompt: 'pain' });
    expect('constraints' in body).toBe(false);
  });

  it('listProposals reads architect_proposals via supabase and adapts rows', async () => {
    const row: ArchitectProposalRow = {
      id: 'p-real-1',
      session_id: 'sess-1',
      vertical_id: 'pathfinder-default',
      type: 'source_discovery',
      headline: 'Add Travis County',
      body: 'something',
      details: {
        candidate_jurisdiction: 'TX-Travis',
        source_type: 'austin-tx-permits',
        source_url: 'https://data.austintexas.gov',
        source_name: 'Austin permits',
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
      created_at: new Date().toISOString(),
    };
    supabaseSelect.mockReturnValue({ data: [row], error: null });

    const res = await listProposals();
    expect(res.proposals).toHaveLength(1);
    expect(res.proposals[0].category).toBe('sources');
    expect(res.proposals[0].headline).toBe('Add Travis County');
    expect(res.proposals[0].details.find((d) => d.k === 'reference rate')?.v).toBe('23%');
  });

  it('listProposals surfaces supabase errors', async () => {
    supabaseSelect.mockReturnValue({ data: null, error: { message: 'rls denied' } });
    await expect(listProposals()).rejects.toThrow(/rls denied/);
  });

  it('approveProposal writes status="approved" via supabase with operator email', async () => {
    supabaseUpdate.mockReturnValue({ error: null });
    await approveProposal('p-real-1');
    expect(supabaseUpdate).toHaveBeenCalledTimes(1);
    const patch = supabaseUpdate.mock.calls[0][0];
    expect(patch.status).toBe('approved');
    expect(patch.resolved_by_user_email).toBe('kyle@example.com');
    expect(typeof patch.resolved_at).toBe('string');
  });

  it('dismissProposal writes status="dismissed" via supabase and forwards reason', async () => {
    supabaseUpdate.mockReturnValue({ error: null });
    await dismissProposal('p-real-1', 'not relevant to security vertical');
    const patch = supabaseUpdate.mock.calls[0][0];
    expect(patch.status).toBe('dismissed');
    expect(patch.resolution_notes).toBe('not relevant to security vertical');
  });

  it('approveProposal surfaces RLS rejection with an actionable message', async () => {
    supabaseUpdate.mockReturnValue({
      error: { message: 'new row violates row-level security policy' },
    });
    await expect(approveProposal('p-x')).rejects.toThrow(/RLS|row-level security/);
  });
});
