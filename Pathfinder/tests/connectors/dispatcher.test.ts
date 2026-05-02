// tests/connectors/dispatcher.test.ts — outbound event router.
//
// We test the routing/filtering/fail-open contract WITHOUT touching
// Supabase by using the dispatcher's __setDispatcherTestHooks seam:
// inject a fake rule loader and a fake send function, then verify
// dispatchEvent's counters reflect the expected behavior.
//
// The matchesFilter unit also gets direct coverage since the filter
// DSL has multiple branches (literal equal, comparator object, array
// membership, type mismatch).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetDispatcherTestHooks,
  __setDispatcherTestHooks,
  dispatchEvent,
  formatForConnector,
  matchesFilter,
} from '../../lib/connectors/dispatcher';
import type { ConnectorRow } from '../../lib/connectors/types';

function makeConnector(overrides: Partial<ConnectorRow> = {}): ConnectorRow {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    customer_org_id: 'zedcor',
    connector_type: 'slack',
    status: 'connected',
    account_name: 'Zedcor Workspace',
    account_external_id: 'T123',
    connected_at: '2026-05-01T00:00:00Z',
    disconnected_at: null,
    last_error: null,
    metadata: {},
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    rule: {
      id: 'rule-1',
      connector_id: '00000000-0000-0000-0000-000000000001',
      event_type: 'lead.high_score',
      channel_id: 'C123',
      channel_name: '#hot-leads',
      filter_json: {},
      quiet_hours_json: null,
      is_active: true,
      created_at: '2026-05-01T00:00:00Z',
      updated_at: '2026-05-01T00:00:00Z',
      ...(overrides.rule as Record<string, unknown> | undefined),
    },
    connector: makeConnector(overrides.connector as Partial<ConnectorRow> | undefined),
  };
}

describe('matchesFilter', () => {
  it('matches an empty filter', () => {
    expect(matchesFilter({ score: 50 }, {})).toBe(true);
    expect(matchesFilter({ score: 50 }, null)).toBe(true);
    expect(matchesFilter({ score: 50 }, undefined)).toBe(true);
  });

  it('literal equality on a primitive', () => {
    expect(matchesFilter({ stage: 'NEW' }, { stage: 'NEW' })).toBe(true);
    expect(matchesFilter({ stage: 'CONTACTED' }, { stage: 'NEW' })).toBe(false);
  });

  it('comparator >= on a number', () => {
    expect(matchesFilter({ score: 95 }, { score: { '>=': 90 } })).toBe(true);
    expect(matchesFilter({ score: 80 }, { score: { '>=': 90 } })).toBe(false);
  });

  it('array membership', () => {
    expect(matchesFilter({ region: 'AB' }, { region: ['AB', 'BC'] })).toBe(true);
    expect(matchesFilter({ region: 'ON' }, { region: ['AB', 'BC'] })).toBe(false);
  });

  it('rejects when comparator target is non-numeric', () => {
    expect(matchesFilter({ score: 'high' }, { score: { '>=': 90 } })).toBe(false);
  });
});

describe('formatForConnector (C-1A pass-through)', () => {
  it('returns a discriminator with the original payload', () => {
    const out = formatForConnector('slack', 'lead.high_score', { score: 95 });
    expect(out).toEqual({
      type: 'slack',
      eventType: 'lead.high_score',
      payload: { score: 95 },
    });
  });
});

describe('dispatchEvent', () => {
  beforeEach(() => {
    __resetDispatcherTestHooks();
  });
  afterEach(() => {
    __resetDispatcherTestHooks();
  });

  it('sends when filter matches and connector is connected', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    __setDispatcherTestHooks({
      loadRules: async () => [
        makeRule({
          rule: { filter_json: { score: { '>=': 90 } } },
        }),
      ],
      send,
    });
    const result = await dispatchEvent('zedcor', 'lead.high_score', { score: 95 });
    expect(result.rules_evaluated).toBe(1);
    expect(result.sent).toBe(1);
    expect(result.skipped_filter).toBe(0);
    expect(result.failed).toBe(0);
    expect(send).toHaveBeenCalledOnce();
  });

  it('skips when the filter does not match', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    __setDispatcherTestHooks({
      loadRules: async () => [
        makeRule({
          rule: { filter_json: { score: { '>=': 90 } } },
        }),
      ],
      send,
    });
    const result = await dispatchEvent('zedcor', 'lead.high_score', { score: 50 });
    expect(result.skipped_filter).toBe(1);
    expect(result.sent).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('skips when the connector status is not connected', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    __setDispatcherTestHooks({
      loadRules: async () => [
        makeRule({ connector: { status: 'disconnected' } }),
      ],
      send,
    });
    const result = await dispatchEvent('zedcor', 'lead.high_score', { score: 95 });
    expect(result.skipped_status).toBe(1);
    expect(result.sent).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('fails open: a send error is logged but not propagated; loop continues', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('slack 503'))
      .mockResolvedValueOnce(undefined);
    __setDispatcherTestHooks({
      loadRules: async () => [
        makeRule({ rule: { id: 'r1' } }),
        makeRule({ rule: { id: 'r2' } }),
      ],
      send,
    });
    const result = await dispatchEvent('zedcor', 'lead.high_score', { score: 95 });
    expect(result.rules_evaluated).toBe(2);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('returns zero counters when the rule loader throws', async () => {
    __setDispatcherTestHooks({
      loadRules: async () => {
        throw new Error('supabase down');
      },
    });
    const result = await dispatchEvent('zedcor', 'lead.high_score', {});
    expect(result.rules_evaluated).toBe(0);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('honors per-org isolation: rules for other orgs are filtered by the loader', async () => {
    // Verify the loader receives the orgId we passed (defense-in-depth
    // proof; the SQL query also enforces org match).
    let observedOrg: string | null = null;
    __setDispatcherTestHooks({
      loadRules: async (orgId: string) => {
        observedOrg = orgId;
        return [];
      },
    });
    await dispatchEvent('alpha-corp', 'lead.high_score', {});
    expect(observedOrg).toBe('alpha-corp');
  });
});
