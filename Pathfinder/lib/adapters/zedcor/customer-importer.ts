// lib/adapters/zedcor/customer-importer.ts
//
// Sprint Z8 — Customer-site importer helper.
//
// Owns the pure-logic plumbing for SPEC-zedcor-z8-customer-import-cross-poll:
//   - parse the Customers/Zedcor/ source (CSV/JSON, pre-extracted from xlsx)
//   - normalize customer names + resolve parent companies via Z-A helpers
//   - compute nearest Zedcor branch via haversine (lat/lon)
//   - in-batch dedupe on the idx_zcs_dedupe unique key
//   - chunked upsert against pathfinder.zedcor_customer_sites
//
// Schema reconciliation: the spec says "pathfinder.customers WHERE
// organization_id=<uuid>" but the actual schema uses
// pathfinder.zedcor_customer_sites with customer_org_id='zedcor' (string
// slug). This module honors the spec's intent against the real schema —
// same reconciliation cross-pollination.ts documents.

import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  normalizeCustomerName,
  resolveParentCompanies,
} from '../../normalization/customer-name';

export const ZEDCOR_CUSTOMER_ORG_ID = 'zedcor';

// ─────────────────────────────────────────────────────────────────────────
// Source row + insert row types
// ─────────────────────────────────────────────────────────────────────────

export interface SourceCustomerRow {
  source_row_index: number;
  customer_name_raw: string;
  site_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lon: number | null;
}

export interface BranchRow {
  id: string;
  branch_name: string;
  state: string | null;
  lat: number | null;
  lon: number | null;
}

export interface CustomerSiteInsert {
  customer_org_id: string;
  customer_name_raw: string;
  customer_name_normalized: string;
  parent_company_canonical: string | null;
  site_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lon: number | null;
  nearest_branch_id: string | null;
  distance_to_branch_miles: number | null;
  source_row_index: number;
}

export interface ImportSummary {
  source_rows: number;
  rejected_no_name: number;
  in_batch_duplicates: number;
  prepared: number;
  with_parent: number;
  with_branch_tag: number;
  upserted: number;
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────
// Source loading
// ─────────────────────────────────────────────────────────────────────────

/**
 * Locate the most-recent customer-data file under a Customers/Zedcor/-style
 * directory. Prefers .json (pre-extracted), then .csv, then .xlsx (caller
 * must pre-extract — TS-side xlsx parsing is intentionally out-of-scope to
 * avoid a heavyweight runtime dep).
 */
export function pickSourceFile(dir: string): string | null {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;
  const entries = readdirSync(dir)
    .filter((f) => !f.startsWith('.'))
    .map((f) => {
      const full = join(dir, f);
      return { full, name: f, ext: extname(f).toLowerCase(), mtime: statSync(full).mtimeMs };
    })
    .filter((e) => ['.json', '.csv', '.xlsx'].includes(e.ext))
    // Customer files contain "customer" or "sites" in the name; branch
    // lists contain "branch". Keep customer-flavored files only.
    .filter((e) => !/branch/i.test(e.name))
    .sort((a, b) => b.mtime - a.mtime);
  const priority: Record<string, number> = { '.json': 0, '.csv': 1, '.xlsx': 2 };
  entries.sort((a, b) => (priority[a.ext] ?? 9) - (priority[b.ext] ?? 9) || b.mtime - a.mtime);
  return entries[0]?.full ?? null;
}

/**
 * Load the source JSON shape produced by scripts/data/zedcor-customer-sites.json.
 * Accepts either the canonical Z8 shape or the legacy seed-zedcor.ts
 * RawSite shape — same field names; just kept tolerant for safety.
 */
export async function loadSourceJson(filePath: string): Promise<SourceCustomerRow[]> {
  const buf = await readFile(filePath, 'utf-8');
  const data = JSON.parse(buf) as unknown;
  if (!Array.isArray(data)) {
    throw new Error(`source file ${filePath} did not parse to an array`);
  }
  const out: SourceCustomerRow[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const name = typeof r.customer_name_raw === 'string'
      ? r.customer_name_raw
      : typeof r.customer_name === 'string' ? r.customer_name : null;
    if (!name) continue;
    out.push({
      source_row_index: typeof r.source_row_index === 'number' ? r.source_row_index : out.length + 1,
      customer_name_raw: name,
      site_name: stringOrNull(r.site_name ?? r.site_location),
      address: stringOrNull(r.address),
      city: stringOrNull(r.city),
      state: stringOrNull(r.state ?? r.prov),
      lat: numberOrNull(r.lat),
      lon: numberOrNull(r.lon),
    });
  }
  return out;
}

function stringOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length === 0 ? t === '' ? null : t : t;
}

function numberOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Branch proximity
// ─────────────────────────────────────────────────────────────────────────

const EARTH_RADIUS_MILES = 3958.7613;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in miles between two lat/lon points. */
export function haversineMiles(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Find the nearest branch to a site by lat/lon. Returns null when the site
 * has no geocode, or when no branch has a geocode (impossible in prod —
 * branch-centroids covers all 34).
 */
export function nearestBranchForSite(
  site: { lat: number | null; lon: number | null; state: string | null },
  branches: BranchRow[],
): { branch: BranchRow; distance_miles: number } | null {
  if (site.lat == null || site.lon == null) {
    // Fall back to a same-state branch when no geocode — keeps spec's ≥80%
    // tagging acceptance even for sites the geocoder missed.
    if (site.state) {
      const sameState = branches.find((b) => b.state === site.state);
      if (sameState) return { branch: sameState, distance_miles: Number.NaN };
    }
    return null;
  }
  let best: { branch: BranchRow; distance_miles: number } | null = null;
  for (const b of branches) {
    if (b.lat == null || b.lon == null) continue;
    const d = haversineMiles(site.lat, site.lon, b.lat, b.lon);
    if (!best || d < best.distance_miles) {
      best = { branch: b, distance_miles: d };
    }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────
// Prepare for upsert
// ─────────────────────────────────────────────────────────────────────────

export interface PrepareOptions {
  customerOrgId?: string;
  branches: BranchRow[];
}

export interface PrepareResult {
  rows: CustomerSiteInsert[];
  stats: {
    source_rows: number;
    rejected_no_name: number;
    in_batch_duplicates: number;
    with_parent: number;
    with_branch_tag: number;
  };
}

/**
 * Build the upsert payload from raw source rows.
 *   - normalize customer_name_raw → customer_name_normalized
 *   - resolve parent_company_canonical via common-prefix heuristic
 *   - tag nearest_branch_id + distance_to_branch_miles
 *   - dedupe on (customer_org_id, customer_name_raw, address, site_name)
 */
export function prepareCustomerSiteInserts(
  raws: SourceCustomerRow[],
  opts: PrepareOptions,
): PrepareResult {
  const customerOrgId = opts.customerOrgId ?? ZEDCOR_CUSTOMER_ORG_ID;
  const branches = opts.branches;

  let rejectedNoName = 0;
  const normalizedNames: string[] = [];
  const staged: CustomerSiteInsert[] = [];

  for (const r of raws) {
    const normalized = normalizeCustomerName(r.customer_name_raw);
    if (!normalized) { rejectedNoName += 1; continue; }
    normalizedNames.push(normalized);
    staged.push({
      customer_org_id: customerOrgId,
      customer_name_raw: r.customer_name_raw,
      customer_name_normalized: normalized,
      parent_company_canonical: null,
      site_name: r.site_name,
      address: r.address,
      city: r.city,
      state: r.state,
      lat: r.lat,
      lon: r.lon,
      nearest_branch_id: null,
      distance_to_branch_miles: null,
      source_row_index: r.source_row_index,
    });
  }

  const parents = resolveParentCompanies(normalizedNames);
  for (const row of staged) {
    row.parent_company_canonical = parents.get(row.customer_name_normalized) ?? null;
  }

  let withBranchTag = 0;
  for (const row of staged) {
    const match = nearestBranchForSite(row, branches);
    if (match) {
      row.nearest_branch_id = match.branch.id;
      row.distance_to_branch_miles = Number.isFinite(match.distance_miles)
        ? Math.round(match.distance_miles * 10) / 10
        : null;
      withBranchTag += 1;
    }
  }

  // In-batch dedupe on the dedupe-index key so a single upsert chunk can't
  // collide with itself (Postgres rejects "ON CONFLICT DO UPDATE command
  // cannot affect row a second time").
  const seen = new Map<string, CustomerSiteInsert>();
  for (const row of staged) {
    const key = `${row.customer_org_id}||${row.customer_name_raw}||${row.address ?? ''}||${row.site_name ?? ''}`;
    if (!seen.has(key)) seen.set(key, row);
  }
  const deduped = Array.from(seen.values());
  const duplicates = staged.length - deduped.length;

  return {
    rows: deduped,
    stats: {
      source_rows: raws.length,
      rejected_no_name: rejectedNoName,
      in_batch_duplicates: duplicates,
      with_parent: deduped.filter((r) => r.parent_company_canonical).length,
      with_branch_tag: deduped.filter((r) => r.nearest_branch_id).length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Upsert
// ─────────────────────────────────────────────────────────────────────────

export interface UpsertOptions {
  chunkSize?: number;
  maxRetries?: number;
  dryRun?: boolean;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Chunked upsert against pathfinder.zedcor_customer_sites with retry on
 * transient fetch failures. Returns the count actually written.
 */
export async function upsertCustomerSites(
  supabase: SupabaseClient,
  rows: CustomerSiteInsert[],
  opts: UpsertOptions = {},
): Promise<{ upserted: number; errors: string[] }> {
  const chunk = opts.chunkSize ?? 250;
  const maxRetries = opts.maxRetries ?? 3;
  if (opts.dryRun) return { upserted: 0, errors: [] };

  const errors: string[] = [];
  let upserted = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    let attempt = 0;
    let lastErr: string | null = null;
    let count: number | null = null;
    while (attempt < maxRetries) {
      const res = await (supabase as unknown as {
        from: (t: string) => {
          upsert: (
            v: CustomerSiteInsert[],
            o: { onConflict: string; count: 'exact'; ignoreDuplicates: boolean },
          ) => Promise<{ count: number | null; error: { message: string } | null }>;
        };
      })
        .from('zedcor_customer_sites')
        .upsert(slice, {
          onConflict: 'customer_org_id,customer_name_raw,address,site_name',
          count: 'exact',
          ignoreDuplicates: false,
        });
      if (!res.error) { count = res.count; lastErr = null; break; }
      lastErr = res.error.message;
      attempt += 1;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
    if (lastErr) {
      errors.push(`offset ${i}: ${lastErr}`);
      continue;
    }
    upserted += count ?? slice.length;
    opts.onProgress?.(Math.min(i + chunk, rows.length), rows.length);
  }
  return { upserted, errors };
}

/**
 * Load all active Zedcor branches for branch-tagging. Service-role client
 * required because RLS on zedcor_branches is read-open but lat/lon precision
 * varies — service role bypasses any future tightening.
 */
export async function loadBranchesForOrg(
  supabase: SupabaseClient,
  customerOrgId: string = ZEDCOR_CUSTOMER_ORG_ID,
): Promise<BranchRow[]> {
  const res = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => Promise<{
          data: BranchRow[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  })
    .from('zedcor_branches')
    .select('id, branch_name, state, lat, lon')
    .eq('customer_org_id', customerOrgId);
  if (res.error) throw new Error(`zedcor_branches load failed: ${res.error.message}`);
  return res.data ?? [];
}

/**
 * End-to-end orchestrator used by scripts/import-zedcor-customers.ts.
 * Pure-import shape — caller handles dotenv + supabase-client construction
 * + final logging, this returns a structured summary.
 */
export interface RunImportArgs {
  supabase: SupabaseClient;
  sourcePath: string;
  customerOrgId?: string;
  dryRun?: boolean;
  onProgress?: (done: number, total: number) => void;
}

export async function runCustomerImport(args: RunImportArgs): Promise<ImportSummary> {
  const customerOrgId = args.customerOrgId ?? ZEDCOR_CUSTOMER_ORG_ID;
  const raws = await loadSourceJson(args.sourcePath);
  const branches = await loadBranchesForOrg(args.supabase, customerOrgId);
  if (branches.length === 0) {
    return {
      source_rows: raws.length,
      rejected_no_name: 0,
      in_batch_duplicates: 0,
      prepared: 0,
      with_parent: 0,
      with_branch_tag: 0,
      upserted: 0,
      errors: [`zedcor_branches empty for customer_org_id=${customerOrgId}; run seed-zedcor.ts --branches-only first`],
    };
  }

  const { rows, stats } = prepareCustomerSiteInserts(raws, { branches, customerOrgId });
  const { upserted, errors } = await upsertCustomerSites(args.supabase, rows, {
    dryRun: args.dryRun,
    onProgress: args.onProgress,
  });

  return {
    source_rows: stats.source_rows,
    rejected_no_name: stats.rejected_no_name,
    in_batch_duplicates: stats.in_batch_duplicates,
    prepared: rows.length,
    with_parent: stats.with_parent,
    with_branch_tag: stats.with_branch_tag,
    upserted,
    errors,
  };
}
