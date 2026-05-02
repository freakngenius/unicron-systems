// tests/connectors/hubspot-oauth.test.ts — buildAuthorizeUrl / exchangeCode /
// refreshToken with stubbed global.fetch so we never hit HubSpot.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => ({}),
}));

import {
  buildAuthorizeUrl,
  callbackUrl,
  exchangeCode,
  refreshToken,
} from '@/lib/connectors/hubspot/oauth';

const REAL_FETCH = global.fetch;

interface StubResponse {
  ok: boolean;
  status?: number;
  json?: object;
  text?: string;
}

/**
 * Build a fetch stub that returns canned responses keyed by URL prefix.
 * The stub records every call into `calls` so tests can assert request
 * shape (URL + body) without leaking the access token into a logger.
 */
function buildFetchStub(routes: Array<{ urlIncludes: string; response: StubResponse }>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  // @ts-expect-error stub
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const route = routes.find((r) => url.includes(r.urlIncludes));
    if (!route) {
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: 'no stub' }),
        text: async () => 'no stub',
      };
    }
    const r = route.response;
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 400),
      json: async () => r.json ?? {},
      text: async () => r.text ?? JSON.stringify(r.json ?? {}),
    };
  });
  return calls;
}

beforeEach(() => {
  process.env.HUBSPOT_CLIENT_ID = 'hub-client-123';
  process.env.HUBSPOT_CLIENT_SECRET = 'hub-secret-xyz';
  process.env.PATHFINDER_PUBLIC_URL = 'https://example.test/pathfinder';
});

afterEach(() => {
  global.fetch = REAL_FETCH;
  delete process.env.HUBSPOT_CLIENT_ID;
  delete process.env.HUBSPOT_CLIENT_SECRET;
  delete process.env.PATHFINDER_PUBLIC_URL;
});

describe('buildAuthorizeUrl', () => {
  it('points at HubSpot authorize host', () => {
    const url = new URL(buildAuthorizeUrl('state-xyz'));
    expect(url.hostname).toBe('app.hubspot.com');
    expect(url.pathname).toBe('/oauth/authorize');
  });

  it('includes the SPEC § 5.4 scopes (space-separated)', () => {
    const url = new URL(buildAuthorizeUrl('s'));
    const scope = url.searchParams.get('scope') ?? '';
    for (const required of [
      'crm.objects.deals.read',
      'crm.objects.deals.write',
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.schemas.deals.read',
    ]) {
      expect(scope.split(' ')).toContain(required);
    }
  });

  it('uses the framework callback URL', () => {
    const url = new URL(buildAuthorizeUrl('s'));
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://example.test/pathfinder/api/connectors/hubspot/callback',
    );
  });

  it('passes state through verbatim', () => {
    const url = new URL(buildAuthorizeUrl('abcd.efgh'));
    expect(url.searchParams.get('state')).toBe('abcd.efgh');
  });

  it('throws when HUBSPOT_CLIENT_ID is unset', () => {
    delete process.env.HUBSPOT_CLIENT_ID;
    expect(() => buildAuthorizeUrl('s')).toThrow(/HUBSPOT_CLIENT_ID/);
  });
});

describe('callbackUrl', () => {
  it('mirrors the framework slack callback URL shape', () => {
    expect(callbackUrl()).toBe('https://example.test/pathfinder/api/connectors/hubspot/callback');
  });
});

describe('exchangeCode', () => {
  it('POSTs grant_type=authorization_code with the provided code', async () => {
    const calls = buildFetchStub([
      {
        urlIncludes: '/oauth/v1/token',
        response: {
          ok: true,
          json: { access_token: 'A', refresh_token: 'R', expires_in: 1800 },
        },
      },
      {
        urlIncludes: '/oauth/v1/access-tokens/',
        response: {
          ok: true,
          json: { hub_id: 1234567, hub_domain: 'acme.hubspot.com', scopes: ['crm.objects.deals.read'] },
        },
      },
    ]);
    const out = await exchangeCode('code-abc');
    expect(out.access_token).toBe('A');
    expect(out.refresh_token).toBe('R');
    expect(out.expires_in).toBe(1800);
    expect(out.hub_id).toBe('1234567');
    expect(out.hub_domain).toBe('acme.hubspot.com');
    // First call is the token exchange; assert the body shape.
    const first = calls[0];
    const body = String(first.init?.body ?? '');
    expect(body).toContain('grant_type=authorization_code');
    expect(body).toContain('code=code-abc');
    expect(body).toContain('client_id=hub-client-123');
    expect(body).toContain('client_secret=hub-secret-xyz');
  });

  it('throws on non-2xx token-exchange response', async () => {
    buildFetchStub([
      {
        urlIncludes: '/oauth/v1/token',
        response: { ok: false, status: 400, text: '{"status":"BAD_AUTH","message":"expired"}' },
      },
    ]);
    await expect(exchangeCode('bad')).rejects.toThrow(/status=400/);
  });

  it('throws when HUBSPOT_CLIENT_SECRET is missing', async () => {
    delete process.env.HUBSPOT_CLIENT_SECRET;
    await expect(exchangeCode('x')).rejects.toThrow(/HUBSPOT_CLIENT/);
  });

  it('returns nulls for hub identity when introspection fails', async () => {
    buildFetchStub([
      {
        urlIncludes: '/oauth/v1/token',
        response: {
          ok: true,
          json: { access_token: 'A', refresh_token: 'R', expires_in: 1800 },
        },
      },
      {
        urlIncludes: '/oauth/v1/access-tokens/',
        response: { ok: false, status: 500, json: {} },
      },
    ]);
    const out = await exchangeCode('code');
    expect(out.access_token).toBe('A');
    expect(out.hub_id).toBeNull();
    expect(out.hub_domain).toBeNull();
  });

  it('rejects a malformed token-exchange body', async () => {
    buildFetchStub([
      {
        urlIncludes: '/oauth/v1/token',
        response: { ok: true, json: { not_a_token: true } },
      },
    ]);
    await expect(exchangeCode('x')).rejects.toThrow(/malformed body/);
  });
});

describe('refreshToken', () => {
  it('POSTs grant_type=refresh_token with the provided refresh string', async () => {
    const calls = buildFetchStub([
      {
        urlIncludes: '/oauth/v1/token',
        response: {
          ok: true,
          json: { access_token: 'A2', refresh_token: 'R2', expires_in: 1800 },
        },
      },
      {
        urlIncludes: '/oauth/v1/access-tokens/',
        response: { ok: true, json: { hub_id: 1, hub_domain: 'acme', scopes: [] } },
      },
    ]);
    const out = await refreshToken('refresh-abc');
    expect(out.access_token).toBe('A2');
    expect(out.refresh_token).toBe('R2');
    const body = String(calls[0].init?.body ?? '');
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain('refresh_token=refresh-abc');
  });

  it('throws on a non-2xx refresh response', async () => {
    buildFetchStub([
      {
        urlIncludes: '/oauth/v1/token',
        response: { ok: false, status: 401, text: '{"status":"BAD_REFRESH"}' },
      },
    ]);
    await expect(refreshToken('bad')).rejects.toThrow(/status=401/);
  });
});
