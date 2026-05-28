// lib/notion/zedcor-writer.ts
//
// Sprint Z1A — Notion writer for the Zedcor Houston Lead Feed database
// (856b43a02b4d43649344c5e1a05d206d).
//
// Single entry point: writeProjectToNotion(project) creates a new Notion
// page or returns the existing one if a row with the same Project ID
// already exists. Dedup primitive is the source-prefixed signature
// '<source_slug>:<source_id>' written to the "Project ID" property.
//
// Spec: Specs/SPEC-zedcor-tier1-manual.md §"Notion writer contract".

import { Client } from '@notionhq/client';
import type {
  NotionBidStage,
  NotionBuyWindow,
  NotionPhase,
  NotionProjectInput,
  NotionSourceType,
  NotionState,
  NotionWriteResult,
} from './types';

const ALLOWED_STATES: ReadonlySet<NotionState> = new Set<NotionState>(['TX', 'LA', 'OK', 'AR']);

const ALLOWED_PHASES: ReadonlySet<NotionPhase> = new Set<NotionPhase>([
  'pre-bid', 'open', 'closing-soon', 'awarded', 'unknown',
]);

// Sprint Z3 — federal awards (sam.gov / usaspending) don't have an active
// buy window for site-services subs; they're post-award reporting. The
// Notion writer treats them as Closed regardless of project_stage.
const FEDERAL_AUTHORITIES: ReadonlySet<string> = new Set([
  'federal_contract',
  'federal_spending',
]);

const SOURCE_TYPE_MAP: Record<string, NotionSourceType> = {
  public_construction: 'Public Construction',
  federal_contract: 'Federal Contract',
  federal_spending: 'Federal Spending',
  state_dot: 'State DOT',
  county_purchasing: 'County Purchasing',
  school_district: 'School District',
  news_report: 'News Report',
  other: 'Other',
};

// Spec mapping (Sprint Z3 §"Wave 2: Notion writer"). Some project_stage
// values resolve to different Bid Stage values depending on source_authority
// (an 'awarded' federal contract is "Awarded"; an 'awarded' city contract is
// "GC Selected" because the GC was just picked and subs are about to bid).
function bidStageFor(
  projectStage: string | null | undefined,
  sourceAuthority: string | null | undefined,
): NotionBidStage {
  const stage = (projectStage ?? '').toLowerCase();
  const authority = (sourceAuthority ?? '').toLowerCase();
  const isFederal = FEDERAL_AUTHORITIES.has(authority);
  switch (stage) {
    case 'pre_budget':
    case 'pre-budget':
      return 'Pre-Budget';
    case 'solicitation':
    case 'owner_bid':
    case 'rfp':
      return 'Solicitation';
    case 'awarded':
      return isFederal ? 'Awarded' : 'GC Selected';
    case 'gc_selected':
      return 'GC Selected';
    case 'sub_bid':
      return 'Sub Bid';
    case 'mobilization':
      return 'Mobilization';
    case 'subs_selected':
      return 'Subs Selected';
    default:
      return 'Unknown';
  }
}

function buyWindowFor(
  projectStage: string | null | undefined,
  sourceAuthority: string | null | undefined,
  buyWindowOpen: boolean | null | undefined,
  postedDate: string | null | undefined,
): NotionBuyWindow {
  const authority = (sourceAuthority ?? '').toLowerCase();
  if (FEDERAL_AUTHORITIES.has(authority)) return 'Closed';
  const stage = (projectStage ?? '').toLowerCase();

  // Explicit signal from the adapter / orchestrator wins.
  if (buyWindowOpen === true) return 'Open';
  if (buyWindowOpen === false) {
    // The orchestrator may stamp false on a row that ages back into Open
    // later — re-evaluate via stage + posted_date below before defaulting.
  }

  const isOpenStage = stage === 'awarded' || stage === 'gc_selected' || stage === 'sub_bid';
  const isMobilization = stage === 'mobilization';
  if (!isOpenStage && !isMobilization) return 'Closed';

  // Aging: open-stages last 60 days from posted_date, mobilization 30 days.
  if (!postedDate) return 'Open'; // no posted_date = assume fresh
  const t = new Date(postedDate).getTime();
  if (!Number.isFinite(t)) return 'Open';
  const ageDays = (Date.now() - t) / (1000 * 60 * 60 * 24);
  const ceiling = isMobilization ? 30 : 60;
  return ageDays <= ceiling ? 'Open' : 'Closed';
}

function sourceTypeFor(sourceAuthority: string | null | undefined): NotionSourceType {
  const key = (sourceAuthority ?? '').toLowerCase();
  return SOURCE_TYPE_MAP[key] ?? 'Other';
}

function notionClient(): Client {
  const token = process.env.NOTION_API_TOKEN;
  if (!token) throw new Error('NOTION_API_TOKEN is not set');
  return new Client({ auth: token });
}

function databaseId(): string {
  const id = process.env.ZEDCOR_NOTION_DB_ID ?? '856b43a02b4d43649344c5e1a05d206d';
  return id;
}

// Sprint Z5.2 — Notion SDK v5 moved `databases.query` to `dataSources.query`
// keyed by `data_source_id`. The Zedcor Houston Lead Feed DB
// (`856b43a02b4d43649344c5e1a05d206d`) has a single data source — its UUID
// is stable and equal to the value below. Override via env when migrating
// between Notion workspaces. Page-create still accepts `parent.database_id`
// in v5 (back-compat), so only the query path needs the data-source id.
function dataSourceId(): string {
  return (
    process.env.ZEDCOR_NOTION_DATA_SOURCE_ID ??
    '39b001e3-fa1f-4fbf-aeea-219d4ef2b19a'
  );
}

function richText(value: string | null | undefined) {
  if (!value) return { rich_text: [] as const };
  return {
    rich_text: [{ type: 'text' as const, text: { content: String(value).slice(0, 2000) } }],
  };
}

function title(value: string) {
  return {
    title: [{ type: 'text' as const, text: { content: String(value).slice(0, 2000) } }],
  };
}

function isoDate(value: string | null | undefined): { date: { start: string } | null } {
  if (!value) return { date: null };
  // Accept either YYYY-MM-DD or full ISO; normalize to YYYY-MM-DD.
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return { date: null };
  const d = new Date(t).toISOString().slice(0, 10);
  return { date: { start: d } };
}

function select<T extends string>(name: T | null | undefined) {
  if (!name) return { select: null };
  return { select: { name } };
}

function url(value: string | null | undefined) {
  if (!value) return { url: null };
  return { url: String(value) };
}

function number(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return { number: null };
  return { number: value };
}

// Sprint Z3.5 — additive helpers used by enrichmentToNotionProperties().
// Existing property mappings above are unchanged.

function emailProp(value: string | null | undefined): { email: string | null } {
  if (!value || !/@/.test(value)) return { email: null };
  return { email: String(value).trim() };
}

function phoneProp(value: string | null | undefined): { phone_number: string | null } {
  if (!value) return { phone_number: null };
  return { phone_number: String(value).trim() };
}

function projectIdSignature(input: NotionProjectInput): string {
  return `${input.source}:${input.source_id}`;
}

// Sprint Z3.5 — shape of the gc_metadata jsonb (mirror of GcMetadata in
// lib/adapters/zedcor/gc-extractor.ts; redeclared here so this module
// stays a leaf dependency of the adapter, not the other way around).
export interface ZedcorGcMetadata {
  gc_name?: string | null;
  gc_award_date?: string | null;
  gc_contact_name?: string | null;
  gc_contact_role?: string | null;
  gc_contact_email?: string | null;
  gc_contact_phone?: string | null;
  sub_bid_deadline?: string | null;
  subcontract_package_url?: string | null;
}

/**
 * Sprint Z3.5 — Map a gc_metadata bundle to its Notion property shape.
 * Returns only the 8 enrichment properties; merge additively into the
 * properties object built by buildProperties() (or use directly in
 * updateProjectEnrichmentInNotion for the backfill path).
 *
 * Returning an empty object when no fields are populated keeps Notion
 * pages.update calls no-ops for projects that never enriched.
 */
export function enrichmentToNotionProperties(
  meta: ZedcorGcMetadata | null | undefined,
): Record<string, unknown> {
  if (!meta) return {};
  const props: Record<string, unknown> = {};
  if (meta.gc_name !== undefined) props['GC Name'] = richText(meta.gc_name);
  if (meta.gc_award_date !== undefined) props['GC Award Date'] = isoDate(meta.gc_award_date);
  if (meta.gc_contact_name !== undefined) props['GC Contact Name'] = richText(meta.gc_contact_name);
  if (meta.gc_contact_role !== undefined) props['GC Contact Role'] = richText(meta.gc_contact_role);
  if (meta.gc_contact_email !== undefined) props['GC Contact Email'] = emailProp(meta.gc_contact_email);
  if (meta.gc_contact_phone !== undefined) props['GC Contact Phone'] = phoneProp(meta.gc_contact_phone);
  if (meta.sub_bid_deadline !== undefined) props['Sub-Bid Deadline'] = isoDate(meta.sub_bid_deadline);
  if (meta.subcontract_package_url !== undefined) props['Subcontract Package URL'] = url(meta.subcontract_package_url);
  return props;
}

interface UniqueIdProp {
  type: 'unique_id';
  unique_id: { prefix: string | null; number: number | null };
}

function readLeadId(page: { id: string; url: string; properties: Record<string, unknown> }): string {
  const prop = page.properties['Lead ID'] as UniqueIdProp | undefined;
  if (prop && prop.unique_id && prop.unique_id.number !== null) {
    const prefix = prop.unique_id.prefix ?? 'ZED';
    return `${prefix}-${prop.unique_id.number}`;
  }
  return `notion-${page.id.replace(/-/g, '').slice(0, 8)}`;
}

/**
 * Map a normalized project to Notion DB properties. Out-of-geofence
 * states write with State=null and a rationale annotation per the spec.
 */
function buildProperties(input: NotionProjectInput): Record<string, unknown> {
  const phase: NotionPhase = ALLOWED_PHASES.has(input.phase) ? input.phase : 'unknown';
  const stateValue = (input.state ?? '').toUpperCase() as NotionState;
  const stateInGeofence = ALLOWED_STATES.has(stateValue);
  const stateForNotion = stateInGeofence ? stateValue : null;

  const rationaleParts: string[] = [];
  if (!stateInGeofence && input.state) rationaleParts.push(`[geofence_outside_primary state=${input.state}]`);
  if (input.score === null) rationaleParts.push('(scoring disabled)');
  if (input.rationale) rationaleParts.push(input.rationale);
  const rationaleText = rationaleParts.length > 0 ? rationaleParts.join(' ').trim() : null;

  // Sprint Z3 — Bid Stage / Buy Window / Source Type. Always set so Rep View
  // can filter on the new properties even for legacy federal-award rows.
  const bidStage = bidStageFor(input.project_stage, input.source_authority);
  const buyWindow = buyWindowFor(
    input.project_stage,
    input.source_authority,
    input.buy_window_open,
    input.posted_date,
  );
  const sourceType = sourceTypeFor(input.source_authority);

  return {
    Title: title(input.title),
    Phase: select<NotionPhase>(phase),
    'Bid Stage': select<NotionBidStage>(bidStage),
    'Buy Window': select<NotionBuyWindow>(buyWindow),
    'Source Type': select<NotionSourceType>(sourceType),
    Score: number(input.score),
    'Rep Status': select('new'),
    'Response Deadline': isoDate(input.response_deadline),
    'Posted Date': isoDate(input.posted_date),
    Agency: richText(input.agency),
    City: richText(input.city),
    County: richText(input.county),
    State: select(stateForNotion),
    'Estimated Value': number(input.estimated_value),
    Source: richText(input.source),
    'Source URL': url(input.source_url),
    'Project ID': richText(projectIdSignature(input)),
    Rationale: richText(rationaleText),
    // Never set 'Rep Notes' — rep-owned column.
  };
}

interface NotionQueryResultPage {
  id: string;
  url: string;
  properties: Record<string, unknown>;
}

async function findExisting(client: Client, projectId: string): Promise<NotionQueryResultPage | null> {
  const dsId = dataSourceId();
  const res = (await (client as unknown as {
    dataSources: {
      query: (args: {
        data_source_id: string;
        filter: unknown;
        page_size: number;
      }) => Promise<{ results: NotionQueryResultPage[] }>;
    };
  }).dataSources.query({
    data_source_id: dsId,
    filter: {
      property: 'Project ID',
      rich_text: { equals: projectId },
    },
    page_size: 1,
  }));
  return res.results[0] ?? null;
}

/**
 * Idempotent Notion write: dedupes by Project ID property. Returns the
 * Notion lead ID (e.g. 'ZED-1234') and the canonical page URL.
 *
 * Re-runs of an existing project never overwrite Rep Status (already-set
 * triage state is rep-owned).
 *
 * Sprint Z3.5 — Optionally accepts a gc_metadata bundle which is appended
 * additively to the property set on the create path. Existing rows are
 * NOT mutated here; the backfill uses updateProjectEnrichmentInNotion()
 * for that, which still honors the rep-owned Rep Status / Rep Notes rule.
 */
export async function writeProjectToNotion(
  input: NotionProjectInput,
  enrichment?: ZedcorGcMetadata | null,
): Promise<NotionWriteResult> {
  const client = notionClient();
  const projectId = projectIdSignature(input);

  const existing = await findExisting(client, projectId);
  if (existing) {
    return {
      leadId: readLeadId(existing),
      notionPageUrl: existing.url,
      alreadyExists: true,
      notionPageId: existing.id,
    };
  }

  const properties = {
    ...buildProperties(input),
    ...enrichmentToNotionProperties(enrichment ?? null),
  };
  const created = (await (client as unknown as {
    pages: {
      create: (args: {
        parent: { database_id: string };
        properties: Record<string, unknown>;
      }) => Promise<NotionQueryResultPage>;
    };
  }).pages.create({
    parent: { database_id: databaseId() },
    properties,
  }));

  return {
    leadId: readLeadId(created),
    notionPageUrl: created.url,
    alreadyExists: false,
    notionPageId: created.id,
  };
}

/**
 * Sprint Z3.5 — Find the existing Notion page for a project (by the same
 * dedup signature writeProjectToNotion uses) and return its page id, lead
 * id, and URL. Returns null if no row exists. Used by the backfill to
 * decide between update-in-place and create-new.
 */
export async function findExistingProjectInNotion(
  source: string,
  source_id: string,
): Promise<{ leadId: string; notionPageUrl: string; notionPageId: string } | null> {
  const client = notionClient();
  const existing = await findExisting(client, `${source}:${source_id}`);
  if (!existing) return null;
  return {
    leadId: readLeadId(existing),
    notionPageUrl: existing.url,
    notionPageId: existing.id,
  };
}

/**
 * Sprint Z3.5 — Update enrichment-only properties on an existing Notion
 * page. Strictly additive: only the 8 GC + contact + sub-bid columns are
 * touched. Never modifies Rep Status, Rep Notes, Phase, Score, etc.
 */
export async function updateProjectEnrichmentInNotion(
  notionPageId: string,
  enrichment: ZedcorGcMetadata,
): Promise<void> {
  const props = enrichmentToNotionProperties(enrichment);
  if (Object.keys(props).length === 0) return;
  const client = notionClient();
  await (client as unknown as {
    pages: {
      update: (args: { page_id: string; properties: Record<string, unknown> }) => Promise<unknown>;
    };
  }).pages.update({ page_id: notionPageId, properties: props });
}

// ─────────────────────────────────────────────────────────────────────────
// Sprint Z4 — additive pitch-metadata writer.
//
// New columns (already provisioned in the Notion DB):
//   Cross-Pollination, Warm Intro Path,
//   Pitch Hook 1, Pitch Hook 2, Pitch Hook 3,
//   Recommended Action, Action By Date.
//
// This block ONLY adds new helpers + a new updatePitchOnNotion entry point.
// It does not modify any existing function above. Safe to merge in parallel
// with Z3 (phase mapping) and Z3.5 (GC mapping); see file-ownership notes
// in SPEC-zedcor-z4-cross-pollination-pitch.md.
// ─────────────────────────────────────────────────────────────────────────

export interface NotionPitchInput {
  cross_pollination: string | null;
  warm_intro_path: string | null;
  pitch_hooks: [string, string, string] | string[] | null;
  recommended_action: string | null;
  action_by_date: string | null;     // YYYY-MM-DD
}

export function pitchToNotionProperties(input: NotionPitchInput): Record<string, unknown> {
  const hooks = Array.isArray(input.pitch_hooks) ? input.pitch_hooks : [];
  return {
    'Cross-Pollination': richText(input.cross_pollination),
    'Warm Intro Path': richText(input.warm_intro_path),
    'Pitch Hook 1': richText(hooks[0] ?? null),
    'Pitch Hook 2': richText(hooks[1] ?? null),
    'Pitch Hook 3': richText(hooks[2] ?? null),
    'Recommended Action': richText(input.recommended_action),
    'Action By Date': isoDate(input.action_by_date),
  };
}

/**
 * Update an existing Notion page with the Z4 pitch-metadata properties.
 * Returns the page URL on success. Throws on Notion API error.
 *
 * Idempotent: re-runs overwrite the pitch fields with the latest values.
 * Never touches Rep Status, Rep Notes, or any column outside the pitch set.
 */
export async function updateProjectPitchOnNotion(args: {
  pageId: string;
  pitch: NotionPitchInput;
}): Promise<{ pageId: string }> {
  const client = notionClient();
  const properties = pitchToNotionProperties(args.pitch);
  await (client as unknown as {
    pages: {
      update: (args: {
        page_id: string;
        properties: Record<string, unknown>;
      }) => Promise<{ id: string }>;
    };
  }).pages.update({
    page_id: args.pageId,
    properties,
  });
  return { pageId: args.pageId };
}

/**
 * Convenience: locate a Zedcor page by project signature and update its
 * pitch metadata. Used by the Z4 backfill script. Returns null if no row.
 */
export async function updateProjectPitchBySignature(args: {
  source: string;
  source_id: string;
  pitch: NotionPitchInput;
}): Promise<{ pageId: string; notionPageUrl: string } | null> {
  const client = notionClient();
  const sig = `${args.source}:${args.source_id}`;
  const existing = await findExisting(client, sig);
  if (!existing) return null;
  await updateProjectPitchOnNotion({ pageId: existing.id, pitch: args.pitch });
  return { pageId: existing.id, notionPageUrl: existing.url };
}
