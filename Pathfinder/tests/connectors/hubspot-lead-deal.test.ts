// tests/connectors/hubspot-lead-deal.test.ts — Gate 10C.
//
// Orchestration tests for pushLeadDeal. Stubs supabaseAdmin + the
// per-user HubSpot client; asserts:
//   - returns 'no_connection' when the user has no active hubspot row
//   - short-circuits idempotently when a lead_hubspot_deals row exists
//   - creates deal + company + contacts on the happy path
//   - multi-tenant: different users on the same project create separate rows

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HubspotUserClient } from '../../lib/hubspot/user-client';

interface QueuedQueryResult {
  data: unknown;
  error: { message: string } | null;
}

const queryResults: QueuedQueryResult[] = [];
const filterTrace: string[] = [];

function nextResult(): QueuedQueryResult {
  return queryResults.shift() ?? { data: null, error: null };
}

interface SelectChain {
  eq: (col: string, v: string) => SelectChain;
  order: (col: string, opts: { ascending: boolean }) => SelectChain;
  limit: (n: number) => SelectChain;
  maybeSingle: () => Promise<QueuedQueryResult>;
  // Used by loadLeadContacts which terminates with .order (no maybeSingle).
  then: <T>(onfulfilled: (v: QueuedQueryResult) => T) => Promise<T>;
}

function selectChain(): SelectChain {
  const chain: SelectChain = {
    eq: (col: string, v: string) => {
      filterTrace.push(`eq:${col}=${v}`);
      return chain;
    },
    order: () => {
      // For the loadLeadContacts terminator: resolve immediately.
      return chain;
    },
    limit: () => chain,
    maybeSingle: () => Promise.resolve(nextResult()),
    then: <T,>(onfulfilled: (v: QueuedQueryResult) => T) =>
      Promise.resolve(onfulfilled(nextResult())),
  };
  return chain;
}

const stubAdmin = {
  rpc: (fn: string, args: Record<string, unknown>) => {
    if (fn === 'encrypt_connector_token') {
      return Promise.resolve({ data: `enc:${String(args.plaintext)}`, error: null });
    }
    if (fn === 'decrypt_connector_token') {
      const ct = String(args.ciphertext);
      return Promise.resolve({ data: ct.replace(/^enc:/, ''), error: null });
    }
    return Promise.resolve({ data: null, error: { message: `unknown rpc ${fn}` } });
  },
  from: (table: string) => {
    filterTrace.push(`from:${table}`);
    return {
      select: (_cols: string) => selectChain(),
      insert: (_row: Record<string, unknown>) => ({
        select: (_c: string) => ({
          single: () => Promise.resolve(nextResult()),
        }),
        // Some inserts don't chain .select — return a thenable.
        then: <T,>(onfulfilled: (v: QueuedQueryResult) => T) =>
          Promise.resolve(onfulfilled(nextResult())),
      }),
    };
  },
};

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => stubAdmin,
}));

const fakeClient: HubspotUserClient = {
  createDeal: vi.fn(async () => ({ id: 'deal-NEW-1' })),
  createCompany: vi.fn(async () => ({ id: 'company-NEW-1' })),
  associateDealCompany: vi.fn(async () => undefined),
  findOrCreateContactByEmail: vi.fn(async () => ({ id: 'contact-NEW-1', created: true })),
  associateDealContact: vi.fn(async () => undefined),
  createNote: vi.fn(async () => ({ id: 'note-1' })),
  // Gate 12F: lazy property-provisioning calls request() on cold portals.
  // Returning a non-empty object short-circuits the GET-then-create flow
  // (every property is treated as already present), so this orchestration
  // suite stays focused on the deal/company/contact flow.
  request: vi.fn(async () => ({ name: 'present' })) as unknown as HubspotUserClient['request'],
};

import { pushLeadDeal } from '../../lib/hubspot/lead-deal';

const baseProjectRow = {
  id: 'sam.gov:TXDOT-I45-2026-001',
  source: 'sam.gov',
  source_id: 'TXDOT-I45-2026-001',
  title: 'TxDOT I-45 corridor',
  summary: 'Federal highway',
  lat: 29.83,
  lon: -95.35,
  project_value: 4_200_000,
  project_stage: 'Pre-bid',
  posted_date: '2026-04-15T00:00:00.000Z',
  raw_payload: null,
  rationale: 'High-value',
  rationale_streamed_at: null,
  score: 92,
  nearest_branch_id: null,
  distance_miles: null,
  outreach_hook: null,
  warm_for_customer_id: null,
  ingested_at: '2026-04-15T00:00:00.000Z',
  ranked_at: null,
};

describe('pushLeadDeal', () => {
  const originalKey = process.env.CONNECTOR_TOKEN_KEY;

  beforeEach(() => {
    process.env.CONNECTOR_TOKEN_KEY = 'a'.repeat(64);
    queryResults.length = 0;
    filterTrace.length = 0;
    for (const fn of Object.values(fakeClient)) {
      if (typeof fn === 'function' && 'mockClear' in fn) {
        (fn as unknown as { mockClear: () => void }).mockClear();
      }
    }
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.CONNECTOR_TOKEN_KEY;
    else process.env.CONNECTOR_TOKEN_KEY = originalKey;
  });

  function queueConnection(userId: string, portalId: string) {
    queryResults.push({
      data: {
        id: `uc-${userId}`,
        user_id: userId,
        provider: 'hubspot',
        email: null,
        portal_id: portalId,
        portal_name: `${portalId}-portal`,
        oauth_token_enc: 'enc:access-token',
        oauth_refresh_token_enc: 'enc:refresh-token',
        scope: ['crm.objects.deals.write'],
        connected_at: '2026-05-03T12:00:00Z',
        // Far future so the gate 12I refresh-on-expiry path doesn't
        // trigger here; the orchestration suite uses fresh tokens.
        expires_at: '2099-01-01T00:00:00Z',
        status: 'active',
      },
      error: null,
    });
  }

  it('returns no_connection when the user has no active row', async () => {
    queryResults.push({ data: null, error: null });
    const out = await pushLeadDeal({
      projectId: 'sam.gov:TXDOT-I45-2026-001',
      userId: 'alice@zedcor.com',
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('no_connection');
  });

  it('short-circuits idempotently when an existing lead_hubspot_deals row exists', async () => {
    queueConnection('alice@zedcor.com', 'portal-A');
    // loadProject:
    queryResults.push({ data: baseProjectRow, error: null });
    // loadExistingPush — return a row
    queryResults.push({
      data: {
        id: 'lhd-existing',
        project_id: baseProjectRow.id,
        user_id: 'alice@zedcor.com',
        portal_id: 'portal-A',
        hubspot_deal_id: 'deal-EXISTING-7',
        hubspot_deal_url: 'https://app.hubspot.com/contacts/portal-A/deal/deal-EXISTING-7',
        hubspot_company_id: null,
        pushed_at: '2026-05-03T13:00:00Z',
        status: 'active',
      },
      error: null,
    });

    const out = await pushLeadDeal({
      projectId: baseProjectRow.id,
      userId: 'alice@zedcor.com',
      clientOverride: fakeClient,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.idempotent).toBe(true);
      expect(out.hubspot_deal_id).toBe('deal-EXISTING-7');
    }
    expect(fakeClient.createDeal).not.toHaveBeenCalled();
  });

  it('creates deal + company + contact on the happy path', async () => {
    queueConnection('alice@zedcor.com', 'portal-A');
    // loadProject
    queryResults.push({ data: baseProjectRow, error: null });
    // loadExistingPush — null
    queryResults.push({ data: null, error: null });
    // loadBranchForProject — null branch
    // (project.nearest_branch_id is null in baseProjectRow → no DB call)
    // loadLeadContacts — one contact
    queryResults.push({
      data: [
        {
          id: 'lc-1',
          project_id: baseProjectRow.id,
          contact_name: 'Alice McDermott',
          email: 'alice@example.com',
          phone: null,
          role: 'Director',
        },
      ],
      error: null,
    });
    // insertLeadContactLink (no-op insert)
    queryResults.push({ data: null, error: null });
    // insertLeadDeal — returns full row
    queryResults.push({
      data: {
        id: 'lhd-NEW-1',
        project_id: baseProjectRow.id,
        user_id: 'alice@zedcor.com',
        portal_id: 'portal-A',
        hubspot_deal_id: 'deal-NEW-1',
        hubspot_deal_url: 'https://app.hubspot.com/contacts/portal-A/deal/deal-NEW-1',
        hubspot_company_id: 'company-NEW-1',
        pushed_at: new Date().toISOString(),
        status: 'active',
      },
      error: null,
    });

    const out = await pushLeadDeal({
      projectId: baseProjectRow.id,
      userId: 'alice@zedcor.com',
      clientOverride: fakeClient,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.idempotent).toBe(false);
      expect(out.hubspot_deal_id).toBe('deal-NEW-1');
      expect(out.contacts_pushed).toBe(1);
    }
    expect(fakeClient.createDeal).toHaveBeenCalledTimes(1);
    expect(fakeClient.createCompany).toHaveBeenCalledTimes(1);
    expect(fakeClient.findOrCreateContactByEmail).toHaveBeenCalledTimes(1);
    expect(fakeClient.associateDealContact).toHaveBeenCalledTimes(1);
  });

  it('multi-tenant: filter trace for user B never references user A', async () => {
    queueConnection('bob@zedcor.com', 'portal-B');
    queryResults.push({ data: null, error: null }); // loadProject → null
    const out = await pushLeadDeal({
      projectId: 'sam.gov:TXDOT-I45-2026-001',
      userId: 'bob@zedcor.com',
      clientOverride: fakeClient,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('no_project');
    expect(filterTrace).toContain('eq:user_id=bob@zedcor.com');
    expect(filterTrace.some((t) => t.includes('alice@zedcor.com'))).toBe(false);
  });
});
