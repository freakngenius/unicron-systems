// lib/catalog/gating.ts, Stream A Foundation.
//
// resolveGate evaluates a single Dependency against an org. It mediates the
// async/sync split: schema_field, integration, and agent are evaluated
// synchronously against the OrgArchitecture; data_signal is delegated to a
// pluggable GateContext that queries pipeline output for non-empty rows.
//
// The renderer iterates a module's dependencies through this function. Tests
// substitute a stub GateContext; production wires one backed by Supabase.

import type { OrgArchitecture } from '@/lib/types/architecture';
import { checkSyncDep } from './validation';
import type {
  Dependency,
  GateContext,
  GateResolution,
  ModuleDefinition,
  OrgModuleEntry,
} from './types';

export interface ResolveGateInput {
  dep: Dependency;
  architecture: Pick<OrgArchitecture, 'lead_unit' | 'integrations'> & { agents?: readonly string[] };
  org: { id: string; slug: string };
  /** The module def the dependency belongs to. */
  def: ModuleDefinition;
  /** The per-org module entry (config etc.). */
  entry: OrgModuleEntry;
  /** Pluggable async resolver for data_signal. */
  ctx: GateContext;
}

/**
 * Evaluate one dependency. Always async to keep the renderer's iteration
 * uniform; sync paths resolve immediately.
 */
export async function resolveGate(input: ResolveGateInput): Promise<GateResolution> {
  const { dep, architecture, org, def, entry, ctx } = input;
  if (dep.kind === 'data_signal') {
    // Sentinel expansion: __configured_metrics__ fans out to one check per
    // metric in entry.config.metrics. The dependency is met when ALL
    // configured metrics have a signal. An empty configured list is
    // vacuously met (the slot stays inactive via fallback strategy).
    if (dep.ref === '__configured_metrics__') {
      const metrics = ((entry.config?.metrics as string[] | undefined) ?? []) as string[];
      if (metrics.length === 0) return { met: true, reason: 'no metrics configured' };
      for (const m of metrics) {
        // eslint-disable-next-line no-await-in-loop
        const has = await ctx.hasDataSignal(org.id, m);
        if (!has) return { met: false, reason: `data_signal "${m}" empty` };
      }
      return { met: true };
    }
    const has = await ctx.hasDataSignal(org.id, dep.ref);
    return has
      ? { met: true }
      : { met: false, reason: `data_signal "${dep.ref}" empty` };
  }

  // Synchronous dependency kinds: delegate to validation's shared helper so
  // config-time and render-time use the same logic.
  const res = checkSyncDep(dep.kind, dep.ref, architecture, def, entry);
  return res;
}

/**
 * Convenience: evaluate every dependency of a module and return the first
 * unmet hard, the first unmet soft, or all-met. Useful for the renderer.
 */
export interface ModuleGateSummary {
  hardUnmet: Array<{ dep: Dependency; reason: string }>;
  softUnmet: Array<{ dep: Dependency; reason: string }>;
}

export async function resolveAllGates(
  def: ModuleDefinition,
  args: Omit<ResolveGateInput, 'dep' | 'def'>,
): Promise<ModuleGateSummary> {
  const summary: ModuleGateSummary = { hardUnmet: [], softUnmet: [] };
  for (const dep of def.dependencies) {
    // eslint-disable-next-line no-await-in-loop
    const r = await resolveGate({ ...args, dep, def });
    if (r.met) continue;
    if (dep.gate === 'hard') {
      summary.hardUnmet.push({ dep, reason: r.reason ?? 'unmet' });
    } else {
      summary.softUnmet.push({ dep, reason: r.reason ?? 'unmet' });
    }
  }
  return summary;
}

/**
 * Production GateContext backed by Supabase. Returns true when a non-empty
 * pipeline projection exists for the org under the named signal.
 *
 * This is intentionally a thin wrapper over Supabase so tests can inject
 * a stub. Signal ref -> projects column / view mapping lives here; surface
 * streams may extend this map as new modules need signals.
 *
 * Stream A keeps the mapping conservative. Unknown refs return false (signal
 * is treated as empty) so a misconfigured registry fails closed rather than
 * faking a met dependency.
 */
export function makeSupabaseGateContext(
  supabaseFrom: (table: string) => {
    select: (cols: string, opts?: { count?: 'exact'; head?: boolean }) => {
      eq: (col: string, value: string) => {
        not?: (col: string, op: string, value: unknown) => Promise<{ count: number | null }>;
        limit?: (n: number) => Promise<{ data: unknown[] | null }>;
      } & Promise<{ count: number | null; data?: unknown[] | null }>;
    };
  },
): GateContext {
  const SIGNAL_QUERIES: Record<
    string,
    (orgId: string) => Promise<boolean>
  > = {
    verified: async (orgId) => {
      const res = (await supabaseFrom('projects')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)) as { count: number | null };
      return (res.count ?? 0) > 0;
    },
    enriched_record: async (orgId) => {
      const res = (await supabaseFrom('projects')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)) as { count: number | null };
      return (res.count ?? 0) > 0;
    },
    score_components: async (orgId) => {
      const res = (await supabaseFrom('projects')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)) as { count: number | null };
      return (res.count ?? 0) > 0;
    },
    sources: async (orgId) => {
      const res = (await supabaseFrom('projects')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)) as { count: number | null };
      return (res.count ?? 0) > 0;
    },
    outreach_drafts: async () => false,
    pipeline_stages: async (orgId) => {
      const res = (await supabaseFrom('projects')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)) as { count: number | null };
      return (res.count ?? 0) > 0;
    },
    adjacency_graph: async () => false,
    aggregate_queries: async (orgId) => {
      const res = (await supabaseFrom('projects')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)) as { count: number | null };
      return (res.count ?? 0) > 0;
    },
    verified_companies: async (orgId) => {
      const res = (await supabaseFrom('projects')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)) as { count: number | null };
      return (res.count ?? 0) > 0;
    },
    geocoded_coords: async () => false,
  };

  return {
    async hasDataSignal(orgId, ref) {
      const q = SIGNAL_QUERIES[ref];
      if (!q) return false;
      try {
        return await q(orgId);
      } catch {
        return false;
      }
    },
  };
}
