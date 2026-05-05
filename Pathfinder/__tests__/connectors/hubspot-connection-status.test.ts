// __tests__/connectors/hubspot-connection-status.test.ts — hot-fix.
//
// Unified getHubspotConnectionStatus helper. Mocks the underlying
// getActiveHubspotConnection so the helper's expiry math + null-handling
// is exercised without a live DB.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getHubspotConnectionStatus } from '@/lib/connectors/connection-status';

vi.mock('@/lib/connectors/user-connection', () => ({
  getActiveHubspotConnection: vi.fn(),
}));

import { getActiveHubspotConnection } from '@/lib/connectors/user-connection';

const mocked = getActiveHubspotConnection as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mocked.mockReset();
});

afterEach(() => {
  mocked.mockReset();
});

describe('getHubspotConnectionStatus', () => {
  it('returns NOT_CONNECTED when userId is null', async () => {
    const out = await getHubspotConnectionStatus(null);
    expect(out.connected).toBe(false);
    expect(out.expired).toBe(false);
    expect(out.status).toBe('none');
    expect(out.portalId).toBeNull();
    expect(mocked).not.toHaveBeenCalled();
  });

  it('returns NOT_CONNECTED when no active connection exists', async () => {
    mocked.mockResolvedValueOnce(null);
    const out = await getHubspotConnectionStatus('kyle@demystified.ai');
    expect(out.connected).toBe(false);
    expect(out.status).toBe('none');
  });

  it('returns connected=true when active and expires_at is in the future', async () => {
    const future = new Date(Date.now() + 60 * 60_000).toISOString();
    mocked.mockResolvedValueOnce({
      id: 'conn-1',
      user_id: 'kyle@demystified.ai',
      provider: 'hubspot',
      email: 'kyle@demystified.ai',
      portal_id: '12345',
      portal_name: 'Zedcor Security',
      tenant_id: null,
      scope: ['crm.objects.deals.write'],
      connected_at: '2026-04-15T00:00:00Z',
      expires_at: future,
      status: 'active',
    });
    const out = await getHubspotConnectionStatus('kyle@demystified.ai');
    expect(out.connected).toBe(true);
    expect(out.expired).toBe(false);
    expect(out.status).toBe('active');
    expect(out.portalId).toBe('12345');
    expect(out.portalName).toBe('Zedcor Security');
    expect(out.connectedAt).toBe('2026-04-15T00:00:00Z');
  });

  it('returns connected=false + expired=true when expires_at is in the past', async () => {
    const past = new Date(Date.now() - 60 * 60_000).toISOString();
    mocked.mockResolvedValueOnce({
      id: 'conn-2',
      user_id: 'kyle@demystified.ai',
      provider: 'hubspot',
      email: null,
      portal_id: '12345',
      portal_name: null,
      tenant_id: null,
      scope: null,
      connected_at: '2026-04-15T00:00:00Z',
      expires_at: past,
      status: 'active',
    });
    const out = await getHubspotConnectionStatus('kyle@demystified.ai');
    expect(out.connected).toBe(false);
    expect(out.expired).toBe(true);
    expect(out.status).toBe('expired');
  });

  it('treats missing expires_at as not-expired (long-lived token)', async () => {
    mocked.mockResolvedValueOnce({
      id: 'conn-3',
      user_id: 'kyle@demystified.ai',
      provider: 'hubspot',
      email: null,
      portal_id: '12345',
      portal_name: null,
      tenant_id: null,
      scope: null,
      connected_at: '2026-04-15T00:00:00Z',
      expires_at: null,
      status: 'active',
    });
    const out = await getHubspotConnectionStatus('kyle@demystified.ai');
    expect(out.connected).toBe(true);
    expect(out.expired).toBe(false);
    expect(out.status).toBe('active');
  });

  it('passes the userId through to the underlying lookup (multi-tenant boundary)', async () => {
    mocked.mockResolvedValueOnce(null);
    await getHubspotConnectionStatus('user-A@example.com');
    expect(mocked).toHaveBeenCalledWith('user-A@example.com');
  });
});
