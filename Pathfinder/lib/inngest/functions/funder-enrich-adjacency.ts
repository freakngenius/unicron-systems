// lib/inngest/functions/funder-enrich-adjacency.ts
//
// Funder onboarding post-merge follow-up — `pathfinder/project.qualified`
// subscriber that runs the Funder enricher + adjacency-mapper BEFORE the
// next ranker cycle picks the project up. Wires the two modules that
// shipped in PR #448 (`lib/agents/funder/enricher.ts` and
// `lib/agents/funder/adjacency.ts`) into the live pipeline so qualified
// Funder projects carry org-canonical name, founders, legal form, raise
// stage, talent edges, and warm-intro routes into the ranker's Sonnet
// rationale + the verifier + the Weekly Deal Memo.
//
// Slug gate: Funder-only. The event fires from `ingestOrgRequested` for
// every qualified row (any org that runs through the subscriber, which
// today is opt-in to Funder only — see SUBSCRIBER_OPT_IN_SLUGS). If a
// future org opts into the subscriber, this handler will still no-op for
// it because of the per-handler slug filter below; that lets Funder
// enrichment ship without coupling.
//
// Storage: enrichment + adjacency outputs land inside `projects.raw_payload`
// under `funder_enrichment` and `funder_adjacency` keys (jsonb merge).
// No schema migration; the ranker + verifier + deal memo already read
// from raw_payload for Funder-shaped signals (see qualifier.ts,
// funderChecks.ts, dealMemo.ts).
//
// Idempotency: if raw_payload already contains a `funder_enrichment`
// block with a non-null `enriched_at` we skip both calls so Inngest
// retries don't double-pay Perplexity.
//
// Cost discipline: both `enrichForFunder` and `findFunderAdjacency` call
// the Perplexity Sonar surface via the LLM gateway. When the gateway
// env is absent (local without secrets) both calls degrade gracefully
// — the gateway client returns an empty body and parse returns null,
// which we treat as "skip and leave raw_payload as-is."
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 4.

import { inngest } from '../client';
import { supabaseAdmin } from '@/lib/supabase';
import { enrichForFunder } from '@/lib/agents/funder/enricher';
import { findFunderAdjacency } from '@/lib/agents/funder/adjacency';

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

// Slug filter — only run for Funder. Other orgs may share the
// project.qualified event surface in the future without enabling the
// Funder-shaped enricher (which is Sonar-driven and Funder-specific).
const HANDLER_OPT_IN_SLUGS = new Set(['funder']);

interface ProjectRow {
  id: string;
  title: string | null;
  summary: string | null;
  source: string;
  raw_payload: Record<string, unknown> | null;
}

export const funderEnrichAdjacency = inngest.createFunction(
  {
    id: 'pathfinder-funder-enrich-adjacency',
    name: 'Funder enrich + adjacency (project.qualified follow-on)',
    retries: 2,
    concurrency: { limit: 2 },
    triggers: [{ event: 'pathfinder/project.qualified' }],
  },
  async ({ event, step }: { event: { data: ProjectQualifiedData }; step: unknown }) => {
    const stepCtx = step as StepCtx;
    const { project_id, organization_slug, source } = event.data;

    if (!HANDLER_OPT_IN_SLUGS.has(organization_slug)) {
      return { skipped: true, reason: 'org_not_funder', project_id };
    }

    // 1. Load the project row.
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

    // Idempotency gate — skip if a prior cycle already enriched this row.
    const existingPayload = (project.raw_payload ?? {}) as Record<string, unknown>;
    const existingEnrichment = existingPayload.funder_enrichment as
      | { enriched_at?: string }
      | undefined;
    if (existingEnrichment?.enriched_at) {
      return {
        skipped: true,
        reason: 'already_enriched',
        project_id,
        enriched_at: existingEnrichment.enriched_at,
      };
    }

    // 2. Enricher — Sonar call. Graceful-empty on null org_name (gateway
    // unavailable or unparseable response).
    const enrichment = await stepCtx.run('enrich', async () => {
      try {
        const result = await enrichForFunder({
          project_id: project.id,
          title: project.title ?? '',
          summary: project.summary,
          source: project.source,
          raw_payload: existingPayload,
        });
        return result;
      } catch (err) {
        return {
          project_id,
          org_name: null,
          legal_form: null,
          founders: [],
          founded_year: null,
          raise_target_usd: null,
          fundraising_stage: null,
          brief: '',
          citations: [],
          model: 'unavailable',
          cost_usd: 0,
          latency_ms: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    });

    // 3. Adjacency — Sonar call. Takes founders from enrichment if present.
    const adjacency = await stepCtx.run('adjacency', async () => {
      try {
        const founders = (enrichment.founders ?? []).map((f) => ({
          name: f.name,
          prior_affiliation: f.prior_affiliation,
        }));
        const portfolioNames = (existingPayload.funder_portfolio_hint as string[] | undefined) ?? [];
        const result = await findFunderAdjacency({
          project_id: project.id,
          title: project.title ?? '',
          summary: project.summary,
          founders,
          portfolio_names: portfolioNames,
        });
        return result;
      } catch (err) {
        return {
          project_id,
          talent_edges: [],
          peer_funder_signal: null,
          portfolio_warm_intros: [],
          citations: [],
          model: 'unavailable',
          cost_usd: 0,
          latency_ms: 0,
          raw_response: '',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    });

    // 4. Merge results back into projects.raw_payload.
    const mergedPayload = {
      ...existingPayload,
      funder_enrichment: {
        org_name: enrichment.org_name,
        legal_form: enrichment.legal_form,
        founders: enrichment.founders,
        founded_year: enrichment.founded_year,
        raise_target_usd: enrichment.raise_target_usd,
        fundraising_stage: enrichment.fundraising_stage,
        brief: enrichment.brief,
        citations: enrichment.citations,
        model: enrichment.model,
        cost_usd: enrichment.cost_usd,
        latency_ms: enrichment.latency_ms,
        enriched_at: new Date().toISOString(),
      },
      funder_adjacency: {
        talent_edges: adjacency.talent_edges,
        peer_funder_signal: adjacency.peer_funder_signal,
        portfolio_warm_intros: adjacency.portfolio_warm_intros,
        citations: adjacency.citations,
        model: adjacency.model,
        cost_usd: adjacency.cost_usd,
        latency_ms: adjacency.latency_ms,
        adjacency_at: new Date().toISOString(),
      },
    };

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
      enrichment: {
        org_name: enrichment.org_name,
        founder_count: enrichment.founders.length,
        legal_form: enrichment.legal_form,
        cost_usd: enrichment.cost_usd,
        latency_ms: enrichment.latency_ms,
      },
      adjacency: {
        talent_edge_count: adjacency.talent_edges.length,
        warm_intro_count: adjacency.portfolio_warm_intros.length,
        cost_usd: adjacency.cost_usd,
        latency_ms: adjacency.latency_ms,
      },
    };
  },
);
