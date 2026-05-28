// lib/notion/types.ts
//
// Sprint Z1A — types for the Zedcor Houston Notion writer.
// Mirrors the schema of database 856b43a02b4d43649344c5e1a05d206d
// ("Zedcor Houston — Lead Feed").

export type NotionPhase = 'pre-bid' | 'open' | 'closing-soon' | 'awarded' | 'unknown';

export type NotionState = 'TX' | 'LA' | 'OK' | 'AR';

// Sprint Z3 — bid-lifecycle Stage taxonomy populated into Notion "Bid Stage"
// select column. Mirrors pathfinder.projects.project_stage values but in a
// Notion-display-friendly format.
export type NotionBidStage =
  | 'Pre-Budget'
  | 'Solicitation'
  | 'GC Selected'
  | 'Sub Bid'
  | 'Mobilization'
  | 'Subs Selected'
  | 'Awarded'
  | 'Unknown';

// Sprint Z3 — Buy Window select column. "Open" = Zedcor should be reaching
// out NOW (GC has been picked and subs are getting chosen). "Closed" =
// either too early (pre-budget/solicitation) or too late (subs already
// selected, or federal-spending rows that are post-award reporting).
export type NotionBuyWindow = 'Open' | 'Closed' | 'Unknown';

// Sprint Z3 — Source Type select column. Lets Rep View filter out the
// 1,800+ federal-award rows (sam.gov / usaspending) that pollute the
// buy-window-relevant signal coming from public-construction RFPs.
export type NotionSourceType =
  | 'Public Construction'
  | 'Federal Contract'
  | 'Federal Spending'
  | 'State DOT'
  | 'County Purchasing'
  | 'School District'
  | 'News Report'
  | 'Other';

export type NotionRepStatus =
  | 'new'
  | 'reviewing'
  | 'contacted'
  | 'qualified'
  | 'not-relevant'
  | 'won'
  | 'lost';

/**
 * The shape the orchestrator hands to the Notion writer. Pulled from
 * pathfinder.projects + raw_payload jsonb (see SPEC-zedcor-source-adapters
 * §"PathfinderProject schema mapping (Z1A)").
 *
 * Field origins:
 * - Direct columns:   source, source_id, title, posted_date,
 *                     response_deadline, source_url, rationale, score,
 *                     project_stage (→ Phase)
 * - raw_payload->>X:  agency, city, county, state, estimated_value
 */
export interface NotionProjectInput {
  source: string;                  // source_slug, e.g. 'houston-obo'
  source_id: string;               // stable per-source opportunity id
  title: string;
  posted_date: string | null;      // ISO date (YYYY-MM-DD)
  response_deadline: string | null;
  source_url: string | null;
  rationale: string | null;
  score: number | null;
  phase: NotionPhase;
  agency: string | null;
  city: string | null;
  county: string | null;
  state: NotionState | string | null;
  estimated_value: number | null;
  // Sprint Z3 — bid-lifecycle taxonomy, buy-window evaluation, source-type
  // distinction. Optional so existing call sites (orchestrator Z1A) keep
  // compiling; the writer falls back to 'Unknown' values when omitted.
  project_stage?: string | null;       // pathfinder.projects.project_stage
  buy_window_open?: boolean | null;    // pathfinder.projects.buy_window_open
  source_authority?: string | null;    // pathfinder.projects.source_authority
}

export interface NotionWriteResult {
  leadId: string;             // e.g. 'ZED-1234'
  notionPageUrl: string;      // canonical Notion page URL
  alreadyExists: boolean;     // true if dedupe found an existing row
  notionPageId?: string;      // Sprint Z3.5 — page id for enrichment updates
}
