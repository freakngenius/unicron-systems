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
