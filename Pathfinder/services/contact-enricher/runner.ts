// services/contact-enricher/runner.ts — Demo Polish UX Gate 8B.
//
// I/O wrapper that selects top-N leads from pathfinder.projects, runs the
// orchestrator, persists the result, and returns a summary. Used by both:
//   - lib/inngest/functions/contact-enrichment.ts (daily cron)
//   - app/api/leads/[projectId]/enrich-contacts/route.ts (on-demand
//     single-lead path; calls runForProjects([projectId]))
//
// Selection strategy for the cron:
//   1. Top N leads (default 50) ordered by score desc.
//   2. Either never-enriched (no row in lead_contacts) OR enriched > 7
//      days ago.
//   3. Skip rules from the orchestrator handle owner-unknown / pre-award /
//      rejected at the per-lead level — runner doesn't pre-filter, so
//      the skip telemetry is visible in the run summary.

import { enrichOneLead, type EnrichLeadResult } from './agent';
import { writeContacts } from './persist';

export const DEFAULT_TOP_N = 50;
export const STALE_AFTER_DAYS = 7;

interface ProjectRow {
  id: string;
  owner_name: string | null;
  owner_type: string | null;
  location_text: string | null;
  naics_code: string | null;
  rejection_reason: string | null;
  project_value: number | null;
  score: number | null;
  nearest_branch_id: string | null;
  warm_for_customer_id: string | null;
}

export interface RunSummary {
  projects_considered: number;
  projects_enriched: number;
  projects_empty: number;
  projects_skipped: number;
  projects_partial: number;
  contacts_inserted: number;
  total_cost_usd: number;
  // Per-provider totals — for the live-status report and the cost-summary
  // endpoint's contact-enricher rollup.
  clay_calls: number;
  clay_cost_usd: number;
  apollo_calls: number;
  apollo_cost_usd: number;
  hunter_calls: number;
  hunter_cost_usd: number;
  errors: string[];
  per_project: Array<{
    project_id: string;
    status: EnrichLeadResult['status'];
    contacts_count: number;
    skip_reason: string | null;
    cost_usd: number;
  }>;
}

interface LeadContactsRow {
  project_id: string;
  enriched_at: string;
}

async function selectTopProjects(topN: number): Promise<ProjectRow[]> {
  const { supabaseAdmin } = await import('@/lib/supabase');
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        order: (
          col: string,
          opts: { ascending: boolean; nullsFirst?: boolean },
        ) => {
          limit: (n: number) => Promise<{
            data: ProjectRow[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const { data, error } = await sb
    .from('projects')
    .select(
      'id, owner_name, owner_type, location_text, naics_code, rejection_reason, project_value, score, nearest_branch_id, warm_for_customer_id',
    )
    .order('score', { ascending: false, nullsFirst: false })
    .limit(topN);
  if (error) throw new Error(`projects select failed: ${error.message}`);
  return data ?? [];
}

async function loadEnrichmentRecency(
  projectIds: string[],
): Promise<Map<string, string>> {
  if (projectIds.length === 0) return new Map();
  const { supabaseAdmin } = await import('@/lib/supabase');
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        in: (col: string, vals: string[]) => Promise<{
          data: LeadContactsRow[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  const { data, error } = await sb
    .from('lead_contacts')
    .select('project_id, enriched_at')
    .in('project_id', projectIds);
  if (error) {
    // Best-effort recency check — if it fails, treat all leads as stale.
    return new Map();
  }
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const prev = map.get(row.project_id);
    if (!prev || row.enriched_at > prev) {
      map.set(row.project_id, row.enriched_at);
    }
  }
  return map;
}

function isStale(enrichedAt: string | undefined): boolean {
  if (!enrichedAt) return true;
  const ts = Date.parse(enrichedAt);
  if (!Number.isFinite(ts)) return true;
  const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  return ageDays > STALE_AFTER_DAYS;
}

function newSummary(): RunSummary {
  return {
    projects_considered: 0,
    projects_enriched: 0,
    projects_empty: 0,
    projects_skipped: 0,
    projects_partial: 0,
    contacts_inserted: 0,
    total_cost_usd: 0,
    clay_calls: 0,
    clay_cost_usd: 0,
    apollo_calls: 0,
    apollo_cost_usd: 0,
    hunter_calls: 0,
    hunter_cost_usd: 0,
    errors: [],
    per_project: [],
  };
}

export interface RunOptions {
  // Default 50; on-demand path passes 1.
  topN?: number;
  // When true, skip the staleness gate — used by on-demand to force re-run.
  forceRefresh?: boolean;
  // When set, restrict the run to this single project_id (the on-demand
  // route uses this).
  projectIdOverride?: string;
}

export async function runEnrichment(opts: RunOptions = {}): Promise<RunSummary> {
  const summary = newSummary();
  let candidates: ProjectRow[];
  if (opts.projectIdOverride) {
    const { supabaseAdmin } = await import('@/lib/supabase');
    const sb = supabaseAdmin() as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, v: string) => {
            maybeSingle: () => Promise<{
              data: ProjectRow | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
    const { data, error } = await sb
      .from('projects')
      .select(
        'id, owner_name, owner_type, location_text, naics_code, rejection_reason, project_value, score, nearest_branch_id, warm_for_customer_id',
      )
      .eq('id', opts.projectIdOverride)
      .maybeSingle();
    if (error) {
      summary.errors.push(`project select: ${error.message}`);
      return summary;
    }
    candidates = data ? [data] : [];
  } else {
    candidates = await selectTopProjects(opts.topN ?? DEFAULT_TOP_N);
  }
  summary.projects_considered = candidates.length;
  if (candidates.length === 0) return summary;

  const recency = opts.forceRefresh
    ? new Map<string, string>()
    : await loadEnrichmentRecency(candidates.map((c) => c.id));

  for (const project of candidates) {
    const lastEnriched = recency.get(project.id);
    if (!opts.forceRefresh && !isStale(lastEnriched)) {
      // Within freshness window — skip silently. Don't count toward
      // skipped (different semantics) — track separately.
      continue;
    }
    try {
      const result = await enrichOneLead({
        project_id: project.id,
        owner_name: project.owner_name,
        owner_type: project.owner_type,
        location_text: project.location_text,
        naics_code: project.naics_code,
        rejection_reason: project.rejection_reason,
        project_value_usd: project.project_value,
        // Conservative interpretation of "nearest branch already serves
        // the owner": only when the project carries a non-null
        // warm_for_customer_id — that's the column populated by the
        // adjacency scoring path (multi-tenant customers). The Zedcor
        // contractor cross-pollination layer (lead_cross_pollination)
        // is a different signal and is consulted by Cross-Pollination
        // card in the UI; we don't conflate the two here.
        cross_pollination_serves_owner: !!project.warm_for_customer_id,
      });

      // Telemetry rollups.
      summary.total_cost_usd += result.total_cost_usd;
      if (result.meta.clay) {
        summary.clay_calls += 1;
        summary.clay_cost_usd += result.meta.clay.cost_usd;
      }
      if (result.meta.apollo) {
        summary.apollo_calls += 1;
        summary.apollo_cost_usd += result.meta.apollo.cost_usd;
      }
      summary.hunter_calls += result.meta.hunter_calls;
      summary.hunter_cost_usd += result.meta.hunter_cost_usd;

      if (result.status === 'skipped') {
        summary.projects_skipped += 1;
      } else if (result.status === 'empty') {
        summary.projects_empty += 1;
      } else if (result.status === 'partial') {
        summary.projects_partial += 1;
      } else {
        summary.projects_enriched += 1;
        const written = await writeContacts(project.id, result.contacts);
        summary.contacts_inserted += written.inserted;
      }
      summary.per_project.push({
        project_id: project.id,
        status: result.status,
        contacts_count: result.contacts.length,
        skip_reason: result.skip_reason,
        cost_usd: result.total_cost_usd,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.errors.push(`${project.id}: ${message}`);
    }
  }
  return summary;
}
