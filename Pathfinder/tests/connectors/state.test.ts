// tests/connectors/state.test.ts — signed OAuth state token round-trip
// + rejection paths.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => ({}),
}));

import { buildState, verifyState } from '@/lib/connectors/state';

describe('connector state token', () => {
  beforeEach(() => {
    process.env.CONNECTOR_STATE_SECRET = 'test-state-secret';
  });
  afterEach(() => {
    delete process.env.CONNECTOR_STATE_SECRET;
    delete process.env.CRON_SECRET;
  });

  it('round-trips org + type', () => {
    const s = buildState({ orgId: 'zedcor', type: 'slack' });
    const v = verifyState(s, 'slack');
    expect(v.ok).toBe(true);
    expect(v.orgId).toBe('zedcor');
    expect(v.type).toBe('slack');
  });

  it('falls back to CRON_SECRET when CONNECTOR_STATE_SECRET unset', () => {
    delete process.env.CONNECTOR_STATE_SECRET;
    process.env.CRON_SECRET = 'fallback-secret';
    const s = buildState({ orgId: 'org1', type: 'slack' });
    const v = verifyState(s, 'slack');
    expect(v.ok).toBe(true);
  });

  it('rejects malformed state', () => {
    expect(verifyState(null, 'slack').reason).toBe('malformed');
    expect(verifyState('', 'slack').reason).toBe('malformed');
    expect(verifyState('nodot', 'slack').reason).toBe('malformed');
  });

  it('rejects state signed with a different secret', () => {
    process.env.CONNECTOR_STATE_SECRET = 'one-secret';
    const s = buildState({ orgId: 'org1', type: 'slack' });
    process.env.CONNECTOR_STATE_SECRET = 'other-secret';
    const v = verifyState(s, 'slack');
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('signature_mismatch');
  });

  it('rejects state with the wrong connector type', () => {
    const s = buildState({ orgId: 'org1', type: 'slack' });
    const v = verifyState(s, 'teams');
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('type_mismatch');
  });

  it('rejects expired state', () => {
    // Build a token with the real signer but a crafted past expiry by
    // monkey-patching Date.now() during the build.
    const realNow = Date.now;
    Date.now = () => realNow() - 10 * 60 * 1000;
    let s: string;
    try {
      s = buildState({ orgId: 'org1', type: 'slack' });
    } finally {
      Date.now = realNow;
    }
    const v = verifyState(s, 'slack');
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('expired');
  });
});
