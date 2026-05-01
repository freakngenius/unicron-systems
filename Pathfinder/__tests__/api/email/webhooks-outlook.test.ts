// __tests__/api/email/webhooks-outlook.test.ts — Stream B Gate B3.
//
// Microsoft Graph webhook route: validation handshake + change-notification
// dispatch with mocked Graph fetch.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockHandleInboundReply = vi.fn();
const mockGetActiveIntegration = vi.fn();
const originalFetch = global.fetch;

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => ({}),
}));

vi.mock('@/lib/email/threads', () => ({
  handleInboundReply: (...args: unknown[]) => mockHandleInboundReply(...args),
}));

vi.mock('@/lib/email/integrations', () => ({
  getActiveIntegration: (...args: unknown[]) => mockGetActiveIntegration(...args),
}));

import { GET, POST } from '@/app/api/email/webhooks/outlook/route';

describe('GET /api/email/webhooks/outlook (validation)', () => {
  it('returns the validationToken verbatim', async () => {
    const req = new Request(
      'http://localhost/pathfinder/api/email/webhooks/outlook?validationToken=abc-123',
    );
    const res = await GET(req as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const text = await res.text();
    expect(text).toBe('abc-123');
  });

  it('400s when no validation token', async () => {
    const req = new Request('http://localhost/pathfinder/api/email/webhooks/outlook');
    const res = await GET(req as never);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/email/webhooks/outlook (notifications)', () => {
  beforeEach(() => {
    mockHandleInboundReply.mockReset();
    mockGetActiveIntegration.mockReset();
    process.env.EMAIL_GRAPH_CLIENT_STATE = 'expected-state';
    process.env.EMAIL_WEBHOOK_DEFAULT_OPERATOR = 'rep@zedcor.com';
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/me/messages/')) {
        return new Response(
          JSON.stringify({
            conversationId: 'conv-1',
            from: { emailAddress: { address: 'joe@vendor.com' } },
            bodyPreview: 'Yes please',
            receivedDateTime: '2026-05-01T01:00:00Z',
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch ${u}`);
    }) as unknown as typeof fetch;
    mockGetActiveIntegration.mockResolvedValue({
      access_token: 'tok',
      account_email: 'rep@zedcor.com',
    });
  });

  afterEach(() => {
    delete process.env.EMAIL_GRAPH_CLIENT_STATE;
    delete process.env.EMAIL_WEBHOOK_DEFAULT_OPERATOR;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns validation token on POST when present', async () => {
    const req = new Request(
      'http://localhost/pathfinder/api/email/webhooks/outlook?validationToken=token-x',
      { method: 'POST', body: JSON.stringify({}) },
    );
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('token-x');
  });

  it('rejects mismatched clientState', async () => {
    mockHandleInboundReply.mockResolvedValueOnce({ matched: true });
    const body = {
      value: [
        {
          subscriptionId: 'sub-1',
          clientState: 'wrong',
          resourceData: { id: 'msg-1' },
          changeType: 'created',
        },
      ],
    };
    const req = new Request('http://localhost/pathfinder/api/email/webhooks/outlook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { results: { reason?: string }[] };
    expect(json.results[0].reason).toBe('invalid_client_state');
    expect(mockHandleInboundReply).not.toHaveBeenCalled();
  });

  it('forwards a created notification to handleInboundReply', async () => {
    mockHandleInboundReply.mockResolvedValueOnce({ matched: true });
    const body = {
      value: [
        {
          subscriptionId: 'sub-1',
          clientState: 'expected-state',
          resourceData: { id: 'msg-2' },
          changeType: 'created',
        },
      ],
    };
    const req = new Request('http://localhost/pathfinder/api/email/webhooks/outlook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(mockHandleInboundReply).toHaveBeenCalledTimes(1);
    expect(mockHandleInboundReply.mock.calls[0][0]).toMatchObject({
      provider: 'outlook',
      providerThreadId: 'conv-1',
      providerMessageId: 'msg-2',
      fromEmail: 'joe@vendor.com',
    });
  });

  it('skips ignored change types', async () => {
    const body = {
      value: [
        {
          subscriptionId: 'sub-1',
          clientState: 'expected-state',
          resourceData: { id: 'msg-3' },
          changeType: 'deleted',
        },
      ],
    };
    const req = new Request('http://localhost/pathfinder/api/email/webhooks/outlook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { results: { reason?: string }[] };
    expect(json.results[0].reason).toBe('ignored_change_type');
    expect(mockHandleInboundReply).not.toHaveBeenCalled();
  });
});
