// __tests__/email/send.test.ts — Stream B Gate B2.
//
// Provider adapter tests: buildMime + sendEmail (Gmail and Outlook paths)
// with mocked fetch.

import { describe, expect, it, vi } from 'vitest';

import { buildMime, sendEmail } from '@/lib/email/send';

describe('buildMime', () => {
  it('encodes subject as base64 UTF-8', () => {
    const mime = buildMime({
      from: 'rep@zedcor.com',
      to: 'joe@vendor.com',
      subject: 'Hello — emoji 🎉',
      body: 'Body line 1\nBody line 2',
    });
    expect(mime).toContain('From: rep@zedcor.com');
    expect(mime).toContain('To: joe@vendor.com');
    expect(mime).toContain('Subject: =?UTF-8?B?');
    expect(mime).toContain('MIME-Version: 1.0');
    expect(mime).toContain('Body line 1');
  });

  it('uses CRLF line endings (RFC 5322)', () => {
    const mime = buildMime({
      from: 'a@b.com',
      to: 'c@d.com',
      subject: 's',
      body: 'b',
    });
    expect(mime.includes('\r\n')).toBe(true);
  });
});

describe('sendEmail — gmail', () => {
  it('posts a base64url-encoded MIME message and returns IDs', async () => {
    let captured: { url: string; body: string } | null = null;
    const fakeFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = typeof url === 'string' ? url : url.toString();
      captured = { url: u, body: String(init?.body ?? '') };
      return new Response(JSON.stringify({ id: 'msg-1', threadId: 'thread-1' }), {
        status: 200,
      });
    });

    const result = await sendEmail({
      provider: 'gmail',
      accessToken: 'tok',
      fromEmail: 'rep@zedcor.com',
      toEmail: 'joe@vendor.com',
      subject: 'Subject',
      body: 'Hello.',
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    expect(result.provider_message_id).toBe('msg-1');
    expect(result.provider_thread_id).toBe('thread-1');
    expect(captured!.url).toContain('gmail.googleapis.com/gmail/v1/users/me/messages/send');
    const parsed = JSON.parse(captured!.body) as { raw: string };
    expect(parsed.raw).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
  });

  it('throws on non-2xx response', async () => {
    const fakeFetch = vi.fn(
      async () => new Response('quota exceeded', { status: 403 }),
    );
    await expect(
      sendEmail({
        provider: 'gmail',
        accessToken: 't',
        fromEmail: 'a@b.com',
        toEmail: 'c@d.com',
        subject: 's',
        body: 'b',
        fetchImpl: fakeFetch as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/gmail_send_failed.*403/);
  });
});

describe('sendEmail — outlook', () => {
  it('posts to /me/sendMail and looks up the message ID afterward', async () => {
    let sendCallCount = 0;
    const fakeFetch = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.endsWith('/me/sendMail')) {
        sendCallCount += 1;
        return new Response(null, { status: 202 });
      }
      if (u.includes('SentItems')) {
        return new Response(
          JSON.stringify({
            value: [
              { id: 'graph-msg-1', conversationId: 'conv-1', subject: 'Test subject' },
            ],
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch ${u}`);
    });

    const result = await sendEmail({
      provider: 'outlook',
      accessToken: 'tok',
      fromEmail: 'rep@zedcor.com',
      toEmail: 'joe@vendor.com',
      subject: 'Test subject',
      body: 'Hello.',
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    expect(sendCallCount).toBe(1);
    expect(result.provider_message_id).toBe('graph-msg-1');
    expect(result.provider_thread_id).toBe('conv-1');
  });

  it('returns null IDs when post-lookup fails (best-effort)', async () => {
    const fakeFetch = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.endsWith('/me/sendMail')) {
        return new Response(null, { status: 202 });
      }
      return new Response(null, { status: 500 });
    });

    const result = await sendEmail({
      provider: 'outlook',
      accessToken: 'tok',
      fromEmail: 'rep@zedcor.com',
      toEmail: 'joe@vendor.com',
      subject: 'x',
      body: 'y',
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    expect(result.provider_message_id).toBeNull();
    expect(result.provider_thread_id).toBeNull();
  });

  it('throws when /me/sendMail returns non-202', async () => {
    const fakeFetch = vi.fn(
      async () => new Response('forbidden', { status: 403 }),
    );
    await expect(
      sendEmail({
        provider: 'outlook',
        accessToken: 't',
        fromEmail: 'a@b.com',
        toEmail: 'c@d.com',
        subject: 's',
        body: 'b',
        fetchImpl: fakeFetch as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/outlook_send_failed.*403/);
  });
});
