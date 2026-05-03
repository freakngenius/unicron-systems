import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listCustomerOrgs, getOrgHealth } from './customersClient';

describe('customersClient (mock-mode)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PATHFINDER_DB_ENABLED', 'false');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('listCustomerOrgs returns the Zedcor fixture in single-tenant mode', async () => {
    const orgs = await listCustomerOrgs();
    expect(orgs).toHaveLength(1);
    expect(orgs[0].id).toBe('zedcor');
    expect(orgs[0].status).toBe('active');
  });

  it('getOrgHealth returns the rollup fixture with 30-day arrays', async () => {
    const h = await getOrgHealth('zedcor');
    expect(h.org_id).toBe('zedcor');
    expect(h.lead_volume_30d).toHaveLength(30);
    expect(h.error_volume_30d).toHaveLength(30);
    expect(h.lead_volume_7d_total).toBe(
      h.lead_volume_30d.slice(-7).reduce((a, b) => a + b, 0),
    );
    expect(h.recent_errors.length).toBeLessThanOrEqual(10);
    expect(h.active_sources.length).toBeGreaterThan(0);
  });

  it('getOrgHealth carries the orgId parameter through into the rollup', async () => {
    const h = await getOrgHealth('some-other-org');
    expect(h.org_id).toBe('some-other-org');
  });
});
