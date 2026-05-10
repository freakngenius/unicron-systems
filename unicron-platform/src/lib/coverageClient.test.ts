import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCoverageGoal,
  listCoverageGoals,
  runCoverageGoal,
} from './coverageClient';

describe('coverageClient', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_COVERAGE_API_URL', 'https://example.test');
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('createCoverageGoal POSTs to /api/coverage/goals with JSON body', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ goal_id: 'g-real', status: 'estimating' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await createCoverageGoal({ goal_text: 'real call' });
    expect(result).toEqual({ goal_id: 'g-real', status: 'estimating' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/api/coverage/goals');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ goal_text: 'real call' });
  });

  it('throws a descriptive error when the api returns non-2xx', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response('boom', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      }),
    );
    await expect(createCoverageGoal({ goal_text: 'x' })).rejects.toThrow(
      /coverage api 500/,
    );
  });

  it('listCoverageGoals appends filter query params', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await listCoverageGoals({ status: 'running', limit: 5 });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/coverage/goals?');
    expect(url).toContain('status=running');
    expect(url).toContain('limit=5');
  });

  it('runCoverageGoal POSTs to the run endpoint for the given id', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, run_event_id: 'evt-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await runCoverageGoal('abc def');
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/api/coverage/goals/abc%20def/run');
    expect(init.method).toBe('POST');
  });
});
