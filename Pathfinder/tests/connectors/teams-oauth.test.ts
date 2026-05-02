// tests/connectors/teams-oauth.test.ts — Microsoft Entra v2.0 token
// exchange + refresh + bot-app-token tests. Stubs `fetch` so no network.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => ({}),
}));

import {
  acquireBotAppToken,
  decodeIdTokenTid,
  exchangeCode,
  refreshToken,
} from '@/lib/connectors/teams/oauth';

const realFetch = global.fetch;

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): void {
  const ok = init.ok ?? true;
  const status = init.status ?? 200;
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response) as unknown as typeof fetch;
}

describe('exchangeCode', () => {
  beforeEach(() => {
    process.env.TEAMS_APP_ID = 'app-id-1';
    process.env.TEAMS_CLIENT_SECRET = 'client-secret-1';
    process.env.TEAMS_TENANT_ID = 'common';
  });
  afterEach(() => {
    delete process.env.TEAMS_APP_ID;
    delete process.env.TEAMS_CLIENT_SECRET;
    delete process.env.TEAMS_TENANT_ID;
    global.fetch = realFetch;
  });

  it('returns a normalized result on success', async () => {
    mockFetchOnce({
      token_type: 'Bearer',
      access_token: 'access-xyz',
      refresh_token: 'refresh-xyz',
      expires_in: 3599,
      scope: 'User.Read offline_access',
    });
    const out = await exchangeCode('test-code', 'https://www.unicron.systems/pathfinder/api/connectors/teams/callback');
    expect(out.access_token).toBe('access-xyz');
    expect(out.refresh_token).toBe('refresh-xyz');
    expect(out.scope).toBe('User.Read offline_access');
    expect(out.expires_at).toBeInstanceOf(Date);
  });

  it('throws if env vars are missing', async () => {
    delete process.env.TEAMS_APP_ID;
    await expect(exchangeCode('c', 'https://x')).rejects.toThrow(/TEAMS_APP_ID/);
  });

  it('throws on a provider error response', async () => {
    mockFetchOnce({
      error: 'invalid_grant',
      error_description: 'Code expired',
    }, { ok: false, status: 400 });
    await expect(exchangeCode('c', 'https://x')).rejects.toThrow(/Code expired/);
  });

  it('extracts tenant id from id_token.tid when present', async () => {
    // Build a fake id_token with `tid` claim.
    const header = Buffer.from('{"alg":"RS256"}').toString('base64url');
    const payload = Buffer.from(JSON.stringify({ tid: 'tenant-aabb-1111' })).toString('base64url');
    const idToken = `${header}.${payload}.sig`;
    mockFetchOnce({
      token_type: 'Bearer',
      access_token: 'a',
      expires_in: 3600,
      id_token: idToken,
    });
    const out = await exchangeCode('c', 'https://x');
    expect(out.account_external_id).toBe('tenant-aabb-1111');
    expect(out.account_name).toContain('tenant:');
  });
});

describe('refreshToken', () => {
  beforeEach(() => {
    process.env.TEAMS_APP_ID = 'app-id-1';
    process.env.TEAMS_CLIENT_SECRET = 'client-secret-1';
  });
  afterEach(() => {
    delete process.env.TEAMS_APP_ID;
    delete process.env.TEAMS_CLIENT_SECRET;
    global.fetch = realFetch;
  });

  it('returns the new access token', async () => {
    mockFetchOnce({
      token_type: 'Bearer',
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 3600,
      scope: 'User.Read',
    });
    const out = await refreshToken('old-refresh');
    expect(out.access_token).toBe('new-access');
    expect(out.refresh_token).toBe('new-refresh');
  });

  it('reuses the supplied refresh token if the provider does not return a new one', async () => {
    mockFetchOnce({
      token_type: 'Bearer',
      access_token: 'new-access',
      expires_in: 3600,
    });
    const out = await refreshToken('rotate-me');
    expect(out.refresh_token).toBe('rotate-me');
  });
});

describe('acquireBotAppToken', () => {
  beforeEach(() => {
    process.env.TEAMS_BOT_ID = 'bot-id-1';
    process.env.TEAMS_BOT_PASSWORD = 'bot-pwd-1';
  });
  afterEach(() => {
    delete process.env.TEAMS_BOT_ID;
    delete process.env.TEAMS_BOT_PASSWORD;
    global.fetch = realFetch;
  });

  it('returns the access token on success', async () => {
    mockFetchOnce({
      token_type: 'Bearer',
      access_token: 'bot-access',
      expires_in: 3600,
    });
    const out = await acquireBotAppToken();
    expect(out.access_token).toBe('bot-access');
    expect(out.expires_at).toBeInstanceOf(Date);
  });

  it('falls back to TEAMS_APP_ID / TEAMS_CLIENT_SECRET if bot-specific vars are unset', async () => {
    delete process.env.TEAMS_BOT_ID;
    delete process.env.TEAMS_BOT_PASSWORD;
    process.env.TEAMS_APP_ID = 'fallback-app';
    process.env.TEAMS_CLIENT_SECRET = 'fallback-secret';
    mockFetchOnce({
      token_type: 'Bearer',
      access_token: 'fb-access',
      expires_in: 3600,
    });
    const out = await acquireBotAppToken();
    expect(out.access_token).toBe('fb-access');
    delete process.env.TEAMS_APP_ID;
    delete process.env.TEAMS_CLIENT_SECRET;
  });
});

describe('decodeIdTokenTid', () => {
  it('returns null on null / undefined / empty', () => {
    expect(decodeIdTokenTid(null)).toBeNull();
    expect(decodeIdTokenTid(undefined)).toBeNull();
    expect(decodeIdTokenTid('')).toBeNull();
  });

  it('returns null on malformed jwt', () => {
    expect(decodeIdTokenTid('not.a.jwt')).toBeNull();
  });

  it('returns the tid claim when present', () => {
    const header = Buffer.from('{}').toString('base64url');
    const payload = Buffer.from(JSON.stringify({ tid: 'abc-123' })).toString('base64url');
    expect(decodeIdTokenTid(`${header}.${payload}.sig`)).toBe('abc-123');
  });
});
