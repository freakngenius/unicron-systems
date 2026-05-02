// __tests__/email/oauth.test.ts — Stream B Gate B2.
//
// State-token sign/verify + buildAuthorizeUrl + exchangeCode + completeOauth
// happy path with a mocked fetch. Mocks @/lib/supabase so module load
// doesn't trip on missing env.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => ({
    from: () => ({
      upsert: () => ({
        select: () => ({
          single: () =>
            Promise.resolve({
              data: {
                id: 'integ-1',
                actor_email: 'rep@zedcor.com',
                provider: 'gmail',
                account_email: 'rep@zedcor.com',
                access_token: 'access-1',
                refresh_token: 'refresh-1',
                token_expires_at: '2026-05-01T01:00:00.000Z',
                scope: 'https://www.googleapis.com/auth/gmail.send',
                provider_meta: {},
                connected_at: '2026-05-01T00:00:00.000Z',
                disconnected_at: null,
              },
              error: null,
            }),
        }),
      }),
    }),
  }),
}));

process.env.CRON_SECRET = process.env.CRON_SECRET ?? 'test-cron-secret';
process.env.GOOGLE_OAUTH_CLIENT_ID =
  process.env.GOOGLE_OAUTH_CLIENT_ID ?? 'google-test-client';
process.env.GOOGLE_OAUTH_CLIENT_SECRET =
  process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? 'google-test-secret';
process.env.MICROSOFT_GRAPH_CLIENT_ID =
  process.env.MICROSOFT_GRAPH_CLIENT_ID ?? 'msft-test-client';
process.env.MICROSOFT_GRAPH_CLIENT_SECRET =
  process.env.MICROSOFT_GRAPH_CLIENT_SECRET ?? 'msft-test-secret';

import {
  buildAuthorizeUrl,
  buildState,
  completeOauth,
  exchangeCode,
  isEmailProvider,
  verifyState,
} from '@/lib/email/oauth';

describe('isEmailProvider', () => {
  it('accepts gmail and outlook', () => {
    expect(isEmailProvider('gmail')).toBe(true);
    expect(isEmailProvider('outlook')).toBe(true);
  });
  it('rejects others', () => {
    expect(isEmailProvider('imap')).toBe(false);
    expect(isEmailProvider(undefined)).toBe(false);
    expect(isEmailProvider(123)).toBe(false);
  });
});

describe('state token round-trip', () => {
  it('verifies a freshly-built token', () => {
    const state = buildState('gmail', 'rep@zedcor.com');
    const payload = verifyState(state);
    expect(payload).not.toBeNull();
    expect(payload!.provider).toBe('gmail');
    expect(payload!.actor).toBe('rep@zedcor.com');
  });

  it('rejects a tampered signature', () => {
    const state = buildState('outlook', 'rep@zedcor.com');
    const dot = state.lastIndexOf('.');
    const tampered = state.slice(0, dot + 1) + 'badbadbad';
    expect(verifyState(tampered)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const state = buildState('gmail', 'rep@zedcor.com');
    const dot = state.indexOf('.');
    const swapped = 'YQ' + state.slice(2, dot) + state.slice(dot);
    expect(verifyState(swapped)).toBeNull();
  });

  it('rejects empty / missing tokens', () => {
    expect(verifyState(null)).toBeNull();
    expect(verifyState('')).toBeNull();
    expect(verifyState('nodot')).toBeNull();
  });
});

describe('buildAuthorizeUrl', () => {
  it('builds a Google authorize URL with required params', () => {
    const r = buildAuthorizeUrl({ provider: 'gmail', actorEmail: 'rep@zedcor.com' });
    expect(r.url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')).toBe(true);
    const u = new URL(r.url);
    expect(u.searchParams.get('client_id')).toBe('google-test-client');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('state')).toBe(r.state);
    expect(u.searchParams.get('scope')).toContain('gmail.send');
  });

  it('builds a Microsoft authorize URL with offline_access scope', () => {
    const r = buildAuthorizeUrl({ provider: 'outlook', actorEmail: 'rep@zedcor.com' });
    expect(r.url.startsWith('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?')).toBe(
      true,
    );
    const u = new URL(r.url);
    expect(u.searchParams.get('scope')).toContain('Mail.Send');
    expect(u.searchParams.get('scope')).toContain('offline_access');
  });
});

describe('exchangeCode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed token response on success', async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: 'access-1',
            refresh_token: 'refresh-1',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'gmail.send',
          }),
          { status: 200 },
        ),
    );

    const tokens = await exchangeCode({
      provider: 'gmail',
      code: 'abc',
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    expect(tokens.access_token).toBe('access-1');
    expect(tokens.refresh_token).toBe('refresh-1');
    expect(tokens.expires_in).toBe(3600);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it('throws when provider returns error', async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: 'invalid_grant', error_description: 'expired' }),
          { status: 400 },
        ),
    );
    await expect(
      exchangeCode({
        provider: 'gmail',
        code: 'abc',
        fetchImpl: fakeFetch as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/invalid_grant/);
  });
});

describe('completeOauth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs end-to-end with a mocked provider — state verifies, code exchanges, mailbox resolves, integration persists', async () => {
    const state = buildState('gmail', 'rep@zedcor.com');
    let calls = 0;
    const fakeFetch = vi.fn(async (url: string | URL | Request) => {
      calls += 1;
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('oauth2.googleapis.com/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'access-1',
            refresh_token: 'refresh-1',
            expires_in: 3600,
            scope: 'gmail.send',
            token_type: 'Bearer',
          }),
          { status: 200 },
        );
      }
      if (u.includes('gmail.googleapis.com/gmail/v1/users/me/profile')) {
        return new Response(JSON.stringify({ emailAddress: 'rep@zedcor.com' }), {
          status: 200,
        });
      }
      throw new Error(`unexpected fetch to ${u}`);
    });

    const result = await completeOauth({
      code: 'auth-code-1',
      state,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    expect(result.integration.account_email).toBe('rep@zedcor.com');
    expect(result.integration.provider).toBe('gmail');
    expect(calls).toBe(2);
  });

  it('throws invalid_state on bad state', async () => {
    await expect(
      completeOauth({ code: 'x', state: 'bogus.signature' }),
    ).rejects.toThrow(/invalid_state/);
  });
});
