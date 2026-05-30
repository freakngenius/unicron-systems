// __tests__/catalog/resolveGate.test.ts, Stream A Foundation.

import { describe, expect, it } from 'vitest';
import {
  MODULE_REGISTRY,
  resolveGate,
  resolveAllGates,
  type GateContext,
} from '@/lib/catalog';

const ARCH = {
  lead_unit: {
    name: 'company',
    plural: 'companies',
    schema: {
      score: { type: 'number' as const },
      sales_motion: { type: 'enum' as const },
    },
  },
  integrations: ['hubspot', 'slack'],
  agents: ['briefer'],
};

const ORG = { id: 'org-internal', slug: 'internal' };

function ctxWith(signals: Record<string, boolean>): GateContext {
  return {
    hasDataSignal: async (_org, ref) => signals[ref] ?? false,
  };
}

describe('resolveGate, schema_field', () => {
  it('met when the field is present in lead_unit.schema', async () => {
    const r = await resolveGate({
      dep: { kind: 'schema_field', ref: 'score', gate: 'hard' },
      architecture: ARCH,
      org: ORG,
      def: MODULE_REGISTRY['ranked-feed'],
      entry: { enabled: true },
      ctx: ctxWith({}),
    });
    expect(r.met).toBe(true);
  });

  it('unmet when the field is absent', async () => {
    const r = await resolveGate({
      dep: { kind: 'schema_field', ref: 'absent', gate: 'hard' },
      architecture: ARCH,
      org: ORG,
      def: MODULE_REGISTRY['ranked-feed'],
      entry: { enabled: true },
      ctx: ctxWith({}),
    });
    expect(r.met).toBe(false);
    expect(r.reason).toMatch(/absent/);
  });

  it('__configured_filters__ expands to per-field checks', async () => {
    const r = await resolveGate({
      dep: { kind: 'schema_field', ref: '__configured_filters__', gate: 'soft' },
      architecture: ARCH,
      org: ORG,
      def: MODULE_REGISTRY['filter-rail'],
      entry: { enabled: true, config: { fields: ['score', 'sales_motion'] } },
      ctx: ctxWith({}),
    });
    expect(r.met).toBe(true);
  });

  it('__configured_filters__ unmet when a configured field is missing from schema', async () => {
    const r = await resolveGate({
      dep: { kind: 'schema_field', ref: '__configured_filters__', gate: 'soft' },
      architecture: ARCH,
      org: ORG,
      def: MODULE_REGISTRY['filter-rail'],
      entry: { enabled: true, config: { fields: ['score', 'no_such_field'] } },
      ctx: ctxWith({}),
    });
    expect(r.met).toBe(false);
  });
});

describe('resolveGate, integration', () => {
  it('met when the integration is in architecture.integrations', async () => {
    const r = await resolveGate({
      dep: { kind: 'integration', ref: 'hubspot', gate: 'hard' },
      architecture: ARCH,
      org: ORG,
      def: MODULE_REGISTRY['hubspot-sync'],
      entry: { enabled: true },
      ctx: ctxWith({}),
    });
    expect(r.met).toBe(true);
  });

  it('unmet when missing', async () => {
    const r = await resolveGate({
      dep: { kind: 'integration', ref: 'salesforce', gate: 'hard' },
      architecture: ARCH,
      org: ORG,
      def: MODULE_REGISTRY['hubspot-sync'],
      entry: { enabled: true },
      ctx: ctxWith({}),
    });
    expect(r.met).toBe(false);
  });
});

describe('resolveGate, agent', () => {
  it('met when the agent appears in architecture.agents', async () => {
    const r = await resolveGate({
      dep: { kind: 'agent', ref: 'briefer', gate: 'hard' },
      architecture: ARCH,
      org: ORG,
      def: MODULE_REGISTRY['daily-digest'],
      entry: { enabled: true },
      ctx: ctxWith({}),
    });
    expect(r.met).toBe(true);
  });

  it('unmet when missing', async () => {
    const r = await resolveGate({
      dep: { kind: 'agent', ref: 'absent-agent', gate: 'hard' },
      architecture: ARCH,
      org: ORG,
      def: MODULE_REGISTRY['daily-digest'],
      entry: { enabled: true },
      ctx: ctxWith({}),
    });
    expect(r.met).toBe(false);
  });
});

describe('resolveGate, data_signal', () => {
  it('met when the GateContext returns true', async () => {
    const r = await resolveGate({
      dep: { kind: 'data_signal', ref: 'verified', gate: 'hard' },
      architecture: ARCH,
      org: ORG,
      def: MODULE_REGISTRY['ranked-feed'],
      entry: { enabled: true },
      ctx: ctxWith({ verified: true }),
    });
    expect(r.met).toBe(true);
  });

  it('unmet when the GateContext returns false', async () => {
    const r = await resolveGate({
      dep: { kind: 'data_signal', ref: 'verified', gate: 'hard' },
      architecture: ARCH,
      org: ORG,
      def: MODULE_REGISTRY['ranked-feed'],
      entry: { enabled: true },
      ctx: ctxWith({ verified: false }),
    });
    expect(r.met).toBe(false);
  });

  it('__configured_metrics__ expands to per-metric checks', async () => {
    const r = await resolveGate({
      dep: { kind: 'data_signal', ref: '__configured_metrics__', gate: 'soft' },
      architecture: ARCH,
      org: ORG,
      def: MODULE_REGISTRY['kpi-strip'],
      entry: { enabled: true, config: { metrics: ['avg_score', 'verified_count_1d'] } },
      ctx: ctxWith({ avg_score: true, verified_count_1d: true }),
    });
    expect(r.met).toBe(true);
  });

  it('__configured_metrics__ unmet when any metric is empty', async () => {
    const r = await resolveGate({
      dep: { kind: 'data_signal', ref: '__configured_metrics__', gate: 'soft' },
      architecture: ARCH,
      org: ORG,
      def: MODULE_REGISTRY['kpi-strip'],
      entry: { enabled: true, config: { metrics: ['avg_score', 'absent_metric'] } },
      ctx: ctxWith({ avg_score: true }),
    });
    expect(r.met).toBe(false);
    expect(r.reason).toMatch(/absent_metric/);
  });
});

describe('resolveAllGates summary', () => {
  it('separates hard-unmet from soft-unmet', async () => {
    const summary = await resolveAllGates(MODULE_REGISTRY['outreach-composer'], {
      architecture: { ...ARCH, integrations: [] }, // resend missing -> hard
      org: ORG,
      entry: { enabled: true },
      ctx: ctxWith({ outreach_drafts: false }), // soft unmet too
    });
    expect(summary.hardUnmet.length).toBeGreaterThan(0);
    expect(summary.softUnmet.length).toBeGreaterThan(0);
  });

  it('returns empty when all gates met', async () => {
    const summary = await resolveAllGates(MODULE_REGISTRY['ranked-feed'], {
      architecture: ARCH,
      org: ORG,
      entry: { enabled: true },
      ctx: ctxWith({ verified: true }),
    });
    expect(summary.hardUnmet).toEqual([]);
    expect(summary.softUnmet).toEqual([]);
  });
});
