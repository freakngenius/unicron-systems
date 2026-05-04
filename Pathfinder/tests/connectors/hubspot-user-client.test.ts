// tests/connectors/hubspot-user-client.test.ts — Gate 10C.
// Stubs global.fetch and exercises the per-user HubSpot REST wrapper.

import { describe, expect, it, vi } from 'vitest';

import {
  createUserClient,
  HubspotUserClientError,
  portalContactUrl,
  portalDealUrl,
} from '../../lib/hubspot/user-client';

interface StubResp {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

function stubFetch(routes: Array<{ match: (url: string) => boolean; resp: StubResp }>): {
  fetcher: typeof fetch;
  calls: Array<{ url: string; init?: RequestInit }>;
} {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : '';
    calls.push({ url: u, init });
    const route = routes.find((r) => r.match(u));
    if (!route) {
      return {
        ok: false,
        status: 404,
        text: async () => 'no stub',
        json: async () => ({ error: 'no stub' }),
        headers: new Headers(),
      } as unknown as Response;
    }
    return {
      ok: route.resp.status >= 200 && route.resp.status < 300,
      status: route.resp.status,
      text: async () => JSON.stringify(route.resp.body ?? {}),
      json: async () => route.resp.body ?? {},
      headers: new Headers(route.resp.headers ?? {}),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe('user-client', () => {
  it('createDeal posts properties + sets bearer auth', async () => {
    const { fetcher, calls } = stubFetch([
      {
        match: (u) => u.endsWith('/crm/v3/objects/deals'),
        resp: { status: 201, body: { id: 'deal-9999' } },
      },
    ]);
    const client = createUserClient({ accessToken: 'tok-abc', fetcher });
    const out = await client.createDeal({ properties: { dealname: 'X' } });
    expect(out.id).toBe('deal-9999');
    expect(calls[0].url).toContain('/crm/v3/objects/deals');
    const auth = (calls[0].init?.headers as Record<string, string> | undefined)?.['Authorization'];
    expect(auth).toBe('Bearer tok-abc');
  });

  it('throws HubspotUserClientError on 4xx', async () => {
    const { fetcher } = stubFetch([
      {
        match: () => true,
        resp: { status: 400, body: { error: 'bad request' } },
      },
    ]);
    const client = createUserClient({ accessToken: 'tok', fetcher });
    await expect(client.createDeal({ properties: {} })).rejects.toBeInstanceOf(
      HubspotUserClientError,
    );
  });

  it('retries once on 429 honoring Retry-After', async () => {
    let calls = 0;
    const fetcher: typeof fetch = (async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          status: 429,
          text: async () => '',
          json: async () => ({}),
          headers: new Headers({ 'retry-after': '0' }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 201,
        text: async () => '{}',
        json: async () => ({ id: 'deal-after-retry' }),
        headers: new Headers(),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const client = createUserClient({ accessToken: 'tok', fetcher });
    const out = await client.createDeal({ properties: { dealname: 'X' } });
    expect(out.id).toBe('deal-after-retry');
    expect(calls).toBe(2);
  });

  it('findOrCreateContactByEmail recovers from 409 via search fallback', async () => {
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = typeof url === 'string' ? url : '';
      // First POST → 409 conflict
      if (u.endsWith('/crm/v3/objects/contacts') && (init?.method ?? 'POST') === 'POST') {
        return {
          ok: false,
          status: 409,
          text: async () => 'conflict',
          json: async () => ({ error: 'CONTACT_EXISTS' }),
          headers: new Headers(),
        } as unknown as Response;
      }
      // Search returns the existing contact id
      if (u.endsWith('/crm/v3/objects/contacts/search')) {
        return {
          ok: true,
          status: 200,
          text: async () => '',
          json: async () => ({ results: [{ id: 'existing-contact-555' }] }),
          headers: new Headers(),
        } as unknown as Response;
      }
      return {
        ok: false,
        status: 404,
        text: async () => '',
        json: async () => ({}),
        headers: new Headers(),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const client = createUserClient({ accessToken: 'tok', fetcher });
    const out = await client.findOrCreateContactByEmail({
      email: 'alice@example.com',
      properties: { firstname: 'Alice' },
    });
    expect(out.id).toBe('existing-contact-555');
    expect(out.created).toBe(false);
  });
});

// ─────────── gate 12J — 401 EXPIRED_AUTHENTICATION recovery ───────────

describe('user-client — 401 EXPIRED_AUTHENTICATION recovery (gate 12J)', () => {
  function expired401(): Response {
    return {
      ok: false,
      status: 401,
      text: async () =>
        JSON.stringify({
          status: 'error',
          message: 'The OAuth token used to make this call expired 32 second(s) ago.',
          category: 'EXPIRED_AUTHENTICATION',
        }),
      clone() {
        return this as unknown as Response;
      },
      json: async () => ({}),
      headers: new Headers(),
    } as unknown as Response;
  }

  function ok201(body: unknown): Response {
    return {
      ok: true,
      status: 201,
      text: async () => JSON.stringify(body),
      clone() {
        return this as unknown as Response;
      },
      json: async () => body,
      headers: new Headers(),
    } as unknown as Response;
  }

  function bad401NotExpired(): Response {
    // 401 that's NOT an expired-token error (e.g., bad client secret,
    // revoked refresh) — must NOT trigger the refresh callback.
    return {
      ok: false,
      status: 401,
      text: async () =>
        JSON.stringify({ status: 'error', message: 'invalid token', category: 'INVALID_AUTHENTICATION' }),
      clone() {
        return this as unknown as Response;
      },
      json: async () => ({}),
      headers: new Headers(),
    } as unknown as Response;
  }

  it('refreshes + retries once on EXPIRED_AUTHENTICATION; uses fresh token on retry', async () => {
    const calls: Array<{ url: string; auth: string | undefined }> = [];
    const fetcher: typeof fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : '';
      const auth = (init?.headers as Record<string, string> | undefined)?.['Authorization'];
      calls.push({ url: u, auth });
      if (calls.length === 1) return expired401();
      return ok201({ id: 'deal-after-refresh' });
    }) as unknown as typeof fetch;

    const onTokenExpired = vi.fn(async () => 'fresh-token-XYZ');
    const client = createUserClient({
      accessToken: 'stale-token-ABC',
      fetcher,
      onTokenExpired,
    });
    const out = await client.createDeal({ properties: { dealname: 'X' } });

    expect(out.id).toBe('deal-after-refresh');
    expect(onTokenExpired).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
    expect(calls[0].auth).toBe('Bearer stale-token-ABC');
    expect(calls[1].auth).toBe('Bearer fresh-token-XYZ');
  });

  it('subsequent calls in the same client reuse the refreshed token', async () => {
    const calls: Array<{ auth: string | undefined }> = [];
    const fetcher: typeof fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string> | undefined)?.['Authorization'];
      calls.push({ auth });
      if (calls.length === 1) return expired401();
      return ok201({ id: `deal-${calls.length}` });
    }) as unknown as typeof fetch;

    const onTokenExpired = vi.fn(async () => 'fresh-token-XYZ');
    const client = createUserClient({
      accessToken: 'stale',
      fetcher,
      onTokenExpired,
    });
    await client.createDeal({ properties: {} });
    await client.createDeal({ properties: {} });
    await client.createDeal({ properties: {} });

    // Refresh callback only fires once — tokenRef carries the fresh
    // token forward into subsequent calls.
    expect(onTokenExpired).toHaveBeenCalledTimes(1);
    expect(calls.slice(1).every((c) => c.auth === 'Bearer fresh-token-XYZ')).toBe(true);
  });

  it('non-EXPIRED_AUTHENTICATION 401 does NOT trigger refresh', async () => {
    const fetcher: typeof fetch = (async () => bad401NotExpired()) as unknown as typeof fetch;
    const onTokenExpired = vi.fn();
    const client = createUserClient({ accessToken: 'tok', fetcher, onTokenExpired });
    await expect(client.createDeal({ properties: {} })).rejects.toBeInstanceOf(HubspotUserClientError);
    expect(onTokenExpired).not.toHaveBeenCalled();
  });

  it('without onTokenExpired: 401 EXPIRED_AUTHENTICATION still throws (no silent retry)', async () => {
    const fetcher: typeof fetch = (async () => expired401()) as unknown as typeof fetch;
    const client = createUserClient({ accessToken: 'tok', fetcher });
    await expect(client.createDeal({ properties: {} })).rejects.toBeInstanceOf(HubspotUserClientError);
  });

  it('refresh callback throws → original 401 surfaces (no infinite loop)', async () => {
    const fetcher: typeof fetch = (async () => expired401()) as unknown as typeof fetch;
    const onTokenExpired = vi.fn(async () => {
      throw new Error('refresh exchange 401');
    });
    const client = createUserClient({ accessToken: 'tok', fetcher, onTokenExpired });
    await expect(client.createDeal({ properties: {} })).rejects.toBeInstanceOf(HubspotUserClientError);
    expect(onTokenExpired).toHaveBeenCalledTimes(1);
  });

  it('retried call also returns 401 → throws (single retry, not a loop)', async () => {
    let attempts = 0;
    const fetcher: typeof fetch = (async () => {
      attempts += 1;
      return expired401();
    }) as unknown as typeof fetch;
    const onTokenExpired = vi.fn(async () => 'fresh-token');
    const client = createUserClient({ accessToken: 'tok', fetcher, onTokenExpired });
    await expect(client.createDeal({ properties: {} })).rejects.toBeInstanceOf(HubspotUserClientError);
    expect(attempts).toBe(2);
    expect(onTokenExpired).toHaveBeenCalledTimes(1);
  });
});

describe('portal URL helpers', () => {
  it('builds a deal URL with portal id + deal id', () => {
    expect(portalDealUrl('12345', 'deal-9999')).toBe(
      'https://app.hubspot.com/contacts/12345/deal/deal-9999',
    );
  });
  it('builds a contact URL', () => {
    expect(portalContactUrl('12345', 'contact-555')).toBe(
      'https://app.hubspot.com/contacts/12345/contact/contact-555',
    );
  });
  it('encodes special chars in path segments', () => {
    expect(portalDealUrl('p/1', 'd?2')).toContain('p%2F1');
    expect(portalDealUrl('p/1', 'd?2')).toContain('d%3F2');
  });
});
