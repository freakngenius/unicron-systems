// tests/connectors/oauth-state-user-id.test.ts — Gate 10B.
//
// Confirms the additive user_id field on signed state tokens round-trips
// through validate. Backwards-compat for org-level Slack/Teams flows
// (which never set user_id) is verified in oauth-state.test.ts; this
// suite focuses on the new user-level path used by HubSpot per-user OAuth.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __resetNonceStoreForTests,
  issueState,
  validateState,
} from '../../lib/connectors/oauth-state';

describe('oauth-state user_id (Gate 10B)', () => {
  const originalSecret = process.env.CONNECTOR_OAUTH_STATE_SECRET;

  beforeEach(() => {
    process.env.CONNECTOR_OAUTH_STATE_SECRET = 'test-secret-32-bytes-of-entropy-ok!';
    __resetNonceStoreForTests();
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CONNECTOR_OAUTH_STATE_SECRET;
    else process.env.CONNECTOR_OAUTH_STATE_SECRET = originalSecret;
  });

  it('round-trips a user-level state token with user_id', () => {
    const token = issueState({
      org_id: 'zedcor',
      connector_type: 'hubspot',
      user_id: 'alice@zedcor.com',
    });
    const result = validateState(token, { expectedType: 'hubspot' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.user_id).toBe('alice@zedcor.com');
      expect(result.payload.org_id).toBe('zedcor');
      expect(result.payload.connector_type).toBe('hubspot');
    }
  });

  it('omits user_id from payload when not provided (backwards-compat for org-level flows)', () => {
    const token = issueState({ org_id: 'zedcor', connector_type: 'slack' });
    const result = validateState(token, { expectedType: 'slack' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.user_id).toBeUndefined();
  });

  it('rejects a token where the signature was forged on a substituted user_id', () => {
    // Issue with one user_id, then mutate the body to inject another.
    const token = issueState({
      org_id: 'zedcor',
      connector_type: 'hubspot',
      user_id: 'alice@zedcor.com',
    });
    const parts = token.split('.');
    // Decode body, swap user_id, re-encode but DON'T re-sign.
    const body = Buffer.from(
      parts[1].replace(/-/g, '+').replace(/_/g, '/') +
        '='.repeat((4 - (parts[1].length % 4)) % 4),
      'base64',
    ).toString('utf8');
    const tamperedJson = body.replace('alice@zedcor.com', 'attacker@evil.com');
    const tamperedBody = Buffer.from(tamperedJson)
      .toString('base64')
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const forged = `${parts[0]}.${tamperedBody}.${parts[2]}`;
    const result = validateState(forged, { expectedType: 'hubspot' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad_signature');
  });
});
