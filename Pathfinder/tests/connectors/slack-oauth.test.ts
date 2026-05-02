// tests/connectors/slack-oauth.test.ts — exchangeCode + buildAuthorizeUrl,
// with a stubbed global.fetch so we never hit Slack.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => ({}),
}));

import { buildAuthorizeUrl, exchangeCode } from '@/lib/connectors/slack/oauth';

const REAL_FETCH = global.fetch;

function stubFetch(response: { ok: boolean; status?: number; json: object }) {
  // @ts-expect-error stub
  global.fetch = vi.fn(async () => ({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 400),
    json: async () => response.json,
  }));
}

beforeEach(() => {
  process.env.SLACK_CLIENT_ID = 'A1234567890';
  process.env.SLACK_CLIENT_SECRET = 'super-secret';
  process.env.PATHFINDER_PUBLIC_URL = 'https://example.test/pathfinder';
});

afterEach(() => {
  global.fetch = REAL_FETCH;
  delete process.env.SLACK_CLIENT_ID;
  delete process.env.SLACK_CLIENT_SECRET;
  delete process.env.PATHFINDER_PUBLIC_URL;
});

describe('buildAuthorizeUrl', () => {
  it('includes scopes per SPEC § 5.4 + the dispatch prompt', () => {
    const url = new URL(buildAuthorizeUrl('state-xyz'));
    const scopes = (url.searchParams.get('scope') ?? '').split(',');
    for (const required of [
      'chat:write',
      'channels:read',
      'im:write',
      'app_mentions:read',
      'commands',
      'reactions:read',
    ]) {
      expect(scopes).toContain(required);
    }
  });

  it('points the redirect at the framework callback URL', () => {
    const url = new URL(buildAuthorizeUrl('state-xyz'));
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://example.test/pathfinder/api/connectors/slack/callback',
    );
  });

  it('passes the state through verbatim', () => {
    const url = new URL(buildAuthorizeUrl('abcd.efgh'));
    expect(url.searchParams.get('state')).toBe('abcd.efgh');
  });

  it('throws when SLACK_CLIENT_ID is unset', () => {
    delete process.env.SLACK_CLIENT_ID;
    expect(() => buildAuthorizeUrl('s')).toThrow(/SLACK_CLIENT_ID/);
  });
});

describe('exchangeCode', () => {
  it('returns the parsed Slack OAuth response on success', async () => {
    stubFetch({
      ok: true,
      json: {
        ok: true,
        app_id: 'A1',
        access_token: 'xoxb-test',
        bot_user_id: 'U_BOT',
        team: { id: 'T_TEAM', name: 'Acme HQ' },
        scope: 'chat:write,channels:read',
      },
    });
    const out = await exchangeCode('the_code');
    expect(out.ok).toBe(true);
    expect(out.team?.id).toBe('T_TEAM');
    expect(out.access_token).toBe('xoxb-test');
  });

  it('throws on ok: false from Slack', async () => {
    stubFetch({ ok: true, json: { ok: false, error: 'invalid_code' } });
    await expect(exchangeCode('bad')).rejects.toThrow(/invalid_code/);
  });

  it('throws when the SLACK_CLIENT_SECRET is missing', async () => {
    delete process.env.SLACK_CLIENT_SECRET;
    await expect(exchangeCode('x')).rejects.toThrow(/SLACK_CLIENT/);
  });
});
