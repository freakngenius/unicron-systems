// __tests__/api/deals/stage.test.ts — Stream B Gate B1.
//
// Tests for POST /api/deals/[id]/stage. Mocks lib/deals so the route
// handler is exercised without touching Supabase.

import { afterEach, describe, expect, it, vi } from 'vitest';

const mockMoveDealStage = vi.fn();

// lib/supabase eagerly throws if env is unset at module load. The route
// handler imports lib/deals which imports lib/supabase, so we stub it.
vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => ({}),
}));

vi.mock('@/lib/deals', async () => {
  const actual = await vi.importActual<typeof import('@/lib/deals')>('@/lib/deals');
  return {
    ...actual,
    moveDealStage: (...args: unknown[]) => mockMoveDealStage(...args),
  };
});

import { POST } from '@/app/api/deals/[id]/stage/route';

function makeReq(body: unknown): Request {
  return new Request('http://localhost/pathfinder/api/deals/d-1/stage', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/deals/[id]/stage', () => {
  afterEach(() => {
    mockMoveDealStage.mockReset();
  });

  it('rejects invalid_to_stage', async () => {
    const res = await POST(makeReq({ to_stage: 'banana' }) as never, {
      params: { id: 'd-1' },
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_to_stage');
    expect(mockMoveDealStage).not.toHaveBeenCalled();
  });

  it('rejects invalid_json', async () => {
    const req = new Request('http://localhost/pathfinder/api/deals/d-1/stage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    });
    const res = await POST(req as never, { params: { id: 'd-1' } });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_json');
  });

  it('forwards a valid stage transition to moveDealStage', async () => {
    mockMoveDealStage.mockResolvedValueOnce({
      deal: { id: 'd-1', pipeline_stage: 'CONTACTED' },
      activity: { id: 'a-1', activity_type: 'stage_change' },
      noop: false,
    });
    const res = await POST(
      makeReq({ to_stage: 'CONTACTED', actor_email: 'rep@zedcor.com' }) as never,
      { params: { id: 'd-1' } },
    );
    expect(res.status).toBe(200);
    expect(mockMoveDealStage).toHaveBeenCalledTimes(1);
    expect(mockMoveDealStage.mock.calls[0][0]).toMatchObject({
      dealId: 'd-1',
      toStage: 'CONTACTED',
      actorEmail: 'rep@zedcor.com',
    });
    const json = (await res.json()) as { deal: { pipeline_stage: string }; noop: boolean };
    expect(json.deal.pipeline_stage).toBe('CONTACTED');
    expect(json.noop).toBe(false);
  });

  it('maps deal_not_found from underlying error', async () => {
    mockMoveDealStage.mockRejectedValueOnce(new Error('deal nope not found'));
    const res = await POST(makeReq({ to_stage: 'CONTACTED' }) as never, {
      params: { id: 'missing' },
    });
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('deal_not_found');
  });

  it('returns 500 on unknown failure', async () => {
    mockMoveDealStage.mockRejectedValueOnce(new Error('connection reset'));
    const res = await POST(makeReq({ to_stage: 'CONTACTED' }) as never, {
      params: { id: 'd-1' },
    });
    expect(res.status).toBe(500);
  });
});
