// __tests__/slack/install.test.ts — state-token sign/verify + install URL
// builder. No Supabase, no Slack network — these are pure-function
// guarantees the OAuth flow depends on for forgery resistance.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub @/lib/supabase before the module under test imports it — see
// __tests__/slack/bot.test.ts for the rationale.
vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => ({}),
}));

import { BOT_SCOPES, buildInstallUrl, buildState, verifyState } from '@/lib/slack/install';

const ENV_KEYS = ['CRON_SECRET', 'SLACK_CLIENT_ID', 'PATHFINDER_PUBLIC_URL'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.CRON_SECRET = 'test-cron-secret';
  process.env.SLACK_CLIENT_ID = '12345.67890';
  process.env.PATHFINDER_PUBLIC_URL = 'https://example.test/pathfinder';
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
});

describe('buildState / verifyState', () => {
  it('round-trips a freshly built state', () => {
    const s = buildState();
    expect(verifyState(s)).toBe(true);
  });

  it('returns a different state on every call (randomness)', () => {
    const a = buildState();
    const b = buildState();
    expect(a).not.toBe(b);
  });

  it('rejects an empty / null / undefined state', () => {
    expect(verifyState('')).toBe(false);
    expect(verifyState(null)).toBe(false);
    expect(verifyState(undefined)).toBe(false);
  });

  it('rejects a state without the dot separator', () => {
    expect(verifyState('abcdef')).toBe(false);
  });

  it('rejects a state whose signature was tampered with', () => {
    const s = buildState();
    const dot = s.indexOf('.');
    const nonce = s.slice(0, dot);
    const tampered = nonce + '.' + 'deadbeef';
    expect(verifyState(tampered)).toBe(false);
  });

  it('rejects a state signed with a different secret', () => {
    const s = buildState();
    process.env.CRON_SECRET = 'rotated-secret';
    expect(verifyState(s)).toBe(false);
  });
});

describe('buildInstallUrl', () => {
  it('builds a slack.com authorize URL with all expected params', () => {
    const { url, state } = buildInstallUrl();
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://slack.com/oauth/v2/authorize');
    expect(u.searchParams.get('client_id')).toBe('12345.67890');
    expect(u.searchParams.get('scope')).toBe(BOT_SCOPES.join(','));
    expect(u.searchParams.get('redirect_uri')).toBe(
      'https://example.test/pathfinder/api/slack/install/callback',
    );
    expect(u.searchParams.get('state')).toBe(state);
    expect(verifyState(state)).toBe(true);
  });

  it('throws when SLACK_CLIENT_ID is unset', () => {
    delete process.env.SLACK_CLIENT_ID;
    expect(() => buildInstallUrl()).toThrow(/SLACK_CLIENT_ID/);
  });
});
