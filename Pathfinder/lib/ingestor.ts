// lib/ingestor.ts — Ingestor agent payload orchestrator.
//
// Pulls construction + security awards from USAspending and SAM.gov, dedupes
// against `pathfinder.projects`, and inserts new rows. Lives outside
// `app/api/cron/ingestor/route.ts` because Next.js App Router only allows
// specific exports from route files.
//
// Two source connectors only for this iteration. Google News (RSS) and
// the Harris County permits portal (browser automation) ship later when
// the news-source decision lands and Perplexity contest support responds.

import { supabaseAdmin } from '@/lib/supabase';
import { inngest } from '@/lib/inngest/client';
import { extractStateFromPayload } from '@/lib/zedcor/state-centroids';
import { detectCountryFromPayload } from '@/lib/zedcor/country-detect';
import { geocodeLocation } from '@/lib/zedcor/google-geocoder';

// ────────────────────────────────────────────────────────────────────────
// Service-role admin client (lazy)
// ────────────────────────────────────────────────────────────────────────

let _admin: ReturnType<typeof supabaseAdmin> | null = null;
function admin() {
  if (!_admin) _admin = supabaseAdmin();
  return _admin;
}

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

export type IngestorSource = 'usaspending' | 'sam.gov';

export interface IngestorRecord {
  id: string; // canonical PK = `${source}:${source_id}`
  source: IngestorSource;
  source_id: string;
  title: string;
  summary: string | null;
  project_value: number | null;
  project_stage: string | null;
  posted_date: string | null; // ISO date
  raw_payload: Record<string, unknown>;
  // Z-F: lat/lon now seeded at ingest time using state-centroid lookup
  // against the place-of-performance state code in raw_payload. This is
  // a deterministic free fallback so the Ranker can compute branch
  // proximity + the radius map shows the new lead. Replaceable by a
  // street-level geocoder later. Null when the payload exposes no state.
  lat: number | null;
  lon: number | null;
  // Demo Polish P1 — country detected at ingest from raw_payload.
  // ISO-3 code (USA / CAN / ROU / ...) when known; null otherwise (the
  // backfill / Haiku fallback can populate it later for legacy rows).
  country: string | null;
  // Demo Polish P1 — set when the ingest country filter rejects a record
  // before scoring. The Ranker should never see these rows; we still
  // insert them so the rejected pile counts the volume of foreign noise
  // we're filtering out.
  rejection_reason: string | null;
  rejected_at: string | null;
}

export interface IngestorCycleStats {
  source_counts: Record<IngestorSource, { fetched: number; inserted: number; deduped: number; errors: number }>;
  total_fetched: number;
  total_inserted: number;
  total_deduped: number;
  total_errors: number;
  // Demo Polish P1 — number of records that hit the ingest country filter
  // (rejection_reason='out_of_country'). Counted across both adapters.
  total_rejected_out_of_country: number;
}

// Demo Polish P1 — allowed-country whitelist for the ingest filter. The
// ingestor reads this once at the start of a cycle (loaded lazily by
// loadAllowedCountries) so we don't hit the DB per-record. Defaults to
// USA/CAN when org_geo_config isn't readable (preserves existing behavior).
const FALLBACK_ALLOWED_COUNTRIES = ['USA', 'CAN'];

let _allowedCountriesCache: { fetched_at: number; values: string[] } | null = null;
const ALLOWED_COUNTRIES_TTL_MS = 5 * 60_000;

async function loadAllowedCountries(): Promise<string[]> {
  if (
    _allowedCountriesCache &&
    Date.now() - _allowedCountriesCache.fetched_at < ALLOWED_COUNTRIES_TTL_MS
  ) {
    return _allowedCountriesCache.values;
  }
  try {
    const sb = admin() as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{
              data: { allowed_countries: string[] | null } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
    const { data } = await sb
      .from('org_geo_config')
      .select('allowed_countries')
      .eq('org_id', 'zedcor')
      .maybeSingle();
    const values = (data?.allowed_countries ?? []).map((c) => c.toUpperCase());
    const finalValues = values.length > 0 ? values : FALLBACK_ALLOWED_COUNTRIES;
    _allowedCountriesCache = { fetched_at: Date.now(), values: finalValues };
    return finalValues;
  } catch {
    return FALLBACK_ALLOWED_COUNTRIES;
  }
}

/** Apply Demo Polish P1 Layer A — populate `country` and stamp
 *  rejection_reason='out_of_country' when the detected country isn't on the
 *  allowed list. Mutates the record in place for ergonomics. */
export function applyCountryFilter(
  record: IngestorRecord,
  allowed: ReadonlyArray<string>,
): { rejected: boolean } {
  const country = detectCountryFromPayload(record.raw_payload);
  record.country = country;
  if (!country) {
    // No country signal — let the row through; the backfill / Haiku
    // fallback can decide later. Geo-unknown handling lives in the Ranker.
    return { rejected: false };
  }
  const upper = country.toUpperCase();
  if (allowed.includes(upper)) {
    return { rejected: false };
  }
  record.rejection_reason = 'out_of_country';
  record.rejected_at = new Date().toISOString();
  return { rejected: true };
}

// ────────────────────────────────────────────────────────────────────────
// agent_log helper
// ────────────────────────────────────────────────────────────────────────

type LogPayload = Record<string, unknown> & { message: string };

export async function writeIngestorLog(args: {
  eventType: string;
  data: LogPayload;
  latency_ms?: number;
}): Promise<void> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
  };
  try {
    await sb.from('agent_log').insert({
      agent_name: 'ingestor',
      event_type: args.eventType,
      event_data: args.data,
      latency_ms: args.latency_ms ?? null,
    });
  } catch {
    // best-effort
  }
}

// ────────────────────────────────────────────────────────────────────────
// USAspending connector — POST /api/v2/search/spending_by_award/
//
// Public, no auth. Filters: award type codes A/B/C/D (procurement
// contracts), period of performance start in the last 30 days, NAICS
// codes for construction (`23`) and architectural/engineering (`5413`).
//
// Window widened from 14 to 30 days during Z-F finish Option B to lift
// per-target-branch lead volume in Nashville/Pittsburgh/LA. The Z-F
// integrator surfaced that 14-day local volume in those metros was
// insufficient to produce ≥5 leads ≥90 per branch.
// ────────────────────────────────────────────────────────────────────────

const USASPENDING_URL = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';
const USASPENDING_LOOKBACK_DAYS = 30;
const USASPENDING_LIMIT = 100;

interface UsaspendingResult {
  'generated_internal_id'?: string;
  'Award ID'?: string;
  'Recipient Name'?: string;
  'Award Amount'?: number | string | null;
  'Description'?: string | null;
  'Period of Performance Start Date'?: string | null;
  'Period of Performance Current End Date'?: string | null;
  'Awarding Agency'?: string | null;
  'Place of Performance State Code'?: string | null;
  'Place of Performance City Code'?: string | null;
  'awarding_agency_id'?: string | number | null;
  // ...other fields ignored
}

export async function fetchUsaspendingRecent(): Promise<{ records: IngestorRecord[]; raw_count: number; latency_ms: number; error?: string }> {
  const start = Date.now();
  const today = new Date();
  const cutoff = new Date(today.getTime() - USASPENDING_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  // Flat array of 6-digit NAICS prefixes. The earlier `{require: [...]}`
  // object shape returned a 422 from USAspending — their advanced-search
  // API expects either an array of strings OR an array of {require,exclude}
  // objects, not a bare object. Strings are simpler and equivalent for our
  // construction + engineering coverage.
  const body = {
    filters: {
      award_type_codes: ['A', 'B', 'C', 'D'],
      time_period: [{ start_date: fmt(cutoff), end_date: fmt(today) }],
      naics_codes: [
        '236110', // Residential Building Construction
        '236210', // Industrial Building Construction
        '236220', // Commercial and Institutional Building Construction
        '237110', // Water and Sewer Line Construction
        '237310', // Highway, Street, and Bridge Construction
        '541330', // Engineering Services
        '541380', // Testing Laboratories
        '561621', // Security Systems Services
      ],
    },
    fields: [
      'Award ID',
      'Recipient Name',
      'Award Amount',
      'Description',
      'Period of Performance Start Date',
      'Period of Performance Current End Date',
      'Awarding Agency',
      'Place of Performance State Code',
      'Place of Performance City Code',
      'generated_internal_id',
    ],
    // USAspending's `sort` accepts a closed set of field names that does
    // NOT include "Period of Performance Start Date" (run 102 returned
    // 400 with the valid list). 'Award Amount' is reliably present and
    // gives us highest-value awards first — useful demo bias anyway.
    sort: 'Award Amount',
    order: 'desc',
    limit: USASPENDING_LIMIT,
  };

  try {
    const res = await fetch(USASPENDING_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        records: [],
        raw_count: 0,
        latency_ms: Date.now() - start,
        error: `${res.status} ${text.slice(0, 200)}`,
      };
    }
    const json = (await res.json()) as { results?: UsaspendingResult[] };
    const results = json.results ?? [];
    const records: IngestorRecord[] = [];
    for (const r of results) {
      const source_id = r.generated_internal_id ?? r['Award ID'];
      if (!source_id) continue;
      const value = numericOr(r['Award Amount'], null);
      const title = composeUsaspendingTitle(r);
      const rawPayload = r as unknown as Record<string, unknown>;
      const centroid = extractStateFromPayload(rawPayload);
      records.push({
        id: `usaspending:${source_id}`,
        source: 'usaspending',
        source_id: String(source_id),
        title,
        summary: truncate(r['Description'] ?? null, 320),
        project_value: value,
        project_stage: 'awarded', // USAspending records are obligated awards
        posted_date: r['Period of Performance Start Date'] ?? null,
        raw_payload: rawPayload,
        lat: centroid?.lat ?? null,
        lon: centroid?.lon ?? null,
        country: null,
        rejection_reason: null,
        rejected_at: null,
      });
    }
    return { records, raw_count: results.length, latency_ms: Date.now() - start };
  } catch (e) {
    return {
      records: [],
      raw_count: 0,
      latency_ms: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function composeUsaspendingTitle(r: UsaspendingResult): string {
  const recipient = r['Recipient Name'] ?? 'Unknown recipient';
  const agency = r['Awarding Agency'] ?? '';
  const desc = (r['Description'] ?? '').trim().split(/\s+/).slice(0, 12).join(' ');
  const head = agency ? `${agency} award` : 'Federal contract award';
  const tail = desc ? `: ${desc}` : '';
  return truncate(`${head} to ${recipient}${tail}`, 120);
}

// ────────────────────────────────────────────────────────────────────────
// SAM.gov connector — GET /opportunities/v2/search
//
// Requires SAM_GOV_API_KEY (env var). Filters: NAICS codes 23* / 5413*,
// posted in the last 30 days, opportunity types Solicitation /
// Award Notice / Sources Sought / Presolicitation.
//
// Window widened from 14 to 30 days during Z-F finish Option B (paired
// with USAspending widening above) to lift per-target-branch lead volume.
// ────────────────────────────────────────────────────────────────────────

const SAMGOV_URL = 'https://api.sam.gov/opportunities/v2/search';
const SAMGOV_LOOKBACK_DAYS = 30;
const SAMGOV_LIMIT = 100;

interface SamgovOpportunity {
  noticeId?: string;
  title?: string;
  description?: string | null;
  postedDate?: string;
  type?: string; // 'Solicitation', 'Award Notice', etc.
  naicsCode?: string;
  awardAmount?: string | number | null;
  baseAndAllOptionsValue?: string | number | null;
  placeOfPerformance?: { city?: { name?: string }; state?: { name?: string; code?: string } } | null;
  // ...other fields ignored
}

export async function fetchSamGovRecent(): Promise<{ records: IngestorRecord[]; raw_count: number; latency_ms: number; error?: string }> {
  const start = Date.now();
  const apiKey = process.env.SAM_GOV_API_KEY;
  if (!apiKey) {
    return {
      records: [],
      raw_count: 0,
      latency_ms: 0,
      error: 'SAM_GOV_API_KEY is not set',
    };
  }
  const today = new Date();
  const cutoff = new Date(today.getTime() - SAMGOV_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  // SAM.gov uses MM/dd/yyyy in postedFrom/postedTo per their docs.
  const fmt = (d: Date) => {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}/${dd}/${d.getFullYear()}`;
  };
  // Drop `ncode` for now — runs 101 + 102 returned 0 records with the
  // 8-code construction/engineering filter, which is suspicious for a
  // short window. Pulling base 30-day opportunities to verify auth +
  // date format are sane; we narrow back down (or filter client-side
  // post-fetch) once we've confirmed records actually flow.
  const params = new URLSearchParams({
    api_key: apiKey,
    postedFrom: fmt(cutoff),
    postedTo: fmt(today),
    limit: String(SAMGOV_LIMIT),
  });

  try {
    const res = await fetch(`${SAMGOV_URL}?${params.toString()}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        records: [],
        raw_count: 0,
        latency_ms: Date.now() - start,
        error: `${res.status} ${text.slice(0, 200)}`,
      };
    }
    const json = (await res.json()) as { opportunitiesData?: SamgovOpportunity[] };
    const opps = json.opportunitiesData ?? [];
    const records: IngestorRecord[] = [];
    for (const o of opps) {
      if (!o.noticeId) continue;
      const value = numericOr(o.awardAmount ?? o.baseAndAllOptionsValue ?? null, null);
      const rawPayload = o as unknown as Record<string, unknown>;
      // Z-F finish Option B: prefer city-level Google geocoding when SAM.gov
      // gives us placeOfPerformance.city.name + state.code; fall back to the
      // coarser state-centroid lookup only if the geocoder is unavailable
      // or returns no result. State-centroid was the bottleneck for big
      // states (PA centroid 146mi from Pittsburgh; CA centroid 164mi from
      // LA) during the original Z-F integrator run.
      const placeCity = o.placeOfPerformance?.city?.name?.trim() ?? null;
      const placeState = o.placeOfPerformance?.state?.code?.trim() ?? null;
      let lat: number | null = null;
      let lon: number | null = null;
      if (placeCity && placeState) {
        const geo = await geocodeLocation({
          city: placeCity,
          state: placeState,
          country: 'USA',
        });
        if (geo) {
          lat = geo.lat;
          lon = geo.lon;
        }
      }
      if (lat === null || lon === null) {
        const centroid = extractStateFromPayload(rawPayload);
        lat = centroid?.lat ?? null;
        lon = centroid?.lon ?? null;
      }
      records.push({
        id: `sam.gov:${o.noticeId}`,
        source: 'sam.gov',
        source_id: o.noticeId,
        title: truncate(o.title ?? 'Untitled SAM.gov opportunity', 120),
        summary: truncate(o.description ?? null, 320),
        project_value: value,
        project_stage: classifySamStage(o.type),
        posted_date: normalizeIsoDate(o.postedDate),
        raw_payload: rawPayload,
        lat,
        lon,
        country: null,
        rejection_reason: null,
        rejected_at: null,
      });
    }
    return { records, raw_count: opps.length, latency_ms: Date.now() - start };
  } catch (e) {
    return {
      records: [],
      raw_count: 0,
      latency_ms: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function classifySamStage(type: string | undefined): string {
  if (!type) return 'solicitation';
  const t = type.toLowerCase();
  if (t.includes('award')) return 'awarded';
  if (t.includes('presolicit')) return 'pre-budget';
  if (t.includes('sources sought')) return 'pre-budget';
  return 'solicitation';
}

// ────────────────────────────────────────────────────────────────────────
// Dedup against pathfinder.projects (by source + source_id)
// ────────────────────────────────────────────────────────────────────────

export async function dedupAgainstExisting(
  records: IngestorRecord[],
): Promise<{ new: IngestorRecord[]; deduped: number }> {
  if (records.length === 0) return { new: [], deduped: 0 };
  const ids = records.map((r) => r.id);
  const sb = admin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        in: (col: string, vals: string[]) => Promise<{ data: { id: string }[] | null; error: unknown }>;
      };
    };
  };
  const { data } = await sb.from('projects').select('id').in('id', ids);
  const existing = new Set((data ?? []).map((r) => r.id));
  const fresh = records.filter((r) => !existing.has(r.id));
  return { new: fresh, deduped: records.length - fresh.length };
}

// ────────────────────────────────────────────────────────────────────────
// Insert new projects (batch)
// ────────────────────────────────────────────────────────────────────────

export async function insertNewProjects(records: IngestorRecord[]): Promise<{ inserted: number; error?: string }> {
  if (records.length === 0) return { inserted: 0 };
  const sb = admin() as unknown as {
    from: (t: string) => {
      insert: (rows: Record<string, unknown>[]) => Promise<{ error: { message: string } | null }>;
    };
  };
  try {
    const rows = records.map((r) => ({
      id: r.id,
      source: r.source,
      source_id: r.source_id,
      title: r.title,
      summary: r.summary,
      project_value: r.project_value,
      project_stage: r.project_stage,
      posted_date: r.posted_date,
      raw_payload: r.raw_payload,
      lat: r.lat,
      lon: r.lon,
      // Demo Polish P1 — persist country + rejection columns at insert
      // time. Rejected (foreign-country) rows still go into projects so
      // the rejected pile counts the volume of foreign noise filtered.
      country: r.country,
      rejection_reason: r.rejection_reason,
      rejected_at: r.rejected_at,
      // The Ranker pulls `score is null` rows; we explicitly score
      // out_of_country rejects to 0 so the queue never picks them up.
      score: r.rejection_reason === 'out_of_country' ? 0 : null,
    }));
    const { error } = await sb.from('projects').insert(rows);
    if (error) return { inserted: 0, error: error.message };
    return { inserted: rows.length };
  } catch (e) {
    return { inserted: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Cycle orchestrator
// ────────────────────────────────────────────────────────────────────────

export async function runIngestorCycle(): Promise<IngestorCycleStats> {
  const stats: IngestorCycleStats = {
    source_counts: {
      usaspending: { fetched: 0, inserted: 0, deduped: 0, errors: 0 },
      'sam.gov': { fetched: 0, inserted: 0, deduped: 0, errors: 0 },
    },
    total_fetched: 0,
    total_inserted: 0,
    total_deduped: 0,
    total_errors: 0,
    total_rejected_out_of_country: 0,
  };

  // Demo Polish P1 — load allowed-country whitelist once per cycle.
  const allowedCountries = await loadAllowedCountries();

  // USAspending
  const us = await fetchUsaspendingRecent();
  stats.source_counts.usaspending.fetched = us.raw_count;
  stats.total_fetched += us.raw_count;
  if (us.error) {
    stats.source_counts.usaspending.errors += 1;
    stats.total_errors += 1;
    await writeIngestorLog({
      eventType: 'error',
      data: { message: `source_fetch failed · usaspending · ${us.error}`, source: 'usaspending', reason: us.error },
      latency_ms: us.latency_ms,
    });
  } else {
    await writeIngestorLog({
      eventType: 'source_fetch',
      data: {
        message: `fetched usaspending api · ${us.records.length} federal awards`,
        source: 'usaspending',
        record_count: us.records.length,
      },
      latency_ms: us.latency_ms,
    });
  }

  // SAM.gov
  const sg = await fetchSamGovRecent();
  stats.source_counts['sam.gov'].fetched = sg.raw_count;
  stats.total_fetched += sg.raw_count;
  if (sg.error) {
    stats.source_counts['sam.gov'].errors += 1;
    stats.total_errors += 1;
    await writeIngestorLog({
      eventType: 'error',
      data: { message: `source_fetch failed · sam.gov · ${sg.error}`, source: 'sam.gov', reason: sg.error },
      latency_ms: sg.latency_ms,
    });
  } else {
    await writeIngestorLog({
      eventType: 'source_fetch',
      data: {
        message: `fetched sam.gov api · ${sg.records.length} opportunities`,
        source: 'sam.gov',
        record_count: sg.records.length,
      },
      latency_ms: sg.latency_ms,
    });
  }

  const allRecords = [...us.records, ...sg.records];
  if (allRecords.length === 0) {
    return stats;
  }

  // Demo Polish P1 — Layer A country filter. Apply BEFORE dedup so the
  // country/rejection_reason fields are written for every fresh row,
  // even ones we'd otherwise treat as duplicates against an older record.
  for (const r of allRecords) {
    const result = applyCountryFilter(r, allowedCountries);
    if (result.rejected) {
      stats.total_rejected_out_of_country += 1;
    }
  }

  // Dedup against existing
  const { new: fresh, deduped } = await dedupAgainstExisting(allRecords);

  // Distribute the deduped count back into per-source stats. We dedupe
  // the merged list against the DB, so we tally by source after the fact.
  const freshIds = new Set(fresh.map((r) => r.id));
  for (const r of allRecords) {
    if (!freshIds.has(r.id)) {
      stats.source_counts[r.source].deduped += 1;
    }
  }
  stats.total_deduped = deduped;

  if (fresh.length === 0) {
    await writeIngestorLog({
      eventType: 'write_success',
      data: { message: `write · 0 inserted · ${deduped} deduped`, inserted: 0, deduped },
    });
    return stats;
  }

  // Insert
  const writeResult = await insertNewProjects(fresh);
  if (writeResult.error) {
    await writeIngestorLog({
      eventType: 'error',
      data: {
        message: `projects insert failed · ${writeResult.error}`,
        reason: 'supabase_write_failed',
      },
    });
    stats.total_errors += 1;
  } else {
    for (const r of fresh) {
      stats.source_counts[r.source].inserted += 1;
    }
    stats.total_inserted = writeResult.inserted;
    await writeIngestorLog({
      eventType: 'write_success',
      data: {
        message: `write · ${writeResult.inserted} inserted · ${deduped} deduped`,
        inserted: writeResult.inserted,
        deduped,
      },
    });

    // Phase 2 Stream A Gate A1: emit `pathfinder/raw_event.created` per
    // newly-inserted project. Cron remains canonical for ranking; this
    // event lights up the downstream Inngest subscriber graph
    // (qualifier-rank scaffold, future Enricher / Adjacency / Competitive
    // research-tier agents in A2). Fire-and-forget — failure must not
    // bubble back into the ingest cycle. inngest.send accepts a batch.
    try {
      // Demo Polish P1 — only emit downstream events for rows that passed
      // the country filter. out_of_country rejects skip ranking entirely.
      const passingFresh = fresh.filter((r) => r.rejection_reason !== 'out_of_country');
      if (passingFresh.length > 0) {
        await inngest.send(
          passingFresh.map((r) => ({
            name: 'pathfinder/raw_event.created' as const,
            data: {
              project_id: r.id,
              source: r.source,
              ingested_at: new Date().toISOString(),
            },
          })),
        );
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await writeIngestorLog({
        eventType: 'error',
        data: {
          message: `inngest emit failed (non-fatal) · ${fresh.length} events`,
          reason: 'inngest_emit_failed',
          error: reason,
        },
      });
    }
  }

  return stats;
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function numericOr(v: unknown, fallback: number | null): number | null {
  if (v === null || v === undefined || v === '') return fallback;
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function truncate(s: string | null, n: number): string {
  if (s === null) return '';
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

function normalizeIsoDate(d: string | undefined): string | null {
  if (!d) return null;
  const t = Date.parse(d);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}
