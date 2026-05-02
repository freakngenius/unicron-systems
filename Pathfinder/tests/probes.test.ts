import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __test__ as cacheTest, getCached, setCached, clearCached } from '@/lib/probe-cache';
import { probeResend, probeSlackWebhook } from '@/lib/probes';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  clearCached();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('probe-cache', () => {
  it('returns null for missing keys', () => {
    expect(getCached('absent')).toBeNull();
  });

  it('round-trips a value within TTL', () => {
    setCached('foo', { hello: 'world' });
    expect(getCached('foo')).toEqual({ hello: 'world' });
  });

  it('expires entries after the TTL', () => {
    setCached('foo', 1, 1);
    cacheTest.store.set('foo', { value: 1, expiresAt: Date.now() - 10 });
    expect(getCached('foo')).toBeNull();
  });

  it('clear() empties the store; clear(key) removes one', () => {
    setCached('a', 1);
    setCached('b', 2);
    clearCached('a');
    expect(getCached('a')).toBeNull();
    expect(getCached('b')).toBe(2);
    clearCached();
    expect(getCached('b')).toBeNull();
  });
});

describe('probeSlackWebhook', () => {
  it('returns "unknown" when SLACK_WEBHOOK_URL is missing', async () => {
    const r = await probeSlackWebhook('');
    expect(r.status).toBe('unknown');
  });

  it('returns "failed" when the URL is not parseable', async () => {
    const r = await probeSlackWebhook('not a url');
    expect(r.status).toBe('failed');
  });

  it('returns "failed" when the host is not hooks.slack.com', async () => {
    const r = await probeSlackWebhook('https://example.com/weird');
    expect(r.status).toBe('failed');
    expect(r.detail).toContain('example.com');
  });

  it('treats Slack "no_text" as ok (webhook registered)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('no_text', { status: 400 }),
    ) as unknown as typeof fetch;
    const r = await probeSlackWebhook('https://hooks.slack.com/services/T/B/X');
    expect(r.status).toBe('ok');
    expect(r.detail).toContain('no_text');
  });

  it('treats "invalid_payload" as ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('invalid_payload', { status: 400 }),
    ) as unknown as typeof fetch;
    const r = await probeSlackWebhook('https://hooks.slack.com/services/T/B/X');
    expect(r.status).toBe('ok');
  });

  it('treats "no_service" as failed (revoked)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('no_service', { status: 404 }),
    ) as unknown as typeof fetch;
    const r = await probeSlackWebhook('https://hooks.slack.com/services/T/B/X');
    expect(r.status).toBe('failed');
    expect(r.detail).toContain('revoked');
  });

  it('treats network errors as failed', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      new Error('boom'),
    ) as unknown as typeof fetch;
    const r = await probeSlackWebhook('https://hooks.slack.com/services/T/B/X');
    expect(r.status).toBe('failed');
    expect(r.detail).toContain('boom');
  });
});

describe('probeResend', () => {
  it('returns "unknown" when RESEND_API_KEY is missing', async () => {
    const r = await probeResend('');
    expect(r.status).toBe('unknown');
  });

  it('returns "failed" on 401', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('{"name":"invalid_api_Key"}', { status: 401 }),
    ) as unknown as typeof fetch;
    const r = await probeResend('re_bogus');
    expect(r.status).toBe('failed');
    expect(r.detail).toContain('401');
  });

  it('returns "ok" with domain count on 200 with non-empty list', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'd1', name: 'unicron.systems' }] }), { status: 200 }),
    ) as unknown as typeof fetch;
    const r = await probeResend('re_real');
    expect(r.status).toBe('ok');
    expect(r.detail).toContain('1 domain');
  });

  it('returns "degraded" when API key is valid but domains list is empty', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    ) as unknown as typeof fetch;
    const r = await probeResend('re_real');
    expect(r.status).toBe('degraded');
  });

  it('returns "failed" on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      new Error('econnrefused'),
    ) as unknown as typeof fetch;
    const r = await probeResend('re_real');
    expect(r.status).toBe('failed');
  });
});
