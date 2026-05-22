// __tests__/agents/internal-adjacency.test.ts
//
// Stage 5 — Internal adjacency-mapper.
//
// Validates that the adjacency-mapper is INERT when no seed override is
// supplied and no UNICRON_INTERNAL_ADJACENCY_SEED_PATH is set, and that
// it computes overlaps correctly when a seed is provided.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  findInternalAdjacency,
  _resetAdjacencyCache,
  type InternalAdjacencySeed,
} from '@/lib/agents/internal/adjacency';

describe('findInternalAdjacency', () => {
  beforeEach(() => {
    delete process.env.UNICRON_INTERNAL_ADJACENCY_SEED_PATH;
    _resetAdjacencyCache();
  });

  it('returns active=false (inert) when no seed is available', async () => {
    const r = await findInternalAdjacency({
      project_id: 'p1',
      title: 'Acme Site Services',
      hq_state: 'TX',
    });
    expect(r.active).toBe(false);
    expect(r.customer_overlap).toEqual([]);
    expect(r.crm_contact_match).toEqual([]);
    expect(r.association_overlap).toEqual([]);
  });

  it('computes customer_overlap on matching state', async () => {
    const seed: InternalAdjacencySeed = {
      unicron_customers: [
        { name: 'Zedcor', state: 'TX', service_category: 'site-safety-services' },
        { name: 'OtherCo', state: 'CA' },
      ],
      crm_contacts: [],
      trade_associations: [],
    };
    const r = await findInternalAdjacency({
      project_id: 'p1',
      title: 'Acme Site Services',
      service_category: 'site-safety-services',
      hq_state: 'TX',
      seedOverride: seed,
    });
    expect(r.active).toBe(true);
    expect(r.customer_overlap.map((c) => c.customer_name)).toEqual(['Zedcor']);
  });

  it('computes crm_contact_match by company-name substring', async () => {
    const seed: InternalAdjacencySeed = {
      unicron_customers: [],
      crm_contacts: [{ name: 'Jane Doe', company: 'Acme Site Services', title: 'VP Sales' }],
      trade_associations: [],
    };
    const r = await findInternalAdjacency({
      project_id: 'p1',
      title: 'Acme Site Services LLC',
      seedOverride: seed,
    });
    expect(r.crm_contact_match).toHaveLength(1);
    expect(r.crm_contact_match[0].name).toBe('Jane Doe');
  });

  it('computes association_overlap by company-name substring', async () => {
    const seed: InternalAdjacencySeed = {
      unicron_customers: [],
      crm_contacts: [],
      trade_associations: [{ association: 'ARA', company: 'Acme Site Services' }],
    };
    const r = await findInternalAdjacency({
      project_id: 'p1',
      title: 'Acme Site Services',
      seedOverride: seed,
    });
    expect(r.association_overlap).toHaveLength(1);
    expect(r.association_overlap[0].association).toBe('ARA');
  });
});
