// Demo Polish UX § Gate 19 — stage filter normalization.
//
// `pathfinder.projects.project_stage` carries inconsistent values from
// historical seeders and live ingest paths:
//   solicitation (428) + RFP (10)  → 'rfp_open'
//   pre-budget (74)                → 'pre_budget'
//   PRE (6)                        → 'pre_bid'
//   PLN (6)                        → 'planning'
//   NWS (7)                        → 'news_mention'
//   awarded (265)                  → 'awarded'
//
// `lib/stages.ts` carries the legacy 5-code taxonomy used by the lead
// detail label rendering. This file is the 6-stage taxonomy used by the
// Gate 19 stage filter dropdown — it folds 'solicitation' and 'RFP' into
// a single 'rfp_open' bucket and adds 'pre_budget' as a distinct stage,
// neither of which the legacy lib/stages.ts taxonomy distinguishes.

export const STAGE_NORMALIZED_ORDER = [
  'news_mention',
  'planning',
  'pre_budget',
  'pre_bid',
  'rfp_open',
  'awarded',
] as const;

export type NormalizedStage = (typeof STAGE_NORMALIZED_ORDER)[number];

export function normalizeStage(raw: string | null | undefined): NormalizedStage | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (lower === 'nws' || lower === 'news mention' || lower === 'news') return 'news_mention';
  if (lower === 'pln' || lower === 'planning') return 'planning';
  if (lower === 'pre-budget' || lower === 'pre_budget') return 'pre_budget';
  if (lower === 'pre' || lower === 'pre-bid' || lower === 'pre_bid') return 'pre_bid';
  if (lower === 'rfp' || lower === 'solicitation' || lower === 'rfp open') return 'rfp_open';
  if (lower === 'awarded' || lower === 'contract awarded') return 'awarded';
  return null;
}

export const STAGE_LABELS: Record<NormalizedStage, string> = {
  news_mention: 'News mention',
  planning: 'Planning',
  pre_budget: 'Pre-budget',
  pre_bid: 'Pre-bid',
  rfp_open: 'RFP open',
  awarded: 'Awarded',
};

// Stages strictly before this index sit in the "bid window open" band.
// Stages at or after this index are post-award / subcontract-only.
export const BID_WINDOW_DIVIDER_INDEX = 5; // index of 'awarded'

export const ALL_STAGES_SET: ReadonlySet<NormalizedStage> = new Set(STAGE_NORMALIZED_ORDER);
