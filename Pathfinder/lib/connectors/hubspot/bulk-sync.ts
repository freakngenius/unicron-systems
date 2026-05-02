// lib/connectors/hubspot/bulk-sync.ts — paginated CRM read for HubSpot.
//
// Two public entry points:
//   previewSync(connectorId)            — returns approximate counts via
//                                          /search?limit=1 (no writes).
//   runBulkSync(connectorId, opts)      — paginated ingest into
//                                          pathfinder.hubspot_*_raw with
//                                          ON CONFLICT upsert.
//
// SPEC § 4.3: C-3A scope is OAuth + bulk read sync. Real-time webhooks
// (push deal-stage updates back to HubSpot) ship in C-3B. Stage→pipeline
// mapping ships in C-3C.
//
// Rate-limit policy (HubSpot Pro/Enterprise burst window):
//   100 req / 10s. We enforce a 100ms minimum between requests as a
//   simple soft cap. A 429 response triggers a single back-off + retry
//   with the Retry-After header honored; persistent 429s bubble up so
//   the orchestrator can decide.
//
// All writes go through the service-role Supabase client. Multi-tenant
// isolation comes from carrying customer_org_id on every row + via the
// connector_id FK (see migration 0108).

import { supabaseAdmin } from '@/lib/supabase';
import { getToken } from '@/lib/connectors/tokens';
import { recordAudit } from '@/lib/connectors/audit';
import { getConnectorById } from '@/lib/connectors/queries';

const HUBSPOT_API = 'https://api.hubapi.com';
const MIN_REQUEST_INTERVAL_MS = 100;
const DEFAULT_PAGE_SIZE = 100;

const DEAL_PROPERTIES = [
  'dealname',
  'dealstage',
  'amount',
  'closedate',
  'pipeline',
  'hs_object_id',
  'hs_lastmodifieddate',
];
const CONTACT_PROPERTIES = [
  'firstname',
  'lastname',
  'email',
  'phone',
  'hs_object_id',
  'lastmodifieddate',
];

export interface PreviewCounts {
  deals: number;
  contacts: number;
  engagements: number;
}

export interface BulkSyncOptions {
  /** Limit total objects ingested (per-type). Mainly for tests + smoke. */
  maxObjects?: number;
  /** When false, skip engagements (default false until scope known). */
  includeEngagements?: boolean;
  /** Test seam — substitute a fetch that doesn't hit HubSpot. */
  fetchImpl?: typeof fetch;
  /** Test seam — substitute the supabase admin builder. */
  supabaseImpl?: () => unknown;
  /** Test seam — substitute the token loader. */
  tokenLoader?: (connectorId: string) => Promise<{ access: string } | null>;
  /** Test seam — substitute the connector loader. */
  connectorLoader?: (connectorId: string) => Promise<{ id: string; customer_org_id: string } | null>;
  /** Override the per-batch minimum interval (for tests). */
  minIntervalMs?: number;
}

export interface BulkSyncResult {
  connector_id: string;
  customer_org_id: string;
  deals_imported: number;
  contacts_imported: number;
  engagements_imported: number;
  duration_ms: number;
  truncated: boolean;
  error?: string;
}

interface HubSpotSearchResponse {
  total?: number;
  results?: Array<{
    id: string;
    properties?: Record<string, unknown>;
    updatedAt?: string;
    createdAt?: string;
  }>;
  paging?: { next?: { after?: string } };
}

// ---------------------------------------------------------------------------
// Public entry: previewSync.
// ---------------------------------------------------------------------------

export async function previewSync(
  connectorId: string,
  opts: BulkSyncOptions = {},
): Promise<PreviewCounts> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const tokenLoader = opts.tokenLoader ?? defaultTokenLoader;
  const accessToken = await loadAccessToken(connectorId, tokenLoader);

  const deals = await searchTotal('deals', accessToken, fetchImpl, opts);
  const contacts = await searchTotal('contacts', accessToken, fetchImpl, opts);
  const engagements = opts.includeEngagements
    ? await searchTotal('engagements', accessToken, fetchImpl, opts)
    : 0;

  return { deals, contacts, engagements };
}

// ---------------------------------------------------------------------------
// Public entry: runBulkSync.
// ---------------------------------------------------------------------------

export async function runBulkSync(
  connectorId: string,
  opts: BulkSyncOptions = {},
): Promise<BulkSyncResult> {
  const startedAt = Date.now();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const supabaseImpl = opts.supabaseImpl ?? supabaseAdmin;
  const tokenLoader = opts.tokenLoader ?? defaultTokenLoader;
  const connectorLoader = opts.connectorLoader ?? defaultConnectorLoader;

  const connector = await connectorLoader(connectorId);
  if (!connector) {
    throw new Error(`bulk-sync: connector ${connectorId} not found`);
  }

  const accessToken = await loadAccessToken(connectorId, tokenLoader);

  const result: BulkSyncResult = {
    connector_id: connector.id,
    customer_org_id: connector.customer_org_id,
    deals_imported: 0,
    contacts_imported: 0,
    engagements_imported: 0,
    duration_ms: 0,
    truncated: false,
  };

  // Mark sync_running.
  await upsertSyncState(supabaseImpl, connector, {
    sync_running: true,
    sync_started_at: new Date().toISOString(),
    last_error: null,
  });

  try {
    const dealCount = await syncObjectType(
      'deals',
      'hubspot_deals_raw',
      DEAL_PROPERTIES,
      connector,
      accessToken,
      fetchImpl,
      supabaseImpl,
      opts,
    );
    result.deals_imported = dealCount.imported;
    result.truncated = result.truncated || dealCount.truncated;

    const contactCount = await syncObjectType(
      'contacts',
      'hubspot_contacts_raw',
      CONTACT_PROPERTIES,
      connector,
      accessToken,
      fetchImpl,
      supabaseImpl,
      opts,
    );
    result.contacts_imported = contactCount.imported;
    result.truncated = result.truncated || contactCount.truncated;

    if (opts.includeEngagements) {
      const engCount = await syncObjectType(
        'engagements',
        'hubspot_engagements_raw',
        ['hs_object_id'],
        connector,
        accessToken,
        fetchImpl,
        supabaseImpl,
        opts,
      );
      result.engagements_imported = engCount.imported;
      result.truncated = result.truncated || engCount.truncated;
    }

    await upsertSyncState(supabaseImpl, connector, {
      sync_running: false,
      last_full_sync_at: new Date().toISOString(),
      deals_imported: result.deals_imported,
      contacts_imported: result.contacts_imported,
      engagements_imported: result.engagements_imported,
      last_error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = message;
    await upsertSyncState(supabaseImpl, connector, {
      sync_running: false,
      last_error: message.slice(0, 500),
    });
    await recordAudit({
      connector_id: connector.id,
      customer_org_id: connector.customer_org_id,
      event_type: 'sync.bulk_failed',
      direction: 'inbound',
      status: 'failed',
      error_message: message.slice(0, 500),
    });
    throw err;
  }

  result.duration_ms = Date.now() - startedAt;
  return result;
}

// ---------------------------------------------------------------------------
// Internals.
// ---------------------------------------------------------------------------

async function defaultTokenLoader(connectorId: string): Promise<{ access: string } | null> {
  const t = await getToken(connectorId);
  if (!t) return null;
  return { access: t.access };
}

async function defaultConnectorLoader(
  connectorId: string,
): Promise<{ id: string; customer_org_id: string } | null> {
  const row = await getConnectorById(connectorId);
  if (!row) return null;
  return { id: row.id, customer_org_id: row.customer_org_id };
}

async function loadAccessToken(
  connectorId: string,
  loader: (id: string) => Promise<{ access: string } | null>,
): Promise<string> {
  const t = await loader(connectorId);
  if (!t) throw new Error(`bulk-sync: no active token for connector ${connectorId}`);
  return t.access;
}

interface ObjectTypeResult {
  imported: number;
  truncated: boolean;
}

async function syncObjectType(
  objectType: 'deals' | 'contacts' | 'engagements',
  rawTable: 'hubspot_deals_raw' | 'hubspot_contacts_raw' | 'hubspot_engagements_raw',
  properties: string[],
  connector: { id: string; customer_org_id: string },
  accessToken: string,
  fetchImpl: typeof fetch,
  supabaseImpl: () => unknown,
  opts: BulkSyncOptions,
): Promise<ObjectTypeResult> {
  let after: string | undefined;
  let imported = 0;
  let truncated = false;
  const max = opts.maxObjects ?? Infinity;
  const minInterval = opts.minIntervalMs ?? MIN_REQUEST_INTERVAL_MS;
  let lastRequestAt = 0;

  // Paginate via /search; HubSpot returns max 100 per page and the
  // `paging.next.after` cursor for the following batch.
  for (;;) {
    if (imported >= max) {
      truncated = true;
      break;
    }
    // Soft rate-limit gate.
    const now = Date.now();
    const wait = lastRequestAt + minInterval - now;
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    const body: Record<string, unknown> = {
      properties,
      limit: DEFAULT_PAGE_SIZE,
      sorts: [{ propertyName: 'hs_object_id', direction: 'ASCENDING' }],
    };
    if (after) body.after = after;

    const res = await fetchWithRetry(
      fetchImpl,
      `${HUBSPOT_API}/crm/v3/objects/${objectType}/search`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`hubspot search ${objectType} failed: ${res.status} ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as HubSpotSearchResponse;
    const results = json.results ?? [];
    if (results.length === 0) break;

    const rows = results.map((r) => ({
      connector_id: connector.id,
      hs_object_id: r.id,
      customer_org_id: connector.customer_org_id,
      properties: r.properties ?? {},
      fetched_at: new Date().toISOString(),
      modified_at: pickModifiedAt(r.properties, r.updatedAt),
    }));
    await upsertRawBatch(supabaseImpl, rawTable, rows);
    imported += rows.length;

    await recordAudit({
      connector_id: connector.id,
      customer_org_id: connector.customer_org_id,
      event_type: 'sync.bulk_batch',
      direction: 'inbound',
      status: 'received',
      payload_summary: {
        object_type: objectType,
        batch_size: rows.length,
        running_total: imported,
      },
    });

    after = json.paging?.next?.after;
    if (!after) break;
  }

  return { imported, truncated };
}

function pickModifiedAt(
  properties: Record<string, unknown> | undefined,
  fallback: string | undefined,
): string | null {
  if (properties) {
    const candidates = ['hs_lastmodifieddate', 'lastmodifieddate', 'updatedAt'];
    for (const k of candidates) {
      const v = properties[k];
      if (typeof v === 'string' && v.length > 0) return v;
    }
  }
  return fallback ?? null;
}

interface UpsertableRow {
  connector_id: string;
  hs_object_id: string;
  customer_org_id: string;
  properties: Record<string, unknown>;
  fetched_at: string;
  modified_at: string | null;
}

async function upsertRawBatch(
  supabaseImpl: () => unknown,
  tableName: 'hubspot_deals_raw' | 'hubspot_contacts_raw' | 'hubspot_engagements_raw',
  rows: UpsertableRow[],
): Promise<void> {
  const sb = supabaseImpl() as unknown as {
    from: (t: string) => {
      upsert: (
        rows: UpsertableRow[],
        opts: { onConflict: string },
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
  const res = await sb
    .from(tableName)
    .upsert(rows, { onConflict: 'connector_id,hs_object_id' });
  if (res.error) {
    throw new Error(`upsert ${tableName} failed: ${res.error.message}`);
  }
}

interface SyncStateUpdate {
  sync_running?: boolean;
  sync_started_at?: string;
  last_full_sync_at?: string;
  last_incremental_sync_at?: string;
  deals_imported?: number;
  contacts_imported?: number;
  engagements_imported?: number;
  last_error?: string | null;
}

async function upsertSyncState(
  supabaseImpl: () => unknown,
  connector: { id: string; customer_org_id: string },
  fields: SyncStateUpdate,
): Promise<void> {
  const sb = supabaseImpl() as unknown as {
    from: (t: string) => {
      upsert: (
        rows: Record<string, unknown>,
        opts: { onConflict: string },
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
  const row: Record<string, unknown> = {
    connector_id: connector.id,
    customer_org_id: connector.customer_org_id,
    ...fields,
  };
  const res = await sb
    .from('hubspot_sync_state')
    .upsert(row, { onConflict: 'connector_id' });
  if (res.error) {
    throw new Error(`upsert hubspot_sync_state failed: ${res.error.message}`);
  }
}

async function searchTotal(
  objectType: 'deals' | 'contacts' | 'engagements',
  accessToken: string,
  fetchImpl: typeof fetch,
  _opts: BulkSyncOptions,
): Promise<number> {
  const body = {
    limit: 1,
    properties: ['hs_object_id'],
  };
  const res = await fetchWithRetry(
    fetchImpl,
    `${HUBSPOT_API}/crm/v3/objects/${objectType}/search`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`hubspot preview ${objectType} failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as HubSpotSearchResponse;
  return typeof json.total === 'number' ? json.total : 0;
}

/**
 * Single-retry wrapper that honors the HubSpot Retry-After header on 429.
 * Persistent 429s after one back-off propagate up so callers can decide.
 */
async function fetchWithRetry(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const res = await fetchImpl(url, init);
  if (res.status !== 429) return res;
  const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
  await sleep(Math.min(Math.max(retryAfter, 250), 5000));
  return fetchImpl(url, init);
}

function parseRetryAfter(value: string | null): number {
  if (!value) return 1000;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n * 1000;
  return 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
