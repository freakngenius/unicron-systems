// tests/connectors/hubspot-install-route.test.ts — Gate 12E.
//
// Regression: Reconnect button used to GET-navigate to the install
// route, which only had POST → 405 → Next.js rendered 404. This test
// asserts both GET and POST emit a 302 to HubSpot's authorize URL when
// the caller is an authorized operator.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => ({}),
}));

import { GET, POST } from '@/app/api/connectors/hubspot/install/route';

const SAVED = {
  OPERATOR_EMAILS: process.env.OPERATOR_EMAILS,
  CONNECTOR_OAUTH_STATE_SECRET: process.env.CONNECTOR_OAUTH_STATE_SECRET,
  HUBSPOT_CLIENT_ID: process.env.HUBSPOT_CLIENT_ID,
  PATHFINDER_PUBLIC_URL: process.env.PATHFINDER_PUBLIC_URL,
};

beforeEach(() => {
  process.env.OPERATOR_EMAILS = 'kyle@demystified.ai,alice@zedcor.com';
  process.env.CONNECTOR_OAUTH_STATE_SECRET = 'test-secret-32-bytes-of-entropy-ok!';
  process.env.HUBSPOT_CLIENT_ID = '824aae0e-3ce6-4fa6-bf00-e31aafc8acaf';
  process.env.PATHFINDER_PUBLIC_URL = 'https://example.test/pathfinder';
});

afterEach(() => {
  for (const [k, v] of Object.entries(SAVED)) {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string | undefined>)[k] = v;
  }
});

function buildRequest(opts: {
  method: 'GET' | 'POST';
  url?: string;
  operatorEmail?: string | null;
  via?: 'header' | 'query';
}) {
  const url = new URL(
    opts.url ?? 'https://example.test/pathfinder/api/connectors/hubspot/install',
  );
  if (opts.operatorEmail && opts.via === 'query') {
    url.searchParams.set('operator_email', opts.operatorEmail);
  }
  const headers: Record<string, string> = {};
  if (opts.operatorEmail && (opts.via ?? 'header') === 'header') {
    headers['x-operator-email'] = opts.operatorEmail;
  }
  // NextRequest is a thin wrapper over Request; tests can use Request
  // directly because the route handlers only touch `headers` and `url`.
  return new Request(url.toString(), {
    method: opts.method,
    headers,
  }) as unknown as Parameters<typeof GET>[0];
}

describe('hubspot install route — Gate 12E reconnect fix', () => {
  it('GET 302s to HubSpot authorize URL when operator email is in query', async () => {
    const res = await GET(
      buildRequest({ method: 'GET', operatorEmail: 'kyle@demystified.ai', via: 'query' }),
    );
    expect(res.status).toBe(302);
    const loc = res.headers.get('location');
    expect(loc).not.toBeNull();
    expect(loc).toContain('app.hubspot.com/oauth/authorize');
    expect(loc).toContain('client_id=824aae0e-3ce6-4fa6-bf00-e31aafc8acaf');
    expect(loc).toContain('state=');
  });

  it('GET 302s when operator email is in x-operator-email header', async () => {
    const res = await GET(
      buildRequest({ method: 'GET', operatorEmail: 'alice@zedcor.com', via: 'header' }),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('app.hubspot.com/oauth/authorize');
  });

  it('POST 302s to the same authorize URL (backwards-compat path)', async () => {
    const res = await POST(
      buildRequest({ method: 'POST', operatorEmail: 'kyle@demystified.ai', via: 'header' }),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('app.hubspot.com/oauth/authorize');
  });

  it('GET 403s when operator email is missing', async () => {
    const res = await GET(buildRequest({ method: 'GET' }));
    expect(res.status).toBe(403);
  });

  it('GET 403s when operator email is not in OPERATOR_EMAILS allowlist', async () => {
    const res = await GET(
      buildRequest({ method: 'GET', operatorEmail: 'attacker@evil.com', via: 'query' }),
    );
    expect(res.status).toBe(403);
  });

  it('POST 403s for non-operator (no methodology gap on auth check)', async () => {
    const res = await POST(buildRequest({ method: 'POST' }));
    expect(res.status).toBe(403);
  });
});
