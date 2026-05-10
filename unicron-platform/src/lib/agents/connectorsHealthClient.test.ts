import { describe, expect, it } from 'vitest';
import { __computeRollup } from './connectorsHealthClient';
import type {
  ConnectorRowRaw,
  ConnectorAuditEventRaw,
} from './connectorsHealthClient';

describe('__computeRollup (pure aggregate)', () => {
  const now = new Date('2026-05-03T12:00:00.000Z');
  const hourAgo = (h: number) =>
    new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();

  const baseRows: ConnectorRowRaw[] = [
    {
      id: 'c1',
      customer_org_id: 'org-a',
      connector_type: 'slack',
      status: 'connected',
      account_name: 'Acme Slack',
      last_error: null,
    },
    {
      id: 'c2',
      customer_org_id: 'org-a',
      connector_type: 'hubspot',
      status: 'expired',
      account_name: 'Acme HS',
      last_error: 'token expired',
    },
    {
      id: 'c3',
      customer_org_id: 'org-b',
      connector_type: 'teams',
      status: 'error',
      account_name: null,
      last_error: 'oauth refused',
    },
    {
      id: 'c4',
      customer_org_id: 'org-b',
      connector_type: 'slack',
      status: 'connected',
      account_name: 'Bravo Slack',
      last_error: null,
    },
  ];

  it('totals.connectors counts every row; totals.customers counts unique orgs', () => {
    const r = __computeRollup(baseRows, [], now);
    expect(r.totals.connectors).toBe(4);
    expect(r.totals.customers).toBe(2);
  });

  it('byType maps connector_type → count and treats unknown types as `other`', () => {
    const rows: ConnectorRowRaw[] = [
      ...baseRows,
      {
        id: 'c5',
        customer_org_id: 'org-c',
        connector_type: 'salesforce',
        status: 'connected',
        account_name: null,
        last_error: null,
      },
    ];
    const r = __computeRollup(rows, [], now);
    expect(r.byType.slack).toBe(2);
    expect(r.byType.hubspot).toBe(1);
    expect(r.byType.teams).toBe(1);
    expect(r.byType.other).toBe(1);
  });

  it('byStatus maps `connected` → `active` and surfaces every canonical bucket', () => {
    const r = __computeRollup(baseRows, [], now);
    expect(r.byStatus.active).toBe(2); // both `connected` rows
    expect(r.byStatus.expired).toBe(1);
    expect(r.byStatus.error).toBe(1);
    expect(r.byStatus.pending).toBe(0);
    expect(r.byStatus.disconnected).toBe(0);
    expect(r.byStatus.revoked).toBe(0);
    expect(r.byStatus.unknown).toBe(0);
  });

  it('errorRate24h counts only events inside the 24h window', () => {
    const events: ConnectorAuditEventRaw[] = [
      // 24h-window events
      { connector_id: 'c1', status: 'sent', created_at: hourAgo(1) },
      { connector_id: 'c1', status: 'succeeded', created_at: hourAgo(2) },
      { connector_id: 'c2', status: 'failed', created_at: hourAgo(3) },
      { connector_id: 'c3', status: 'failed', created_at: hourAgo(10) },
      // outside the window — must be excluded
      { connector_id: 'c1', status: 'failed', created_at: hourAgo(48) },
      { connector_id: 'c1', status: 'sent', created_at: hourAgo(72) },
    ];
    const r = __computeRollup(baseRows, events, now);
    expect(r.errorRate24h.total_events).toBe(4);
    expect(r.errorRate24h.failed_events).toBe(2);
    expect(r.errorRate24h.rate).toBeCloseTo(0.5, 5);
  });

  it('errorRate24h.rate is 0 when no events in the window (no NaN leak)', () => {
    const r = __computeRollup(baseRows, [], now);
    expect(r.errorRate24h.total_events).toBe(0);
    expect(r.errorRate24h.failed_events).toBe(0);
    expect(r.errorRate24h.rate).toBe(0);
  });

  it('mostRecentSuccessByConnector picks the latest succeeded/sent timestamp per connector', () => {
    const events: ConnectorAuditEventRaw[] = [
      { connector_id: 'c1', status: 'succeeded', created_at: hourAgo(5) },
      { connector_id: 'c1', status: 'sent', created_at: hourAgo(2) }, // newest success
      { connector_id: 'c1', status: 'failed', created_at: hourAgo(1) }, // ignored
      { connector_id: 'c2', status: 'failed', created_at: hourAgo(3) }, // no success
      { connector_id: 'c3', status: 'received', created_at: hourAgo(4) },
    ];
    const r = __computeRollup(baseRows, events, now);
    const byId = new Map(r.mostRecentSuccessByConnector.map((row) => [row.connector_id, row]));
    expect(byId.get('c1')?.last_success_at).toBe(hourAgo(2));
    expect(byId.get('c2')?.last_success_at).toBeNull();
    expect(byId.get('c3')?.last_success_at).toBe(hourAgo(4));
    expect(byId.get('c4')?.last_success_at).toBeNull();
    // every connector represented even when no events recorded
    expect(byId.size).toBe(4);
  });

  it('empty input does not crash and returns zeroed rollup', () => {
    const r = __computeRollup([], [], now);
    expect(r.totals.connectors).toBe(0);
    expect(r.totals.customers).toBe(0);
    expect(r.byType.slack).toBe(0);
    expect(r.byStatus.active).toBe(0);
    expect(r.errorRate24h.rate).toBe(0);
    expect(r.mostRecentSuccessByConnector).toEqual([]);
  });
});
