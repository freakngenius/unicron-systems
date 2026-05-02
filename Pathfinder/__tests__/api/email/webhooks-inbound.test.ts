// __tests__/api/email/webhooks-inbound.test.ts — Stream B Gate B3.
//
// Generic normalized webhook (operator-bridge fallback). Auth gate +
// payload validation + handleInboundReply forwarding.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockHandleInboundReply = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => ({}),
}));

vi.mock('@/lib/email/threads', () => ({
  handleInboundReply: (...args: unknown[]) => mockHandleInboundReply(...args),
}));

import { POST } from '@/app/api/email/webhooks/inbound/route';

function makeReq(body: unknown, opts: { auth?: string } = {}): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.auth) headers['authorization'] = `Bearer ${opts.auth}`;
  return new Request('http://localhost/pathfinder/api/email/webhooks/inbound', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/email/webhooks/inbound', () => {
  beforeEach(() => {
    mockHandleInboundReply.mockReset();
    process.env.CRON_SECRET = 'shared-secret';
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.restoreAllMocks();
  });

  it('rejects missing auth with 401', async () => {
    const res = await POST(
      makeReq({ provider: 'gmail', thread_id: 't-1' }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('rejects invalid_payload with 400', async () => {
    const res = await POST(
      makeReq({ provider: 'gmail' }, { auth: 'shared-secret' }) as never,
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_payload');
  });

  it('forwards a valid payload to handleInboundReply', async () => {
    mockHandleInboundReply.mockResolvedValueOnce({
      matched: true,
      dealStageChanged: 'REPLIED',
      dealActivityRecorded: true,
    });
    const res = await POST(
      makeReq(
        {
          provider: 'gmail',
          thread_id: 'thread-1',
          message_id: 'msg-1',
          from_email: 'joe@vendor.com',
          snippet: 'Yes please',
        },
        { auth: 'shared-secret' },
      ) as never,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { matched: boolean; dealStageChanged: string };
    expect(json.matched).toBe(true);
    expect(json.dealStageChanged).toBe('REPLIED');
    expect(mockHandleInboundReply).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'gmail',
        providerThreadId: 'thread-1',
        providerMessageId: 'msg-1',
        fromEmail: 'joe@vendor.com',
        snippet: 'Yes please',
      }),
    );
  });
});
