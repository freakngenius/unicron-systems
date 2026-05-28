// lib/notion/types.ts
//
// Sprint Z1A — types for the Zedcor Houston Notion writer.
// Mirrors the schema of database 856b43a02b4d43649344c5e1a05d206d
// ("Zedcor Houston — Lead Feed").

export type NotionPhase = 'pre-bid' | 'open' | 'closing-soon' | 'awarded' | 'unknown';

export type NotionState = 'TX' | 'LA' | 'OK' | 'AR';

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
}

export interface NotionWriteResult {
  leadId: string;             // e.g. 'ZED-1234'
  notionPageUrl: string;      // canonical Notion page URL
  alreadyExists: boolean;     // true if dedupe found an existing row
  notionPageId?: string;      // Sprint Z3.5 — page id for enrichment updates
}
