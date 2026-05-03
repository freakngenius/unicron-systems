import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  postArchitectDecompose,
  postArchitectTune,
  postArchitectDiscover,
} from './architectModesClient';

describe('architectModesClient (mock-mode)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_ARCHITECT_API_ENABLED', 'false');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('postArchitectDecompose returns the architecture fixture', async () => {
    const res = await postArchitectDecompose({ buyer_pain_prompt: 'test prompt over 10 chars' });
    expect(res.architecture.buyer).toMatch(/distributors of/);
    expect(res.architecture.data_sources_proposed.length).toBeGreaterThan(0);
    expect(res.status).toBe('completed');
  });

  it('postArchitectTune returns the tuning proposals fixture', async () => {
    const res = await postArchitectTune({ vertical_id: 'pathfinder-default' });
    expect(res.proposals.length).toBeGreaterThan(0);
    expect(res.proposals[0].type).toBe('tuning_suggestion');
  });

  it('postArchitectDiscover returns the source candidates fixture', async () => {
    const res = await postArchitectDiscover({ vertical_id: 'pathfinder-default' });
    expect(res.proposals.length).toBeGreaterThan(0);
    res.proposals.forEach((p) => expect(p.type).toBe('source_discovery'));
  });
});

describe('architectModesClient (real-mode)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_ARCHITECT_API_ENABLED', 'true');
    vi.stubEnv('VITE_ARCHITECT_API_URL', 'https://example.test');
    vi.stubEnv('VITE_ARCHITECT_API_TOKEN', 'tok-1');
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('postArchitectDecompose POSTs to /api/architect/decompose with bearer token', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          proposal_id: 'p',
          session_id: 's',
          architecture: {
            buyer: 'b',
            buying_signal: 'bs',
            data_sources_proposed: [],
            data_sources_rejected: [],
            layer_2_watchers: [],
            layer_3_agents: [],
            layer_4_agents: [],
            estimates: { daily_qualified_volume: 0, cost_per_lead_usd: 0, architecture_confidence: 'low' },
            open_questions: [],
          },
          reasoning: [],
          cost_usd: 0,
          duration_ms: 0,
          status: 'completed',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    await postArchitectDecompose({ buyer_pain_prompt: 'real call' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/api/architect/decompose');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok-1');
    expect(JSON.parse(init.body as string)).toEqual({ buyer_pain_prompt: 'real call' });
  });

  it('postArchitectTune POSTs to /api/architect/tune', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          session_id: 's',
          proposals: [],
          rejected: [],
          summary: '',
          cost_usd: 0,
          duration_ms: 0,
          status: 'completed',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    await postArchitectTune({ vertical_id: 'x' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.test/api/architect/tune');
  });

  it('postArchitectDiscover throws on non-2xx', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response('boom', { status: 500, headers: { 'content-type': 'text/plain' } }),
    );
    await expect(postArchitectDiscover({ vertical_id: 'x' })).rejects.toThrow(/architect api 500/);
  });
});
