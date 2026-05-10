import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetLocalCustomerOrgsForTests,
  createCustomerOrg,
  getCustomerOrgBySlug,
  getOrgHealth,
  listCustomerOrgs,
  slugify,
  validateSlug,
} from './customersClient';
import { SlugConflictError } from './contracts/customers';

describe('customersClient (mock-mode)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PATHFINDER_DB_ENABLED', 'false');
    vi.stubEnv('VITE_CUSTOMER_PERSISTENCE_ENABLED', 'false');
    __resetLocalCustomerOrgsForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetLocalCustomerOrgsForTests();
  });

  it('listCustomerOrgs returns the Zedcor fixture in single-tenant mode', async () => {
    const orgs = await listCustomerOrgs();
    expect(orgs).toHaveLength(1);
    expect(orgs[0].id).toBe('zedcor');
    expect(orgs[0].slug).toBe('zedcor');
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

describe('slugify + validateSlug', () => {
  it('slugify lowercases, trims, replaces spaces with hyphens, drops punctuation', () => {
    expect(slugify('Public Adjuster Co.')).toBe('public-adjuster-co');
    expect(slugify('  Storm Damage --- Recovery  ')).toBe('storm-damage-recovery');
    expect(slugify("McGill's & Sons, LLC")).toBe('mcgills-sons-llc');
  });

  it('slugify caps at 40 characters', () => {
    const long = 'a'.repeat(60);
    expect(slugify(long).length).toBeLessThanOrEqual(40);
  });

  it('validateSlug rejects empty, invalid pattern, or duplicate', () => {
    expect(validateSlug('', [])).toMatch(/required/i);
    expect(validateSlug('Has Spaces', [])).toMatch(/lowercase/i);
    expect(validateSlug('-leading', [])).toMatch(/lowercase/i);
    expect(validateSlug('zedcor', ['zedcor'])).toMatch(/already taken/i);
    expect(validateSlug('valid-slug', [])).toBeNull();
  });
});

describe('createCustomerOrg (mock-mode persistence to localStorage)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PATHFINDER_DB_ENABLED', 'false');
    vi.stubEnv('VITE_CUSTOMER_PERSISTENCE_ENABLED', 'false');
    __resetLocalCustomerOrgsForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetLocalCustomerOrgsForTests();
  });

  it('persists a new org and surfaces it in subsequent listCustomerOrgs calls', async () => {
    const created = await createCustomerOrg({
      name: 'Acme Roofing',
      slug: 'acme-roofing',
      architecture: null,
    });
    expect(created.slug).toBe('acme-roofing');
    expect(created.display_name).toBe('Acme Roofing');
    expect(created.status).toBe('onboarding');

    const orgs = await listCustomerOrgs();
    const slugs = orgs.map((o) => o.slug);
    expect(slugs).toContain('zedcor');
    expect(slugs).toContain('acme-roofing');
  });

  it('throws SlugConflictError when slug collides with the seed Zedcor row', async () => {
    await expect(
      createCustomerOrg({
        name: 'Zedcor 2',
        slug: 'zedcor',
        architecture: null,
      }),
    ).rejects.toBeInstanceOf(SlugConflictError);
  });

  it('throws SlugConflictError when slug collides with a previously persisted org', async () => {
    await createCustomerOrg({
      name: 'Acme Roofing',
      slug: 'acme-roofing',
      architecture: null,
    });
    await expect(
      createCustomerOrg({
        name: 'Acme Roofing v2',
        slug: 'acme-roofing',
        architecture: null,
      }),
    ).rejects.toBeInstanceOf(SlugConflictError);
  });

  it('getCustomerOrgBySlug returns the persisted row by slug', async () => {
    await createCustomerOrg({
      name: 'Beta Builders',
      slug: 'beta-builders',
      architecture: null,
    });
    const org = await getCustomerOrgBySlug('beta-builders');
    expect(org?.slug).toBe('beta-builders');
    expect(org?.display_name).toBe('Beta Builders');
  });

  it('getCustomerOrgBySlug returns null for an unknown slug', async () => {
    const org = await getCustomerOrgBySlug('does-not-exist');
    expect(org).toBeNull();
  });
});
