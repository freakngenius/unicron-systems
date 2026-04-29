// __tests__/slack/bot.test.ts — Slack v0 signature verification.
// Mirrors the algorithm in lib/slack/bot.ts and asserts each rejection
// path: missing signature, missing/invalid timestamp, stale timestamp,
// signature mismatch, signature happy-path.

import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

// Stub @/lib/supabase before the module under test imports it — the real
// module reads process.env at init time and throws if NEXT_PUBLIC_SUPABASE_URL
// is missing. These are pure-function tests; we never touch the DB.
vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => ({}),
}));

import { signSlackV0, verifySlackSignature } from '@/lib/slack/bot';

const SECRET = 'test-signing-secret';
const NOW_SEC = () => Math.floor(Date.now() / 1000).toString();

describe('signSlackV0', () => {
  it('matches the published Slack v0 algorithm', () => {
    const ts = '1531420618';
    const body =
      'token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow';
    const sig = signSlackV0(ts, body, '8f742231b10e8888abcd99yyyzzz85a5');
    // Cross-check by recomputing inline so the test doesn't depend on a magic string.
    const expected =
      'v0=' +
      crypto
        .createHmac('sha256', '8f742231b10e8888abcd99yyyzzz85a5')
        .update(`v0:${ts}:${body}`, 'utf8')
        .digest('hex');
    expect(sig).toBe(expected);
  });
});

describe('verifySlackSignature', () => {
  it('accepts a valid signature with a fresh timestamp', () => {
    const ts = NOW_SEC();
    const body = 'payload=%7B%22type%22%3A%22block_actions%22%7D';
    const sig = signSlackV0(ts, body, SECRET);
    expect(verifySlackSignature({ signature: sig, timestamp: ts, body, secret: SECRET })).toEqual({
      ok: true,
      reason: 'ok',
    });
  });

  it('rejects when the signature header is missing', () => {
    expect(
      verifySlackSignature({ signature: null, timestamp: NOW_SEC(), body: '', secret: SECRET }),
    ).toEqual({ ok: false, reason: 'missing_signature' });
  });

  it('rejects when the timestamp is missing or non-numeric', () => {
    expect(
      verifySlackSignature({ signature: 'v0=abc', timestamp: null, body: '', secret: SECRET }),
    ).toEqual({ ok: false, reason: 'missing_timestamp' });
    expect(
      verifySlackSignature({ signature: 'v0=abc', timestamp: 'not-a-number', body: '', secret: SECRET }),
    ).toEqual({ ok: false, reason: 'missing_timestamp' });
  });

  it('rejects timestamps older than 5 minutes (replay protection)', () => {
    const stale = (Math.floor(Date.now() / 1000) - 6 * 60).toString();
    const body = 'x=y';
    const sig = signSlackV0(stale, body, SECRET);
    expect(verifySlackSignature({ signature: sig, timestamp: stale, body, secret: SECRET })).toEqual({
      ok: false,
      reason: 'stale_timestamp',
    });
  });

  it('rejects a tampered body', () => {
    const ts = NOW_SEC();
    const body = 'a=1';
    const sig = signSlackV0(ts, body, SECRET);
    expect(
      verifySlackSignature({ signature: sig, timestamp: ts, body: 'a=2', secret: SECRET }),
    ).toEqual({ ok: false, reason: 'signature_mismatch' });
  });

  it('rejects when the wrong secret was used to sign', () => {
    const ts = NOW_SEC();
    const body = 'a=1';
    const sig = signSlackV0(ts, body, 'wrong-secret');
    expect(verifySlackSignature({ signature: sig, timestamp: ts, body, secret: SECRET })).toEqual({
      ok: false,
      reason: 'signature_mismatch',
    });
  });
});
