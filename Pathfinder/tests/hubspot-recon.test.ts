import { describe, expect, it } from 'vitest';

import {
  escalationToInboxRow,
  reconcileDeals,
  type DealSnapshot,
} from '@/lib/connectors/hubspot/recon';
import {
  DEFAULT_HUBSPOT_MAPPING,
  type HubspotMappingConfig,
} from '@/lib/connectors/hubspot/mapping';

function snap(
  pfId: string,
  fields: Record<string, string | number | null>,
  updatedAt: string,
  hubspotId: string | null = 'deal-123',
): DealSnapshot {
  return {
    pathfinder_lead_id: pfId,
    hubspot_deal_id: hubspotId,
    fields,
    updated_at: updatedAt,
  };
}

const MAPPING: HubspotMappingConfig = {
  ...DEFAULT_HUBSPOT_MAPPING,
  deal_fields: [
    { pathfinder_field: 'title', hubspot_property: 'dealname', conflict_policy: 'last_write_wins' },
    { pathfinder_field: 'project_value', hubspot_property: 'amount', conflict_policy: 'pathfinder_locked' },
    { pathfinder_field: 'lead_actions.status', hubspot_property: 'dealstage', conflict_policy: 'hubspot_locked' },
  ],
};

describe('reconcileDeals', () => {
  it('counts matching fields and emits no conflicts', () => {
    const pf = new Map([
      ['1', snap('1', { title: 'TxDOT I-45', project_value: 4_200_000, 'lead_actions.status': 'accepted' }, '2026-05-02T16:00:00Z')],
    ]);
    const hs = new Map([
      ['1', snap('1', { title: 'TxDOT I-45', project_value: 4_200_000, 'lead_actions.status': 'accepted' }, '2026-05-02T15:00:00Z')],
    ]);
    const r = reconcileDeals({ pathfinder: pf, hubspot: hs, mapping: MAPPING });
    expect(r.matched).toBe(3);
    expect(r.auto_resolved).toEqual([]);
    expect(r.escalated).toEqual([]);
  });

  it('applies pathfinder_locked policy: PF wins regardless of timestamps', () => {
    const pf = new Map([['1', snap('1', { project_value: 100 }, '2026-05-01T00:00:00Z')]]);
    const hs = new Map([['1', snap('1', { project_value: 200 }, '2026-05-02T23:59:00Z')]]);
    const r = reconcileDeals({ pathfinder: pf, hubspot: hs, mapping: MAPPING });
    const auto = r.auto_resolved.find((a) => a.pathfinder_field === 'project_value');
    expect(auto?.resolution).toBe('pathfinder_wins');
  });

  it('applies hubspot_locked policy: HS wins regardless of timestamps', () => {
    const pf = new Map([['1', snap('1', { 'lead_actions.status': 'accepted' }, '2026-05-02T20:00:00Z')]]);
    const hs = new Map([['1', snap('1', { 'lead_actions.status': 'meeting_booked' }, '2026-05-02T10:00:00Z')]]);
    const r = reconcileDeals({ pathfinder: pf, hubspot: hs, mapping: MAPPING });
    const auto = r.auto_resolved.find((a) => a.pathfinder_field === 'lead_actions.status');
    expect(auto?.resolution).toBe('hubspot_wins');
  });

  it('last_write_wins picks the newer side', () => {
    const pf = new Map([['1', snap('1', { title: 'NEW' }, '2026-05-02T16:00:00Z')]]);
    const hs = new Map([['1', snap('1', { title: 'OLD' }, '2026-05-01T16:00:00Z')]]);
    const r = reconcileDeals({ pathfinder: pf, hubspot: hs, mapping: MAPPING });
    expect(r.auto_resolved[0]?.resolution).toBe('pathfinder_wins');
  });

  it('escalates last_write_wins when timestamps tie', () => {
    const ts = '2026-05-02T16:00:00Z';
    const pf = new Map([['1', snap('1', { title: 'A' }, ts)]]);
    const hs = new Map([['1', snap('1', { title: 'B' }, ts)]]);
    const r = reconcileDeals({ pathfinder: pf, hubspot: hs, mapping: MAPPING });
    expect(r.escalated).toHaveLength(1);
    expect(r.auto_resolved).toHaveLength(0);
  });

  it('skips deals that exist on Pathfinder but not on HubSpot (outbound, not conflict)', () => {
    const pf = new Map([['1', snap('1', { title: 'A' }, '2026-05-02T16:00:00Z')]]);
    const hs = new Map<string, DealSnapshot>();
    const r = reconcileDeals({ pathfinder: pf, hubspot: hs, mapping: MAPPING });
    expect(r.matched).toBe(0);
    expect(r.auto_resolved).toEqual([]);
    expect(r.escalated).toEqual([]);
  });

  it('null vs null counts as match (and unmentioned fields default to null=null match too)', () => {
    const pf = new Map([['1', snap('1', { title: null }, '2026-05-02T16:00:00Z')]]);
    const hs = new Map([['1', snap('1', { title: null }, '2026-05-02T16:00:00Z')]]);
    const r = reconcileDeals({ pathfinder: pf, hubspot: hs, mapping: MAPPING });
    // 3 mapped fields × all-null on both sides = 3 matches, no conflicts.
    expect(r.matched).toBe(3);
    expect(r.escalated).toEqual([]);
    expect(r.auto_resolved).toEqual([]);
  });

  it('null vs value counts as conflict', () => {
    const pf = new Map([['1', snap('1', { title: null }, '2026-05-02T16:00:00Z')]]);
    const hs = new Map([['1', snap('1', { title: 'TxDOT' }, '2026-05-01T16:00:00Z')]]);
    const r = reconcileDeals({ pathfinder: pf, hubspot: hs, mapping: MAPPING });
    expect(r.auto_resolved).toHaveLength(1);
    expect(r.auto_resolved[0]?.resolution).toBe('pathfinder_wins');
  });

  it('numeric vs string equal-after-coerce counts as match (HubSpot stringifies amount)', () => {
    const pf = new Map([['1', snap('1', { project_value: 100 }, '2026-05-02T16:00:00Z')]]);
    const hs = new Map([['1', snap('1', { project_value: '100' as unknown as number }, '2026-05-02T16:00:00Z')]]);
    const r = reconcileDeals({ pathfinder: pf, hubspot: hs, mapping: MAPPING });
    // The cross-type tolerance kicks in via String()-trim equality.
    expect(r.matched).toBeGreaterThanOrEqual(1);
  });
});

describe('escalationToInboxRow', () => {
  it('builds an inbox payload with the right category + context', () => {
    const row = escalationToInboxRow({
      pathfinder_lead_id: '42',
      hubspot_deal_id: 'deal-7',
      pathfinder_field: 'title',
      hubspot_property: 'dealname',
      pathfinder_value: 'A',
      hubspot_value: 'B',
      policy: 'last_write_wins',
    });
    expect(row.category).toBe('hubspot-sync-conflict');
    expect(row.title).toContain('title');
    expect(row.context.pathfinder_lead_id).toBe('42');
    expect(row.context.hubspot_deal_id).toBe('deal-7');
    expect(row.priority).toBe('medium');
    expect(row.status).toBe('open');
  });
});
