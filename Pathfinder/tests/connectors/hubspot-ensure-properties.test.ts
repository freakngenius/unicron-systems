// tests/connectors/hubspot-ensure-properties.test.ts — Gate 12F.
//
// Exercises the lazy-provisioning module that bootstraps the
// `pathfinder_*` deal property schema on a connected portal before the
// first push. Mocks at the HubspotUserClient.request level — the module
// under test is wire-protocol-aware but client-agnostic.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ensurePathfinderDealProperties,
  PATHFINDER_DEAL_PROPERTIES,
  __resetEnsurePropertiesCacheForTests,
} from '../../lib/hubspot/ensure-properties';
import {
  HubspotUserClientError,
  type HubspotUserClient,
} from '../../lib/hubspot/user-client';

interface RecordedCall {
  method: string;
  path: string;
  body?: unknown;
}

type Responder = (call: RecordedCall) => unknown | Promise<unknown>;

function makeStubClient(responder: Responder): { client: HubspotUserClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const client: HubspotUserClient = {
    createDeal: async () => ({ id: 'unused' }),
    createCompany: async () => ({ id: 'unused' }),
    associateDealCompany: async () => undefined,
    findOrCreateContactByEmail: async () => ({ id: 'unused', created: false }),
    associateDealContact: async () => undefined,
    createNote: async () => ({ id: 'unused' }),
    request: async <T,>(opts: { method: string; path: string; body?: unknown }): Promise<T> => {
      const call: RecordedCall = { method: opts.method, path: opts.path, body: opts.body };
      calls.push(call);
      return (await responder(call)) as T;
    },
  };
  return { client, calls };
}

function notFound(detail = 'PROPERTY_DOESNT_EXIST'): never {
  throw new HubspotUserClientError(404, detail);
}

beforeEach(() => {
  __resetEnsurePropertiesCacheForTests();
});

afterEach(() => {
  __resetEnsurePropertiesCacheForTests();
});

describe('ensurePathfinderDealProperties', () => {
  it('cold portal: creates the group + every property exactly once', async () => {
    const { client, calls } = makeStubClient((call) => {
      // GET on group → 404 (cold). POST creates it.
      if (call.method === 'GET' && call.path.startsWith('/crm/v3/properties/deals/groups/')) {
        notFound();
      }
      if (call.method === 'POST' && call.path === '/crm/v3/properties/deals/groups') {
        return { name: 'pathfinderinformation' };
      }
      // GET on each property → 404. POST creates it.
      if (call.method === 'GET' && call.path.startsWith('/crm/v3/properties/deals/')) {
        notFound();
      }
      if (call.method === 'POST' && call.path === '/crm/v3/properties/deals') {
        return { name: (call.body as { name: string }).name };
      }
      throw new Error(`unexpected call: ${call.method} ${call.path}`);
    });

    await ensurePathfinderDealProperties(client, 'portal-cold');

    const groupGets = calls.filter(
      (c) => c.method === 'GET' && c.path.startsWith('/crm/v3/properties/deals/groups/'),
    );
    const groupPosts = calls.filter(
      (c) => c.method === 'POST' && c.path === '/crm/v3/properties/deals/groups',
    );
    expect(groupGets).toHaveLength(1);
    expect(groupPosts).toHaveLength(1);

    const propertyPosts = calls.filter(
      (c) => c.method === 'POST' && c.path === '/crm/v3/properties/deals',
    );
    expect(propertyPosts).toHaveLength(PATHFINDER_DEAL_PROPERTIES.length);
    // Every defined property name was POSTed
    const postedNames = propertyPosts.map((c) => (c.body as { name: string }).name).sort();
    const expectedNames = PATHFINDER_DEAL_PROPERTIES.map((p) => p.name).sort();
    expect(postedNames).toEqual(expectedNames);
  });

  it('warm portal: GETs find every property; no POSTs are issued', async () => {
    const { client, calls } = makeStubClient((call) => {
      // Everything exists.
      if (call.method === 'GET' && call.path.startsWith('/crm/v3/properties/deals/groups/')) {
        return { name: 'pathfinderinformation' };
      }
      if (call.method === 'GET' && call.path.startsWith('/crm/v3/properties/deals/')) {
        return { name: 'present' };
      }
      throw new Error(`unexpected call: ${call.method} ${call.path}`);
    });

    await ensurePathfinderDealProperties(client, 'portal-warm');

    expect(calls.every((c) => c.method === 'GET')).toBe(true);
    expect(calls).toHaveLength(1 + PATHFINDER_DEAL_PROPERTIES.length);
  });

  it('idempotent: second call within the same process makes zero new calls', async () => {
    let invocations = 0;
    const { client } = makeStubClient((call) => {
      invocations += 1;
      if (call.method === 'GET') return { name: 'present' };
      return { name: 'created' };
    });

    await ensurePathfinderDealProperties(client, 'portal-cache');
    const afterFirst = invocations;
    await ensurePathfinderDealProperties(client, 'portal-cache');
    expect(invocations).toBe(afterFirst);
  });

  it('different portal_ids are cached independently', async () => {
    let invocations = 0;
    const { client } = makeStubClient((call) => {
      invocations += 1;
      if (call.method === 'GET') return { name: 'present' };
      return { name: 'created' };
    });

    await ensurePathfinderDealProperties(client, 'portal-A');
    const afterA = invocations;
    await ensurePathfinderDealProperties(client, 'portal-B');
    expect(invocations).toBeGreaterThan(afterA);
  });

  it('treats 409 PROPERTY_ALREADY_EXISTS on create as success (race-tolerant)', async () => {
    const { client } = makeStubClient((call) => {
      if (call.method === 'GET') notFound();
      // Both group and property POSTs report concurrent-create.
      throw new HubspotUserClientError(409, 'PROPERTY_ALREADY_EXISTS');
    });
    await expect(ensurePathfinderDealProperties(client, 'portal-race')).resolves.toBeUndefined();
  });

  it('surfaces 403 from properties API as a thrown error and evicts cache', async () => {
    let phase: 'fail' | 'pass' = 'fail';
    const { client } = makeStubClient((call) => {
      if (phase === 'fail') {
        throw new HubspotUserClientError(403, 'missing scope crm.schemas.deals.write');
      }
      if (call.method === 'GET') return { name: 'present' };
      return { name: 'created' };
    });

    await expect(ensurePathfinderDealProperties(client, 'portal-403')).rejects.toBeInstanceOf(
      HubspotUserClientError,
    );

    // Eviction: second attempt re-runs (doesn't return the cached failure).
    phase = 'pass';
    await expect(ensurePathfinderDealProperties(client, 'portal-403')).resolves.toBeUndefined();
  });

  it('concurrent first-push within a process collapses onto one in-flight ensure', async () => {
    let invocations = 0;
    const { client } = makeStubClient((call) => {
      invocations += 1;
      if (call.method === 'GET') return { name: 'present' };
      return { name: 'created' };
    });

    await Promise.all([
      ensurePathfinderDealProperties(client, 'portal-concurrent'),
      ensurePathfinderDealProperties(client, 'portal-concurrent'),
      ensurePathfinderDealProperties(client, 'portal-concurrent'),
    ]);

    // Without the in-flight cache, this would be 3× the per-portal call count.
    // With it: exactly the per-portal call count.
    expect(invocations).toBe(1 + PATHFINDER_DEAL_PROPERTIES.length);
  });

  it('every defined property has a sane HubSpot type + fieldType', () => {
    // Sanity: the spec gates this — wrong types reproduce the bug under
    // a different errno (TYPE_MISMATCH instead of PROPERTY_DOESNT_EXIST).
    for (const def of PATHFINDER_DEAL_PROPERTIES) {
      expect(def.name).toMatch(/^pathfinder_[a-z_]+$/);
      expect(def.label.length).toBeGreaterThan(0);
      expect(['string', 'number']).toContain(def.type);
      expect(['text', 'number']).toContain(def.fieldType);
    }
  });

  it('property POST body carries the pathfinderinformation group + label', async () => {
    const { client, calls } = makeStubClient((call) => {
      if (call.method === 'GET') notFound();
      return { name: 'created' };
    });

    await ensurePathfinderDealProperties(client, 'portal-shape');

    const propPosts = calls.filter(
      (c) => c.method === 'POST' && c.path === '/crm/v3/properties/deals',
    );
    for (const c of propPosts) {
      const body = c.body as { groupName: string; label: string; type: string };
      expect(body.groupName).toBe('pathfinderinformation');
      expect(body.label.length).toBeGreaterThan(0);
      expect(['string', 'number']).toContain(body.type);
    }
    // Suppress `vi` unused-import warning under strict tsconfigs.
    void vi;
  });
});
