// tests/connectors/oauth-state.test.ts — signed OAuth state tokens.
//
// Covers SPEC § 5.3 acceptance:
//   - signed (any tampering rejects)
//   - has expiry (expired tokens rejected)
//   - has nonce (replay rejected on second use)
//   - type-scoped (callback for X rejects state issued for Y)

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __resetNonceStoreForTests,
  issueState,
  validateState,
} from '../../lib/connectors/oauth-state';

describe('oauth-state', () => {
  const originalSecret = process.env.CONNECTOR_OAUTH_STATE_SECRET;

  beforeEach(() => {
    process.env.CONNECTOR_OAUTH_STATE_SECRET = 'test-secret-32-bytes-of-entropy-ok!';
    __resetNonceStoreForTests();
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CONNECTOR_OAUTH_STATE_SECRET;
    else process.env.CONNECTOR_OAUTH_STATE_SECRET = originalSecret;
  });

  it('issues a token that round-trips through validate', () => {
    const token = issueState({ org_id: 'zedcor', connector_type: 'slack' });
    const result = validateState(token, { expectedType: 'slack' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.org_id).toBe('zedcor');
      expect(result.payload.connector_type).toBe('slack');
      expect(typeof result.payload.nonce).toBe('string');
      expect(result.payload.nonce.length).toBeGreaterThan(0);
    }
  });

  it('rejects a tampered token (bad signature)', () => {
    const token = issueState({ org_id: 'zedcor', connector_type: 'slack' });
    // Flip the last char of the body segment.
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}X.${parts[2]}`;
    const result = validateState(tampered, { expectedType: 'slack' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad_signature');
  });

  it('rejects an expired token', () => {
    const t0 = Date.now();
    const token = issueState({
      org_id: 'zedcor',
      connector_type: 'slack',
      now: t0,
      ttlMs: 1000,
    });
    const result = validateState(token, { expectedType: 'slack', now: t0 + 5000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('expired');
  });

  it('rejects a replay (same nonce twice)', () => {
    const token = issueState({ org_id: 'zedcor', connector_type: 'slack' });
    const first = validateState(token, { expectedType: 'slack' });
    expect(first.ok).toBe(true);
    const second = validateState(token, { expectedType: 'slack' });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('replayed');
  });

  it('rejects a token whose connector_type does not match the route', () => {
    const token = issueState({ org_id: 'zedcor', connector_type: 'slack' });
    const result = validateState(token, { expectedType: 'teams' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('type_mismatch');
  });

  it('rejects a malformed token (wrong segment count)', () => {
    const result = validateState('only.two', { expectedType: 'slack' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('rejects a malformed body (signed but unparseable JSON)', () => {
    // Sign garbage bytes with the right secret so the signature passes
    // but the payload JSON.parse fails.
    const crypto = require('node:crypto') as typeof import('node:crypto');
    const header = Buffer.from('{"alg":"HS256","typ":"X"}').toString('base64url');
    const body = Buffer.from('not-json').toString('base64url');
    const sig = crypto
      .createHmac('sha256', process.env.CONNECTOR_OAUTH_STATE_SECRET!)
      .update(`${header}.${body}`)
      .digest('base64url');
    const result = validateState(`${header}.${body}.${sig}`, { expectedType: 'slack' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('peek mode does not consume the nonce', () => {
    const token = issueState({ org_id: 'zedcor', connector_type: 'slack' });
    const peek = validateState(token, { expectedType: 'slack', peek: true });
    expect(peek.ok).toBe(true);
    const consume = validateState(token, { expectedType: 'slack' });
    expect(consume.ok).toBe(true);
    const replay = validateState(token, { expectedType: 'slack' });
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.reason).toBe('replayed');
  });
});
