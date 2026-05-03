// Contract-level tests for the C↔E boundary. Per Phase 2 Stream C
// STREAM-README Gate C3.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { analyze, deploy } from './sourceOnboarderClient';
import { __resetEnvForTests } from './env';

const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  __resetEnvForTests();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
  vi.stubEnv('VITE_SOURCE_ONBOARDER_ENABLED', 'false');
  vi.stubEnv('VITE_SOURCE_ONBOARDER_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  global.fetch = ORIGINAL_FETCH;
});

describe('Source Onboarder client — mock mode', () => {
  it('analyze returns a contract-shaped response with a Socrata adapter detected', async () => {
    const res = await analyze({ tab: 'url', input: 'https://data.cityofsacramento.org/...' });
    expect(res.analysisId).toBeTruthy();
    expect(res.detectedAdapter).toBe('socrata');
    expect(res.proposedSource.type).toBe('permits');
    expect(res.proposedWatcher.role).toBe('PermitWatcher');
    expect(res.proposedWatcher.layer).toBe(2);
    expect(res.fields.length).toBeGreaterThan(0);
  });

  it('deploy materializes the proposed source + watcher and reports first-event ms', async () => {
    const res = await deploy({ analysisId: 'mock-1' });
    expect(res.ok).toBe(true);
    expect(res.source.id).toBeTruthy();
    expect(res.watcher.role).toBe('PermitWatcher');
    expect(res.firstEventMs).toBeLessThan(90_000); // spec target
  });

  it('deploy applies overrides on top of the proposed source', async () => {
    const res = await deploy({
      analysisId: 'mock-1',
      overrides: { label: 'My Custom Label', weight: 0.5 },
    });
    expect(res.source.label).toBe('My Custom Label');
    expect(res.source.weight).toBe(0.5);
  });
});

describe('Source Onboarder client — real mode', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SOURCE_ONBOARDER_ENABLED', 'true');
    vi.stubEnv('VITE_SOURCE_ONBOARDER_URL', 'https://onboarder.example');
    __resetEnvForTests();
  });

  it('analyze POSTs to the same-origin onboard proxy with the request body', async () => {
    const expected = {
      analysisId: 'real-1',
      jurisdiction: 'NYC',
      sourceType: 'permits',
      detectedAdapter: 'socrata',
      estimatedDailyVolume: 500,
      estimatedQualifiedPerDay: 12,
      fields: [],
      proposedSource: {
        id: 'src-real',
        type: 'permits',
        label: 'NYC permits',
        pollFrequencyMs: 300_000,
        enabled: true,
        watcherRole: 'PermitWatcher',
        weight: 0.2,
      },
      proposedWatcher: {
        id: 'a-watcher-real',
        layer: 2,
        role: 'PermitWatcher',
        instruction: '',
        inputFrom: [],
        outputTo: ['a-qualifier'],
        dwellMs: 5000,
        passRate: 0.3,
        enabled: true,
      },
      confidence: 0.95,
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(expected),
      json: async () => expected,
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await analyze({
      tab: 'url',
      input: 'https://data.cityofnewyork.us/permits',
    });
    expect(res).toEqual(expected);
    // Wave 3 Phase B: legacy `/analyze` collapses into the production
    // onboard endpoint, routed via the same-origin proxy.
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/sources/onboard-proxy?sync=1',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"tab":"url"'),
      }),
    );
  });

  it('surfaces non-2xx responses as Error', async () => {
    global.fetch = (async () => ({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      text: async () => 'no socrata adapter for this URL',
      json: async () => ({}),
    })) as unknown as typeof fetch;

    await expect(analyze({ tab: 'url', input: 'bad' })).rejects.toThrow(/422/);
  });
});
