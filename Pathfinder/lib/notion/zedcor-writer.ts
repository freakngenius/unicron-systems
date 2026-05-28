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
  NotionPhase,
  NotionProjectInput,
  NotionState,
  NotionWriteResult,
} from './types';

const ALLOWED_STATES: ReadonlySet<NotionState> = new Set<NotionState>(['TX', 'LA', 'OK', 'AR']);

const ALLOWED_PHASES: ReadonlySet<NotionPhase> = new Set<NotionPhase>([
  'pre-bid', 'open', 'closing-soon', 'awarded', 'unknown',
]);

function notionClient(): Client {
  const token = process.env.NOTION_API_TOKEN;
  if (!token) throw new Error('NOTION_API_TOKEN is not set');
  return new Client({ auth: token });
}

function databaseId(): string {
  const id = process.env.ZEDCOR_NOTION_DB_ID ?? '856b43a02b4d43649344c5e1a05d206d';
  return id;
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

  return {
    Title: title(input.title),
    Phase: select<NotionPhase>(phase),
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
  const dbId = databaseId();
  const res = (await (client as unknown as {
    databases: {
      query: (args: {
        database_id: string;
        filter: unknown;
        page_size: number;
      }) => Promise<{ results: NotionQueryResultPage[] }>;
    };
  }).databases.query({
    database_id: dbId,
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
