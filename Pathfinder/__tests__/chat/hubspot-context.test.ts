// __tests__/chat/hubspot-context.test.ts — Gate 22.
// Pure-function tests for the HubSpot summary block injected into the
// chat agent's system prompt. No DB, no network — the loader proper
// (loadHubSpotForUser in app/api/chat/route.ts) is integration-tested
// via the chat E2E, not here.

import { describe, it, expect } from 'vitest';
import {
  summarizeHubSpotForChat,
  type HubSpotChatContext,
  type HubSpotConnectionSnapshot,
  type HubSpotDealRowSnapshot,
} from '@/lib/chat/hubspot-context';

const conn = (over: Partial<HubSpotConnectionSnapshot> = {}): HubSpotConnectionSnapshot => ({
  provider: 'hubspot',
  status: 'active',
  portal_id: '12345',
  portal_name: 'Zedcor Security HubSpot',
  connected_at: '2026-04-15T00:00:00Z',
  expires_at: null,
  ...over,
});

const deal = (over: Partial<HubSpotDealRowSnapshot> = {}): HubSpotDealRowSnapshot => ({
  project_id: 'sam.gov:abc123',
  hubspot_deal_id: 'hs-1',
  hubspot_deal_url: 'https://app.hubspot.com/contacts/12345/deal/hs-1',
  pushed_at: '2026-05-01T00:00:00Z',
  last_synced_at: '2026-05-04T00:00:00Z',
  current_stage: 'qualifiedtobuy',
  current_stage_label: 'Qualified to Buy',
  current_amount: 250000,
  current_owner_name: 'Kyle Kesterson',
  last_activity_at: '2026-05-03T12:00:00Z',
  status: 'active',
  ...over,
});

describe('summarizeHubSpotForChat', () => {
  it('emits the not-connected line when connection is null', () => {
    const ctx: HubSpotChatContext = {
      connection: null,
      totalDeals: 0,
      byStage: {},
      recent: [],
      stalledCount: 0,
      stalledOlderThan: null,
    };
    const out = summarizeHubSpotForChat(ctx);
    expect(out).toContain('not connected');
    expect(out).toContain('/pathfinder/settings/connectors');
    // No fabricated counts.
    expect(out).not.toContain('TOTAL DEALS');
  });

  it('emits portal name + connected_at + total deals when connected', () => {
    const ctx: HubSpotChatContext = {
      connection: conn(),
      totalDeals: 4,
      byStage: { 'Qualified to Buy': 2, 'Closed Won': 1, 'Lost': 1 },
      recent: [deal()],
      stalledCount: 0,
      stalledOlderThan: '2026-04-21T00:00:00Z',
    };
    const out = summarizeHubSpotForChat(ctx);
    expect(out).toContain('Zedcor Security HubSpot (portal 12345)');
    expect(out).toContain('connected_at=2026-04-15T00:00:00Z');
    expect(out).toContain('HUBSPOT TOTAL DEALS PUSHED: 4');
    expect(out).toContain('Qualified to Buy=2');
    expect(out).toContain('Closed Won=1');
    expect(out).toContain('Lost=1');
  });

  it('flags expired connection so the agent prompts for reconnect', () => {
    const ctx: HubSpotChatContext = {
      connection: conn({ status: 'expired' }),
      totalDeals: 0,
      byStage: {},
      recent: [],
      stalledCount: 0,
      stalledOlderThan: null,
    };
    const out = summarizeHubSpotForChat(ctx);
    expect(out).toContain('connection is expired');
    expect(out).toContain('/pathfinder/settings/connectors');
  });

  it('reports stalled deals when stalledCount > 0', () => {
    const ctx: HubSpotChatContext = {
      connection: conn(),
      totalDeals: 3,
      byStage: { 'Qualified to Buy': 3 },
      recent: [deal()],
      stalledCount: 2,
      stalledOlderThan: '2026-04-21T00:00:00Z',
    };
    const out = summarizeHubSpotForChat(ctx);
    expect(out).toContain('HUBSPOT STALLED DEALS');
    expect(out).toContain('2026-04-21T00:00:00Z');
    expect(out).toContain('2.');
  });

  it('omits the stalled line when stalledCount is 0', () => {
    const ctx: HubSpotChatContext = {
      connection: conn(),
      totalDeals: 1,
      byStage: { 'Qualified to Buy': 1 },
      recent: [deal()],
      stalledCount: 0,
      stalledOlderThan: '2026-04-21T00:00:00Z',
    };
    const out = summarizeHubSpotForChat(ctx);
    expect(out).not.toContain('HUBSPOT STALLED DEALS');
  });

  it('serializes recent deals as JSON with deal URL preserved', () => {
    const recent = [
      deal({
        project_id: 'sam.gov:flagship',
        hubspot_deal_url: 'https://app.hubspot.com/contacts/12345/deal/hs-flagship',
      }),
    ];
    const out = summarizeHubSpotForChat({
      connection: conn(),
      totalDeals: 1,
      byStage: { 'Qualified to Buy': 1 },
      recent,
      stalledCount: 0,
      stalledOlderThan: '2026-04-21T00:00:00Z',
    });
    expect(out).toContain('HUBSPOT RECENT DEALS:');
    expect(out).toContain('sam.gov:flagship');
    expect(out).toContain('hs-flagship');
  });

  it('tells the agent to cite lead_hubspot_deals in the TABLES footer', () => {
    const out = summarizeHubSpotForChat({
      connection: conn(),
      totalDeals: 1,
      byStage: { 'Qualified to Buy': 1 },
      recent: [deal()],
      stalledCount: 0,
      stalledOlderThan: '2026-04-21T00:00:00Z',
    });
    expect(out).toContain('lead_hubspot_deals');
  });

  it('does not leak token columns (the snapshot type has no slot for them)', () => {
    // Type-level guarantee: HubSpotConnectionSnapshot has no oauth_*
    // fields. The summary should never reference them either.
    const out = summarizeHubSpotForChat({
      connection: conn(),
      totalDeals: 0,
      byStage: {},
      recent: [],
      stalledCount: 0,
      stalledOlderThan: null,
    });
    expect(out).not.toMatch(/oauth_token/i);
    expect(out).not.toMatch(/refresh_token/i);
  });

  it('handles 0 deals connected — by-stage line says (none yet)', () => {
    const out = summarizeHubSpotForChat({
      connection: conn(),
      totalDeals: 0,
      byStage: {},
      recent: [],
      stalledCount: 0,
      stalledOlderThan: '2026-04-21T00:00:00Z',
    });
    expect(out).toContain('HUBSPOT BY STAGE: (none yet');
  });
});
