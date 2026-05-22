// lib/inngest/functions/internal-enrich-geo-adjacency.ts
//
// Internal onboarding Stage 5 — Internal post-qualifier pipeline.
//
// Subscribes to `pathfinder/project.qualified` and runs:
//   1. Internal enricher  (website, linkedin, employee_count, service_category, contacts)
//   2. Internal geo-mapper (hq_state, operating_states)
//   3. Internal adjacency-mapper (inert until UNICRON_INTERNAL_ADJACENCY_SEED_PATH is set)
//
// Slug gate: Internal-only. Funder events pass through unchanged into the
// existing `funderEnrichAdjacency` handler. Zedcor never reaches this
// event surface (Zedcor stays on the inline ingestor in lib/ingestor.ts).
//
// Storage: enrichment / geo / adjacency outputs land in
// projects.raw_payload under `internal_enrichment`, `internal_geo`, and
// `internal_adjacency` keys (jsonb merge). No schema migration.
//
// Idempotency: if raw_payload already contains an `internal_enrichment`
// block with non-null `enriched_at`, we skip the enricher (the expensive
// Sonar call) but still recompute geo and adjacency, which are cheap.
//
// Spec: Pathfinder/Pathfinder-Internal-Blueprint.md §7.

import { inngest } from '../client';
import { supabaseAdmin } from '@/lib/supabase';
import { enrichForInternal } from '@/lib/agents/internal/enricher';
import { mapInternalGeo } from '@/lib/agents/internal/geo';
import { findInternalAdjacency } from '@/lib/agents/internal/adjacency';

type StepCtx = {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
};

interface ProjectQualifiedData {
  project_id: string;
  organization_id: string;
  organization_slug: string;
  source: string;
  qualified_at: string;
}

const HANDLER_OPT_IN_SLUGS = new Set(['internal']);

interface ProjectRow {
  id: string;
  title: string | null;
  summary: string | null;
  source: string;
  raw_payload: Record<string, unknown> | null;
}

export const internalEnrichGeoAdjacency = inngest.createFunction(
  {
    id: 'pathfinder-internal-enrich-geo-adjacency',
    name: 'Internal enrich + geo + adjacency (project.qualified follow-on)',
    retries: 2,
    concurrency: { limit: 2 },
    triggers: [{ event: 'pathfinder/project.qualified' }],
  },
  async ({ event, step }: { event: { data: ProjectQualifiedData }; step: unknown }) => {
    const stepCtx = step as StepCtx;
    const { project_id, organization_slug, source } = event.data;

    if (!HANDLER_OPT_IN_SLUGS.has(organization_slug)) {
      return { skipped: true, reason: 'org_not_internal', project_id };
    }

    const project = await stepCtx.run('load-project', async () => {
      const admin = supabaseAdmin() as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            eq: (col: string, val: string) => {
              maybeSingle: () => Promise<{ data: ProjectRow | null; error: { message: string } | null }>;
            };
          };
        };
      };
      const { data, error } = await admin
        .from('projects')
        .select('id, title, summary, source, raw_payload')
        .eq('id', project_id)
        .maybeSingle();
      if (error) throw new Error(`load_project_failed: ${error.message}`);
      return data;
    });

    if (!project) {
      return { skipped: true, reason: 'project_not_found', project_id };
    }

    const existingPayload = (project.raw_payload ?? {}) as Record<string, unknown>;
    const existingEnrichment = existingPayload.internal_enrichment as
      | { enriched_at?: string }
      | undefined;
    const enrichmentAlreadyDone = Boolean(existingEnrichment?.enriched_at);

    // 1. Enricher — Sonar call (skipped if already enriched).
    const enrichment = enrichmentAlreadyDone
      ? null
      : await stepCtx.run('enrich', async () => {
          try {
            return await enrichForInternal({
              project_id: project.id,
              title: project.title ?? '',
              summary: project.summary,
              source: project.source,
              raw_payload: existingPayload,
            });
          } catch (err) {
            return {
              project_id,
              website: null,
              linkedin: null,
              employee_count: null,
              service_category: null,
              sales_motion: null,
              contacts: [],
              associations: [],
              brief: '',
              citations: [],
              model: 'unavailable',
              cost_usd: 0,
              latency_ms: 0,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        });

    // 2. Geo — pure heuristic, always runs.
    const geo = await stepCtx.run('geo', async () => {
      return mapInternalGeo({
        title: project.title,
        summary: project.summary,
        raw_payload: existingPayload,
      });
    });

    // 3. Adjacency — inert without seed.
    const adjacency = await stepCtx.run('adjacency', async () => {
      const service_category =
        (enrichment?.service_category as string | undefined) ??
        (existingPayload.internal_inferred_service_category as string | undefined) ??
        null;
      return await findInternalAdjacency({
        project_id: project.id,
        title: project.title ?? '',
        service_category,
        hq_state: geo.hq_state,
        operating_states: geo.operating_states,
      });
    });

    // 4. Merge results back into projects.raw_payload.
    const mergedPayload: Record<string, unknown> = {
      ...existingPayload,
      internal_geo: {
        hq_state: geo.hq_state,
        operating_states: geo.operating_states,
        mapped_at: new Date().toISOString(),
      },
      internal_adjacency: {
        active: adjacency.active,
        customer_overlap: adjacency.customer_overlap,
        crm_contact_match: adjacency.crm_contact_match,
        association_overlap: adjacency.association_overlap,
        mapped_at: new Date().toISOString(),
      },
    };

    if (enrichment) {
      mergedPayload.internal_enrichment = {
        website: enrichment.website,
        linkedin: enrichment.linkedin,
        employee_count: enrichment.employee_count,
        service_category: enrichment.service_category,
        sales_motion: enrichment.sales_motion,
        contacts: enrichment.contacts,
        associations: enrichment.associations,
        brief: enrichment.brief,
        citations: enrichment.citations,
        model: enrichment.model,
        cost_usd: enrichment.cost_usd,
        latency_ms: enrichment.latency_ms,
        enriched_at: new Date().toISOString(),
      };
    }

    await stepCtx.run('persist-merge', async () => {
      const admin = supabaseAdmin() as unknown as {
        from: (t: string) => {
          update: (v: Record<string, unknown>) => {
            eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
      const { error } = await admin
        .from('projects')
        .update({ raw_payload: mergedPayload })
        .eq('id', project.id);
      if (error) throw new Error(`persist_merge_failed: ${error.message}`);
      return true;
    });

    return {
      project_id,
      organization_slug,
      source,
      enrichment_skipped: enrichmentAlreadyDone,
      enrichment: enrichment
        ? {
            service_category: enrichment.service_category,
            contact_count: enrichment.contacts.length,
            cost_usd: enrichment.cost_usd,
            latency_ms: enrichment.latency_ms,
          }
        : null,
      geo: {
        hq_state: geo.hq_state,
        operating_state_count: geo.operating_states.length,
      },
      adjacency: {
        active: adjacency.active,
        customer_overlap: adjacency.customer_overlap.length,
        crm_match: adjacency.crm_contact_match.length,
        association_overlap: adjacency.association_overlap.length,
      },
    };
  },
);
