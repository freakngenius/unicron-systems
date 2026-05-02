// tests/connectors/slack-signature.test.ts — connector-framework signature
// verifier. Wraps lib/slack/bot.ts's verifier with a default-deny when
// SLACK_SIGNING_SECRET is missing.

import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => ({}),
}));

import { verifySlackRequest } from '@/lib/connectors/slack/signature';

const SECRET = 'test-signing-secret-c1b';
const NOW_SEC = () => Math.floor(Date.now() / 1000).toString();

function sign(timestamp: string, body: string, secret: string = SECRET): string {
  const base = `v0:${timestamp}:${body}`;
  const mac = crypto.createHmac('sha256', secret).update(base, 'utf8').digest('hex');
  return `v0=${mac}`;
}

describe('verifySlackRequest', () => {
  beforeEach(() => {
    process.env.SLACK_SIGNING_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.SLACK_SIGNING_SECRET;
  });

  it('accepts a fresh, correctly-signed request', () => {
    const body = 'token=abc&team_id=T1';
    const ts = NOW_SEC();
    const out = verifySlackRequest({ signature: sign(ts, body), timestamp: ts, body });
    expect(out).toEqual({ ok: true, reason: 'ok' });
  });

  it('rejects a missing signature', () => {
    const body = 'foo=bar';
    const ts = NOW_SEC();
    const out = verifySlackRequest({ signature: null, timestamp: ts, body });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('missing_signature');
  });

  it('rejects a missing timestamp', () => {
    const body = 'foo=bar';
    const out = verifySlackRequest({ signature: 'v0=deadbeef', timestamp: null, body });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('missing_timestamp');
  });

  it('rejects a stale timestamp (>5min old)', () => {
    const body = 'foo=bar';
    const ts = String(Math.floor(Date.now() / 1000) - 6 * 60); // 6 min ago
    const out = verifySlackRequest({ signature: sign(ts, body), timestamp: ts, body });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('stale_timestamp');
  });

  it('rejects a tampered body (signature mismatch)', () => {
    const body = 'foo=bar';
    const ts = NOW_SEC();
    const sig = sign(ts, body);
    const out = verifySlackRequest({ signature: sig, timestamp: ts, body: 'foo=baz' });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('signature_mismatch');
  });

  it('rejects a signature signed with a different secret', () => {
    const body = 'foo=bar';
    const ts = NOW_SEC();
    const sig = sign(ts, body, 'wrong-secret');
    const out = verifySlackRequest({ signature: sig, timestamp: ts, body });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('signature_mismatch');
  });

  it('fails closed when SLACK_SIGNING_SECRET is unset', () => {
    delete process.env.SLACK_SIGNING_SECRET;
    const body = 'foo=bar';
    const ts = NOW_SEC();
    const out = verifySlackRequest({ signature: sign(ts, body), timestamp: ts, body });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('missing_signature');
  });
});
