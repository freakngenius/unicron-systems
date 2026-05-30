// lib/catalog/modules/ranked-feed/data.ts, Stream B Dashboard.
//
// Server-side fetcher for the ranked-feed hero. Queries the `projects`
// table scoped to one organization, drops rows with no score (so the
// "ranked" feed is actually ranked), orders by score desc, and applies the
// in-memory filter narrowing from `filter-rail/applyFilters` so the two
// modules agree on the visible set.
//
// Why filtering happens in memory rather than as Supabase predicates:
// service_category and sales_motion live inside `raw_payload` jsonb, which
// the supabase-js client does not narrow well without raw SQL. Filtering
// after the score-desc fetch keeps the data layer simple and the result
// small enough (capped at `limit`) that the in-memory pass is negligible.

import { applyFilters, type InternalFilters, type RawCompanyRow } from '@/lib/catalog/modules/filter-rail/applyFilters';

type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        value: string,
      ) => {
        not: (
          col: string,
          op: string,
          value: unknown,
        ) => {
          order: (
            col: string,
            opts: { ascending: boolean; nullsFirst?: boolean },
          ) => {
            limit: (n: number) => Promise<{ data: RawCompanyRow[] | null; error: unknown }>;
          };
        };
      };
    };
  };
};

export interface FetchRankedDeps {
  admin: SupabaseLike;
  limit?: number;
  filters: InternalFilters;
}

const DEFAULT_LIMIT = 50;

/**
 * Fetch ranked Internal companies for one org. Returns at most `limit` rows
 * (default 50) ordered by score desc, then narrowed by the supplied filters.
 * On Supabase error returns an empty array; the renderer surfaces the
 * designed EmptyState rather than a broken card stack.
 */
export async function fetchRankedCompanies(
  orgId: string,
  deps: FetchRankedDeps,
): Promise<RawCompanyRow[]> {
  const limit = deps.limit ?? DEFAULT_LIMIT;
  const res = await deps.admin
    .from('projects')
    .select('id, organization_id, score, title, source, raw_payload')
    .eq('organization_id', orgId)
    .not('score', 'is', null)
    .order('score', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (res.error || !Array.isArray(res.data)) return [];
  return applyFilters(res.data, deps.filters);
}
