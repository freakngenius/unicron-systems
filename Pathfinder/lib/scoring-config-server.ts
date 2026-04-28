// lib/scoring-config-server.ts — server-only helpers for the active
// scoring config. Lives outside `app/api/scoring-config/route.ts` because
// Next.js App Router only allows specific exports from route files —
// other server routes (stats, verifier cron) need to import these helpers.

import { supabase } from '@/lib/supabase';

export interface ScoringConfig {
  high_priority_threshold: number;
  score_tolerance: number;
  default_coverage_miles: number;
}

export const SCORING_DEFAULTS: ScoringConfig = {
  high_priority_threshold: 80,
  score_tolerance: 15,
  default_coverage_miles: 300,
};

/** Read the latest row from `pathfinder.ranking_config`. Falls back to
 *  defaults if the table is empty or the query errors — callers always
 *  get a usable config. */
export async function fetchActiveScoringConfig(): Promise<ScoringConfig> {
  // ranking_config landed in migration 0006; supabase-js generated types
  // haven't been regenerated, so we use a loosely-typed handle here.
  const sb = supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        order: (col: string, opts: { ascending: boolean }) => {
          limit: (n: number) => Promise<{ data: { config: unknown }[] | null; error: unknown }>;
        };
      };
    };
  };
  const { data, error } = await sb
    .from('ranking_config')
    .select('config')
    .order('effective_at', { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return { ...SCORING_DEFAULTS };
  const cfg = (data[0]?.config ?? {}) as Partial<ScoringConfig>;
  return {
    high_priority_threshold: numericOr(cfg.high_priority_threshold, SCORING_DEFAULTS.high_priority_threshold),
    score_tolerance: numericOr(cfg.score_tolerance, SCORING_DEFAULTS.score_tolerance),
    default_coverage_miles: numericOr(
      cfg.default_coverage_miles,
      SCORING_DEFAULTS.default_coverage_miles,
    ),
  };
}

/** Insert a new ranking_config row. Loosely typed for the same reason. */
export async function appendScoringConfig(config: ScoringConfig): Promise<void> {
  const sb = supabase as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };
  const { error } = await sb.from('ranking_config').insert({ config });
  if (error) throw new Error(error.message);
}

function numericOr(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : (v as number | undefined);
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}
