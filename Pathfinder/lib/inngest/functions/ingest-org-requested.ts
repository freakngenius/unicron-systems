// lib/inngest/functions/ingest-org-requested.ts
//
// Funder onboarding Stage 3 — `pathfinder/org.ingest_requested` subscriber.
//
// Listens for the per-org dispatch event emitted by `ingestAllOrgsCron`
// (every 4h) and runs the org's configured source adapters from the new
// id-keyed SOURCE_ADAPTERS registry. Inserts events into `pathfinder.projects`
// scoped by `organization_id`, dedupes against existing rows, and writes
// an agent_runs row per cycle.
//
// Why a new subscriber instead of folding Funder sources into the
// existing inline `lib/ingestor.ts` runIngestorCycle(): the existing
// ingestor is Zedcor-shaped (USAspending/SAM.gov/Harris County) and
// changing it for Funder risks the Zedcor regression gate. This
// subscriber is the platform-completing Phase 2C slice 6 work the
// `pathfinder/org.ingest_requested` event was already wired to receive.
// Zedcor's path is untouched.
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 3.
// Decision rationale: Pathfinder/docs/REPORT-funder-onboarding.md
//                     §"Stage 3 ingestion architecture decision".

import { inngest } from '../client';
import { supabaseAdmin } from '@/lib/supabase';
import { loadOrgArchitecture } from '@/lib/agents/loadOrgArchitecture';
import { SOURCE_ADAPTERS } from '@/lib/adapters/sources';
import type { SourceEvent } from '@/lib/adapters/sources';
// Funder onboarding Stage 4 — qualifier gate before insert.
import { qualifyForFunder } from '@/lib/agents/funder/qualifier';
import { assignHub } from '@/lib/agents/funder/geo';
// Internal onboarding Stage 5 — per-slug qualifier dispatch. Funder path
// stays bit-identical; Internal events route to qualifyForInternal.
import { qualifyForInternal } from '@/lib/agents/internal/qualifier';

type StepCtx = {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
};

interface IngestOrgRequestedData {
  organization_id: string;
  slug: string;
  trigger?: string;
  requested_at?: string;
}

interface SourceRunResult {
  source_id: string;
  fetched: number;
  inserted: number;
  deduped: number;
  errors: number;
  error_message?: string;
}

// Zedcor projects flow through the existing inline ingestor; this
// subscriber must NOT pull Zedcor sources even if a future Zedcor row
// listed one of Funder's sources in its architecture. Gate by slug as
// the safest discriminator (loadOrgArchitecture exposes org.slug).
// Internal onboarding Stage 4 prerequisite — additive 'internal' entry so
// the per-org subscriber fires for the Internal org (slug 'internal').
// Funder entry stays untouched; Zedcor remains on the legacy ingestor path.
const SUBSCRIBER_OPT_IN_SLUGS = new Set(['funder', 'internal']);

export const ingestOrgRequested = inngest.createFunction(
  {
    id: 'pathfinder-ingest-org-requested',
    name: 'Per-org ingest subscriber (Funder Stage 3)',
    retries: 2,
    concurrency: { limit: 4 },
    triggers: [{ event: 'pathfinder/org.ingest_requested' }],
  },
  async ({ event, step }: { event: { data: IngestOrgRequestedData }; step: unknown }) => {
    const stepCtx = step as StepCtx;
    const { organization_id, slug } = event.data;

    const loaded = await stepCtx.run('load-org-architecture', async () => {
      return await loadOrgArchitecture(organization_id);
    });
    const { architecture, org } = loaded;

    // Opt-in gate so Zedcor is not affected by this subscriber.
    if (!SUBSCRIBER_OPT_IN_SLUGS.has(org.slug)) {
      return {
        skipped: true,
        reason: 'org_not_opted_into_subscriber',
        organization_id,
        slug: org.slug,
      };
    }

    const runStartedAt = new Date().toISOString();
    const runId = await stepCtx.run('open-agent-run', async () => {
      const admin = supabaseAdmin() as unknown as {
        from: (t: string) => {
          insert: (row: Record<string, unknown>) => {
            select: (cols?: string) => Promise<{ data: { id: number }[] | null; error: { message: string } | null }>;
          };
        };
      };
      const { data, error } = await admin.from('agent_runs').insert({
        agent_name: 'ingestor',
        started_at: runStartedAt,
        status: 'running',
        records_processed: 0,
        records_new: 0,
        // organization_id is NOT NULL in pathfinder.agent_runs; without
        // it every cloud Inngest run failed silently at this step. The
        // ingest-org-requested subscriber is per-org by construction, so
        // the value is always available. (Convergent fix: Funder PR #463
        // landed this on main while the Internal build added the same
        // line on its branch; both branches converged on the same
        // resolution.)
        organization_id,
      }).select('id');
      if (error) {
        // Non-fatal: continue without the run id (telemetry-only).
        console.error('[ingest-org-requested] failed to open agent_run:', error.message);
        return null;
      }
      return data?.[0]?.id ?? null;
    });

    const results: SourceRunResult[] = [];
    let totalFetched = 0;
    let totalInserted = 0;
    let totalDeduped = 0;
    let totalErrors = 0;

    for (const sourceRef of architecture.sources) {
      const adapter = SOURCE_ADAPTERS[sourceRef.id];
      if (!adapter) {
        results.push({
          source_id: sourceRef.id,
          fetched: 0,
          inserted: 0,
          deduped: 0,
          errors: 1,
          error_message: 'adapter not registered in SOURCE_ADAPTERS',
        });
        totalErrors++;
        continue;
      }

      const result = await stepCtx.run(`pull-${sourceRef.id}`, async () => {
        const sourceResult: SourceRunResult = {
          source_id: sourceRef.id,
          fetched: 0,
          inserted: 0,
          deduped: 0,
          errors: 0,
        };
        let events: SourceEvent[] = [];
        try {
          events = await adapter.poll({
            organizationId: organization_id,
            organizationSlug: org.slug,
            architecture,
          });
        } catch (err) {
          sourceResult.errors = 1;
          sourceResult.error_message = err instanceof Error ? err.message : String(err);
          return sourceResult;
        }
        sourceResult.fetched = events.length;
        if (events.length === 0) return sourceResult;

        // Stage 4: qualifier gate before persistence. Drop events the
        // qualifier rejects so we don't pay downstream Sonnet costs for
        // noise. Per-slug dispatch — Funder events route to
        // qualifyForFunder (bit-identical pre-Stage-5 behavior); Internal
        // events route to qualifyForInternal which trusts the construction
        // NAICS / job-board filtering already done at the adapter layer.
        const qualifiedEvents = events.filter((e) => {
          if (org.slug === 'internal') {
            const q = qualifyForInternal({
              source_event_id: e.source_event_id,
              source: sourceRef.id,
              title: e.title,
              summary: e.summary,
              raw_payload: e.raw_payload,
              architecture,
            });
            if (q.qualified) {
              const p = e.raw_payload as Record<string, unknown>;
              p.internal_qualifier_reason = q.reason;
              p.internal_inferred_service_category = q.inferred_service_category ?? null;
              p.internal_sales_motion_signal = q.sales_motion_signal ?? p.internal_sales_motion_signal ?? null;
              p.internal_federal_registration = q.federal_registration ?? p.internal_federal_registration ?? null;
              if (q.association_hint) {
                p.internal_association_hint = q.association_hint;
              }
            }
            return q.qualified;
          }
          const q = qualifyForFunder({
            source_event_id: e.source_event_id,
            source: sourceRef.id,
            title: e.title,
            summary: e.summary,
            raw_payload: e.raw_payload,
            architecture,
          });
          if (q.qualified) {
            const hub = assignHub({ city: e.city, state: e.state, country: e.country });
            (e.raw_payload as Record<string, unknown>).funder_qualifier_reason = q.reason;
            (e.raw_payload as Record<string, unknown>).funder_inferred_thesis = q.inferred_thesis ?? null;
            (e.raw_payload as Record<string, unknown>).funder_compliance_flag = q.compliance_flag ?? null;
            (e.raw_payload as Record<string, unknown>).funder_geo_hub = hub;
          }
          return q.qualified;
        });
        if (qualifiedEvents.length === 0) {
          return sourceResult;
        }

        // De-dup against existing projects by source_event_id stored in
        // raw_payload.source_event_id (the projects.id column is the
        // adapter's source_event_id directly, matching the inline
        // ingestor's pattern).
        const admin = supabaseAdmin() as unknown as {
          from: (t: string) => {
            select: (cols: string) => {
              in: (col: string, vals: string[]) => Promise<{ data: { id: string }[] | null; error: unknown }>;
            };
            insert: (rows: Record<string, unknown>[]) => Promise<{ error: { message: string } | null }>;
          };
        };
        const ids = qualifiedEvents.map((e) => e.source_event_id);
        const { data: existing } = await admin.from('projects').select('id').in('id', ids);
        const existingSet = new Set((existing ?? []).map((r) => r.id));
        const fresh = qualifiedEvents.filter((e) => !existingSet.has(e.source_event_id));
        sourceResult.deduped = qualifiedEvents.length - fresh.length;
        if (fresh.length === 0) return sourceResult;

        const rows = fresh.map((e) => ({
          id: e.source_event_id,
          source: sourceRef.id,
          source_id: e.source_event_id,
          title: e.title,
          summary: e.summary,
          project_value: null,
          project_stage: null,
          posted_date: e.posted_date,
          raw_payload: e.raw_payload,
          country: e.country ?? null,
          // organization_id is the multi-tenant scope; ranker dispatcher
          // routes via this to scoreGenericProject for non-Zedcor orgs.
          organization_id,
          score: null,
        }));
        const { error: insertErr } = await admin.from('projects').insert(rows);
        if (insertErr) {
          sourceResult.errors = 1;
          sourceResult.error_message = insertErr.message;
          return sourceResult;
        }
        sourceResult.inserted = rows.length;

        // Post-merge follow-up — emit pathfinder/project.qualified per
        // inserted row so the Funder enrich+adjacency Inngest handler
        // can run BEFORE the next ranker cycle picks the row up. Best-
        // effort: a failed send logs in Inngest itself but does not
        // fail the ingest (the row is already persisted; the next
        // ranker cycle still picks it up, just without enrichment).
        try {
          await inngest.send(
            rows.map((row) => ({
              name: 'pathfinder/project.qualified',
              data: {
                project_id: row.id,
                organization_id,
                organization_slug: org.slug,
                source: row.source,
                qualified_at: new Date().toISOString(),
              },
            })),
          );
        } catch (err) {
          // Surface in the per-source result so the agent_run logs reflect
          // partial completion, but do not flip the row to failed.
          sourceResult.error_message =
            `inngest_emit_failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`;
        }

        return sourceResult;
      });

      results.push(result);
      totalFetched += result.fetched;
      totalInserted += result.inserted;
      totalDeduped += result.deduped;
      totalErrors += result.errors;
    }

    await stepCtx.run('close-agent-run', async () => {
      if (runId == null) return;
      const admin = supabaseAdmin() as unknown as {
        from: (t: string) => {
          update: (v: Record<string, unknown>) => {
            eq: (col: string, val: number) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
      await admin.from('agent_runs').update({
        completed_at: new Date().toISOString(),
        records_processed: totalFetched,
        records_new: totalInserted,
        status: totalErrors > 0 && totalInserted === 0 ? 'failed' : 'success',
        error_message: totalErrors > 0 ? results.filter((r) => r.error_message).map((r) => `${r.source_id}: ${r.error_message}`).join('; ').slice(0, 1000) : null,
      }).eq('id', runId);
    });

    return {
      organization_id,
      slug: org.slug,
      run_id: runId,
      totals: {
        fetched: totalFetched,
        inserted: totalInserted,
        deduped: totalDeduped,
        errors: totalErrors,
      },
      per_source: results,
    };
  },
);
