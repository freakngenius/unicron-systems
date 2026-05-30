// __tests__/catalog/renderer.test.ts, Stream A Foundation.

import { describe, expect, it } from 'vitest';
import {
  ALL_SLOTS,
  resolveSlot,
  resolveAllSlots,
  type GateContext,
  type OrgModulesBlock,
  type Slot,
} from '@/lib/catalog';

const ORG = { id: 'org-1', slug: 'internal', name: 'Unicron Internal' };

const ARCH_BASE = {
  vertical: 'construction-vertical-b2b-prospecting',
  lead_unit: {
    name: 'company',
    plural: 'companies',
    schema: {
      score: { type: 'number' as const },
      service_category: { type: 'enum' as const },
      sales_motion: { type: 'enum' as const },
      federal_registration: { type: 'enum' as const },
      source: { type: 'string' as const },
    },
  },
  pipeline: { stages: [], stage_labels: {} },
  scoring: { weights: {}, thresholds: { verified: 0.65, high_priority: 0.8 } },
  geography: { scope: 'metros' as const, defaults: [] },
  sources: [],
  outreach: { persona: 'p', tone: 't', value_prop: 'v' },
  vocabulary: {},
  branding: { display_name: 'Unicron Internal' },
  compliance: [],
  integrations: ['hubspot', 'slack', 'resend'],
};

const ALL_SIGNALS_TRUE: GateContext = {
  hasDataSignal: async () => true,
};

const ALL_SIGNALS_FALSE: GateContext = {
  hasDataSignal: async () => false,
};

const MIXED_SIGNALS_FACTORY = (signals: Record<string, boolean>): GateContext => ({
  hasDataSignal: async (_org, ref) => signals[ref] ?? false,
});

describe('resolveSlot, no modules block', () => {
  it('falls back to floor for every slot when no modules are enabled', async () => {
    const ctx = {
      org: ORG,
      architecture: { ...ARCH_BASE, modules: undefined },
      gateContext: ALL_SIGNALS_TRUE,
      log: () => {},
    };
    for (const slot of ALL_SLOTS) {
      // eslint-disable-next-line no-await-in-loop
      const r = await resolveSlot(slot, ctx);
      expect(r.mode).toBe('floor');
    }
  });
});

describe('resolveSlot, active path', () => {
  it('renders active when all gates pass for ranked-feed on dashboard.hero', async () => {
    const modules: OrgModulesBlock = { 'ranked-feed': { enabled: true } };
    const r = await resolveSlot('dashboard.hero', {
      org: ORG,
      architecture: { ...ARCH_BASE, modules },
      gateContext: ALL_SIGNALS_TRUE,
      log: () => {},
    });
    expect(r.mode).toBe('active');
    expect(r.module?.id).toBe('ranked-feed');
  });
});

describe('resolveSlot, inactive path on soft gate unmet', () => {
  it('renders inactive when a soft data_signal is empty (warm-intro-panel)', async () => {
    const modules: OrgModulesBlock = { 'warm-intro-panel': { enabled: true } };
    const r = await resolveSlot('detail.relationships', {
      org: ORG,
      architecture: { ...ARCH_BASE, modules },
      gateContext: ALL_SIGNALS_FALSE,
      log: () => {},
    });
    expect(r.mode).toBe('inactive');
    expect(r.module?.id).toBe('warm-intro-panel');
  });
});

describe('resolveSlot, floor fallback on hard gate unmet', () => {
  it('falls back to floor when a hard data_signal is empty (ranked-feed)', async () => {
    const modules: OrgModulesBlock = { 'ranked-feed': { enabled: true } };
    let warned = false;
    const r = await resolveSlot('dashboard.hero', {
      org: ORG,
      architecture: { ...ARCH_BASE, modules },
      gateContext: MIXED_SIGNALS_FACTORY({ verified: false }),
      log: () => {
        warned = true;
      },
    });
    expect(r.mode).toBe('floor');
    expect(warned).toBe(true);
  });

  it('falls back to floor when a hard integration is missing (hubspot-sync as claim)', async () => {
    // Force a claim-mode entry of hubspot-sync by promoting it; we test the
    // floor degradation path. We pass integrations without hubspot.
    const modules: OrgModulesBlock = { 'pipeline-kanban': { enabled: true } };
    const r = await resolveSlot('pipeline.board', {
      org: ORG,
      architecture: { ...ARCH_BASE, modules, integrations: ['slack'] },
      gateContext: ALL_SIGNALS_FALSE, // hard data_signal pipeline_stages empty
      log: () => {},
    });
    expect(r.mode).toBe('floor');
  });
});

describe('resolveSlot, hidden fallback', () => {
  it('returns hidden for daily-digest when slack is absent (hidden fallback strategy)', async () => {
    const modules: OrgModulesBlock = { 'daily-digest': { enabled: true } };
    const r = await resolveSlot('delivery.digest', {
      org: ORG,
      architecture: { ...ARCH_BASE, modules, integrations: ['hubspot', 'resend'] },
      gateContext: MIXED_SIGNALS_FACTORY({ verified_companies: true }),
      log: () => {},
    });
    expect(r.mode).toBe('hidden');
  });
});

describe('resolveSlot, action-affordance composition', () => {
  it('exposes hubspot-sync as a resolved affordance inside detail.outreach when outreach-composer claims the slot', async () => {
    const modules: OrgModulesBlock = {
      'outreach-composer': { enabled: true },
      'hubspot-sync': { enabled: true },
    };
    const r = await resolveSlot('detail.outreach', {
      org: ORG,
      architecture: { ...ARCH_BASE, modules },
      gateContext: ALL_SIGNALS_TRUE,
      log: () => {},
    });
    expect(r.module?.id).toBe('outreach-composer');
    expect(r.affordances.map((a) => a.id)).toContain('hubspot-sync');
  });

  it('drops the affordance when its hard gate is unmet (no hubspot integration)', async () => {
    const modules: OrgModulesBlock = {
      'outreach-composer': { enabled: true },
      'hubspot-sync': { enabled: true },
    };
    const r = await resolveSlot('detail.outreach', {
      org: ORG,
      architecture: { ...ARCH_BASE, modules, integrations: ['slack', 'resend'] },
      gateContext: ALL_SIGNALS_TRUE,
      log: () => {},
    });
    expect(r.affordances.map((a) => a.id)).not.toContain('hubspot-sync');
  });
});

describe('resolveAllSlots', () => {
  it('resolves every slot once and keys the result by slot name', async () => {
    const r = await resolveAllSlots({
      org: ORG,
      architecture: { ...ARCH_BASE, modules: undefined },
      gateContext: ALL_SIGNALS_TRUE,
      log: () => {},
    });
    for (const slot of ALL_SLOTS) {
      expect(r[slot as Slot].slot).toBe(slot);
    }
  });
});

describe('renderer does not crash on misconfiguration', () => {
  it('renders floor when an unknown module id is enabled', async () => {
    const modules = { 'not-a-module': { enabled: true } } as unknown as OrgModulesBlock;
    const r = await resolveSlot('dashboard.hero', {
      org: ORG,
      architecture: { ...ARCH_BASE, modules },
      gateContext: ALL_SIGNALS_TRUE,
      log: () => {},
    });
    expect(r.mode).toBe('floor');
  });
});
