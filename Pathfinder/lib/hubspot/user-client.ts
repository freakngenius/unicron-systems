// lib/hubspot/user-client.ts — per-user HubSpot REST wrapper.
//
// SPEC - HubSpot Bridge.md §Lead detail. Distinct from lib/hubspot/client.ts
// (the cron flow's wrapper which uses the legacy CRON-attached app
// token). This module takes a decrypted user-connection access token
// and provides the minimal calls needed for Gate 10C push:
//
//   - createDeal({ properties })
//   - createCompany({ properties })
//   - associateDealCompany(dealId, companyId)
//   - findOrCreateContactByEmail({ email, properties })
//   - associateDealContact(dealId, contactId)
//   - createNote({ dealId, body })  // 10D-only via NOTE_BUTTON_ENABLED
//   - portalUrl(portalId, dealId) — pure helper for the "Open in HubSpot" link
//
// Retry policy is intentionally minimal in v1: 429 → respect Retry-After,
// retry once. 5xx → single retry with 500ms delay. 4xx other than 429 →
// terminal. The Gate 10D push-update / refresh flows can layer richer
// retry on top.
//
// Tokens never leave this module. Errors carry only the HubSpot error
// string + status code; the caller's audit log records the error
// message but never the access token.

const HUBSPOT_API = 'https://api.hubapi.com';

export class HubspotUserClientError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`HubSpot ${status}: ${detail.slice(0, 240)}`);
    this.name = 'HubspotUserClientError';
  }
}

export interface HubspotUserClient {
  createDeal: (input: {
    properties: Record<string, string | number>;
  }) => Promise<{ id: string }>;
  createCompany: (input: {
    properties: Record<string, string | number>;
  }) => Promise<{ id: string }>;
  associateDealCompany: (dealId: string, companyId: string) => Promise<void>;
  findOrCreateContactByEmail: (input: {
    email: string | null;
    properties: Record<string, string | number>;
  }) => Promise<{ id: string; created: boolean }>;
  associateDealContact: (dealId: string, contactId: string) => Promise<void>;
  createNote: (input: { dealId: string; body: string }) => Promise<{ id: string }>;
  /** Lower-level HubSpot REST access. Used by ensure-properties to GET/POST
   *  the properties + property-groups schema endpoints. Reuses the same
   *  retry-on-429/5xx envelope as the named methods above so the
   *  schema bootstrap inherits the same backoff guarantees. */
  request: <T = unknown>(opts: {
    method: 'GET' | 'POST' | 'PATCH' | 'PUT';
    path: string;
    body?: unknown;
  }) => Promise<T>;
}

interface HubspotFetchOpts {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT';
  path: string;
  body?: unknown;
  /** Override fetch for tests. */
  fetcher?: typeof fetch;
  /** Gate 12J: belt-and-suspenders 401 recovery. When a request returns
   *  401 with EXPIRED_AUTHENTICATION (HubSpot's expired-token errno), the
   *  client invokes this callback to obtain a fresh access token, swaps
   *  it in, and retries the request once. Distinct from the proactive
   *  refresh at lib/connectors/user-connection.ts (gate 12I): that
   *  catches expiry BEFORE the call, this catches expiry DURING the call
   *  (clock skew, mid-flight expiry, edge-case bugs in expires_at). */
  onTokenExpired?: () => Promise<string>;
  /** Mutable access-token holder. Set by createUserClient on retry so
   *  subsequent calls in the same client instance reuse the refreshed
   *  token instead of paying the refresh cost again. */
  tokenRef?: { current: string };
}

function isExpiredAuthBody(body: string): boolean {
  // HubSpot signals expired-access-token via the EXPIRED_AUTHENTICATION
  // category. The message text ("expired N seconds ago") is also a
  // reliable substring tell. Both checks so we tolerate minor wording
  // changes from HubSpot.
  return body.includes('EXPIRED_AUTHENTICATION') || /expired \d+ (?:second|minute)/i.test(body);
}

async function callHubspot(token: string, opts: HubspotFetchOpts): Promise<unknown> {
  const fn = opts.fetcher ?? fetch;
  const url = `${HUBSPOT_API}${opts.path}`;
  const buildInit = (bearer: string): RequestInit => ({
    method: opts.method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let activeToken = token;
  let res = await fn(url, buildInit(activeToken));
  // 429: respect Retry-After header (seconds), single retry.
  if (res.status === 429) {
    const ra = res.headers.get('retry-after');
    const delayMs = ra ? Math.min(30000, Math.max(100, Number.parseInt(ra, 10) * 1000)) : 1000;
    await new Promise((r) => setTimeout(r, delayMs));
    res = await fn(url, buildInit(activeToken));
  }
  // 5xx: single retry with fixed 500ms backoff.
  if (res.status >= 500 && res.status < 600) {
    await new Promise((r) => setTimeout(r, 500));
    res = await fn(url, buildInit(activeToken));
  }
  // 401 EXPIRED_AUTHENTICATION: refresh and retry once. Gated on the
  // caller providing onTokenExpired so non-token-aware callers (tests,
  // ad-hoc usage) get the existing terminal-401 behavior.
  if (res.status === 401 && opts.onTokenExpired) {
    const peekText = await res.clone().text().catch(() => '');
    if (isExpiredAuthBody(peekText)) {
      try {
        const fresh = await opts.onTokenExpired();
        activeToken = fresh;
        if (opts.tokenRef) opts.tokenRef.current = fresh;
        res = await fn(url, buildInit(activeToken));
      } catch {
        // Refresh failed. Fall through to the throw below using the
        // original 401 response — the caller surfaces the auth failure
        // and the route audit-logs it. (We already consumed the body
        // via clone().text(), so the original res body is still readable.)
      }
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new HubspotUserClientError(res.status, text);
  }
  if (res.status === 204) return null;
  return await res.json().catch(() => null);
}

/** Build a per-user HubSpot client that authenticates with the given
 *  access token. Token never leaves the closure.
 *
 *  Gate 12J: callers may pass `onTokenExpired` to enable transparent
 *  recovery from mid-call EXPIRED_AUTHENTICATION 401s. The callback
 *  should return a fresh access token (typically by calling
 *  `getHubspotConnectionTokens` again, which gate 12I refreshes
 *  proactively). */
export function createUserClient(opts: {
  accessToken: string;
  fetcher?: typeof fetch;
  onTokenExpired?: () => Promise<string>;
}): HubspotUserClient {
  const { fetcher, onTokenExpired } = opts;
  // Mutable holder so all named methods share a single source of truth
  // for the current bearer; a 401-driven refresh inside callHubspot
  // updates it via tokenRef.current and subsequent calls reuse the
  // refreshed token without paying refresh cost again.
  const tokenRef = { current: opts.accessToken };

  // Local wrapper: every named method calls through this so the
  // 401-retry + tokenRef plumbing stays uniform.
  const call = (req: { method: 'GET' | 'POST' | 'PATCH' | 'PUT'; path: string; body?: unknown }) =>
    callHubspot(tokenRef.current, {
      method: req.method,
      path: req.path,
      body: req.body,
      fetcher,
      onTokenExpired,
      tokenRef,
    });

  return {
    async createDeal(input) {
      const data = (await call({
        method: 'POST',
        path: '/crm/v3/objects/deals',
        body: { properties: input.properties },
      })) as { id?: string } | null;
      if (!data || typeof data.id !== 'string') {
        throw new HubspotUserClientError(502, 'createDeal returned no id');
      }
      return { id: data.id };
    },

    async createCompany(input) {
      const data = (await call({
        method: 'POST',
        path: '/crm/v3/objects/companies',
        body: { properties: input.properties },
      })) as { id?: string } | null;
      if (!data || typeof data.id !== 'string') {
        throw new HubspotUserClientError(502, 'createCompany returned no id');
      }
      return { id: data.id };
    },

    async associateDealCompany(dealId, companyId) {
      await call({
        method: 'PUT',
        path: `/crm/v3/objects/deals/${encodeURIComponent(dealId)}/associations/companies/${encodeURIComponent(companyId)}/deal_to_company`,
      });
    },

    async findOrCreateContactByEmail(input) {
      // HubSpot's "create or update" pattern: search by email, then
      // POST if not found. v1 does the simpler create + handle-409 path.
      if (input.email && input.email.trim().length > 0) {
        try {
          const data = (await call({
            method: 'POST',
            path: '/crm/v3/objects/contacts',
            body: { properties: { ...input.properties, email: input.email } },
          })) as { id?: string } | null;
          if (data && typeof data.id === 'string') {
            return { id: data.id, created: true };
          }
        } catch (err) {
          if (err instanceof HubspotUserClientError && err.status === 409) {
            // Conflict — contact with this email exists. Search by email
            // to recover the id.
            const search = (await call({
              method: 'POST',
              path: '/crm/v3/objects/contacts/search',
              body: {
                filterGroups: [
                  {
                    filters: [
                      { propertyName: 'email', operator: 'EQ', value: input.email },
                    ],
                  },
                ],
                limit: 1,
              },
            })) as { results?: Array<{ id: string }> } | null;
            const hit = search?.results?.[0];
            if (hit) return { id: hit.id, created: false };
          }
          throw err;
        }
      }
      // No email — create a contact with whatever properties we have.
      const data = (await call({
        method: 'POST',
        path: '/crm/v3/objects/contacts',
        body: { properties: input.properties },
      })) as { id?: string } | null;
      if (!data || typeof data.id !== 'string') {
        throw new HubspotUserClientError(502, 'createContact returned no id');
      }
      return { id: data.id, created: true };
    },

    async associateDealContact(dealId, contactId) {
      await call({
        method: 'PUT',
        path: `/crm/v3/objects/deals/${encodeURIComponent(dealId)}/associations/contacts/${encodeURIComponent(contactId)}/deal_to_contact`,
      });
    },

    async request(opts) {
      const data = await call({
        method: opts.method,
        path: opts.path,
        body: opts.body,
      });
      return data as never;
    },

    async createNote(input) {
      // HubSpot v3 engagements: notes are an engagement_type. Requires
      // crm.engagements.write scope, which is paywalled to Sales Hub
      // Starter+. Gated by NOTE_BUTTON_ENABLED at the route layer; this
      // method is callable only when the env flag is on.
      const data = (await call({
        method: 'POST',
        path: '/crm/v3/objects/notes',
        body: {
          properties: {
            hs_note_body: input.body,
            hs_timestamp: Date.now(),
          },
          associations: [
            {
              to: { id: input.dealId },
              types: [
                { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 },
              ],
            },
          ],
        },
      })) as { id?: string } | null;
      if (!data || typeof data.id !== 'string') {
        throw new HubspotUserClientError(502, 'createNote returned no id');
      }
      return { id: data.id };
    },
  };
}

/** Build the "Open in HubSpot" portal URL for a given deal. HubSpot's
 *  canonical UI URL for a deal is:
 *    https://app.hubspot.com/contacts/{portalId}/deal/{dealId}
 *  Pure helper — no token needed. */
export function portalDealUrl(portalId: string, dealId: string): string {
  return `https://app.hubspot.com/contacts/${encodeURIComponent(portalId)}/deal/${encodeURIComponent(dealId)}`;
}

/** Build the contact's HubSpot UI URL. */
export function portalContactUrl(portalId: string, contactId: string): string {
  return `https://app.hubspot.com/contacts/${encodeURIComponent(portalId)}/contact/${encodeURIComponent(contactId)}`;
}
