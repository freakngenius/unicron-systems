// Contract-level tests for the C↔D boundary. Per Phase 2 Stream C
// STREAM-README Gate C3: "contract-level tests for the C↔D boundary, using
// mocked API responses that match the published contracts in D's README."
//
// Stream D's published contract is shaped per `src/lib/contracts/architect.ts`.
// These tests pin both:
//   - Mock-mode behavior (the default until VITE_ARCHITECT_API_ENABLED=true)
//   - Real-mode behavior with `fetch` mocked at the global level

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  postDecomposition,
  listProposals,
  approveProposal,
  dismissProposal,
} from './architectClient';
import { __resetEnvForTests } from './env';

const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  __resetEnvForTests();
  // Default: feature flag off, mock mode.
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
  vi.stubEnv('VITE_ARCHITECT_API_ENABLED', 'false');
  vi.stubEnv('VITE_ARCHITECT_API_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  global.fetch = ORIGINAL_FETCH;
});

describe('Architect client — mock mode', () => {
  it('postDecomposition returns a non-empty lines array and a recommended config', async () => {
    const res = await postDecomposition({ buyerPain: 'sample pain' });
    expect(res.sessionId).toBeTruthy();
    expect(res.lines.length).toBeGreaterThan(0);
    expect(res.recommendedConfig.status).toBe('live');
    expect(res.recommendedConfig.agents.length).toBeGreaterThan(0);
    expect(res.confidence).toBeGreaterThan(0);
    expect(res.confidence).toBeLessThanOrEqual(1);
  });

  it('listProposals returns proposals shaped against the contract', async () => {
    const res = await listProposals();
    expect(Array.isArray(res.proposals)).toBe(true);
    expect(res.proposals.length).toBeGreaterThan(0);
    for (const p of res.proposals) {
      expect(typeof p.id).toBe('string');
      expect(['sources', 'agents', 'tuning']).toContain(p.category);
      expect(typeof p.headline).toBe('string');
      expect(Array.isArray(p.details)).toBe(true);
    }
  });

  it('approveProposal returns ok:true with a SystemConfig snapshot', async () => {
    const res = await approveProposal('p1');
    expect(res.ok).toBe(true);
    expect(res.systemConfig.status).toBe('live');
  });

  it('dismissProposal returns ok:true', async () => {
    const res = await dismissProposal('p1');
    expect(res.ok).toBe(true);
  });
});

describe('Architect client — real mode', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_ARCHITECT_API_ENABLED', 'true');
    vi.stubEnv('VITE_ARCHITECT_API_URL', 'https://architect.example/');
    __resetEnvForTests();
  });

  it('postDecomposition POSTs to /decomposition and returns the parsed body', async () => {
    const expected = {
      sessionId: 'real-1',
      lines: [{ index: 0, text: 'BUYER: …' }],
      recommendedConfig: {
        status: 'live',
        buyerPain: 'real pain',
        dataSources: [],
        agents: [
          {
            id: 'a-q',
            layer: 3,
            role: 'Qualifier',
            instruction: '',
            inputFrom: [],
            outputTo: [],
            dwellMs: 0,
            passRate: 1,
            enabled: true,
          },
        ],
      },
      confidence: 0.93,
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(expected),
      json: async () => expected,
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await postDecomposition({ buyerPain: 'real pain' });
    expect(res).toEqual(expected);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://architect.example/decomposition',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ buyerPain: 'real pain' }),
      }),
    );
  });

  it('approveProposal POSTs to /proposals/:id/approve', async () => {
    const expected = {
      ok: true,
      systemConfig: {
        status: 'live',
        buyerPain: '',
        dataSources: [],
        agents: [],
      },
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(expected),
      json: async () => expected,
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await approveProposal('p2 with spaces');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://architect.example/proposals/p2%20with%20spaces/approve',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('surfaces non-2xx responses as Error', async () => {
    global.fetch = (async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => 'pool exhausted',
      json: async () => ({}),
    })) as unknown as typeof fetch;

    await expect(listProposals()).rejects.toThrow(/503/);
  });
});
