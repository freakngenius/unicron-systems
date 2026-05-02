// Seeds pathfinder.zedcor_branches and pathfinder.zedcor_customer_sites
// from the JSON files in public/seed-data/.
//
// Idempotent — uses upsert via the seeded unique indexes
// (idx_zb_org_branch and idx_zcs_dedupe).
//
// Usage:
//   pnpm tsx scripts/seed-zedcor.ts                # both
//   pnpm tsx scripts/seed-zedcor.ts --branches-only
//   pnpm tsx scripts/seed-zedcor.ts --sites-only
//   pnpm tsx scripts/seed-zedcor.ts --dry-run
//
// Reads SUPABASE_SERVICE_ROLE_KEY from .env.local (or .env.production.local).

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { normalizeCustomerName, resolveParentCompanies } from '../lib/normalization/customer-name';
import { lookupCentroid } from '../lib/zedcor/branch-centroids';

dotenvConfig({ path: '.env.production.local' });
dotenvConfig({ path: '.env.local' });
dotenvConfig();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const flags = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');
const branchesOnly = flags.includes('--branches-only');
const sitesOnly = flags.includes('--sites-only');

const supabase = createClient(url, serviceKey, {
  db: { schema: 'pathfinder' },
  auth: { persistSession: false, autoRefreshToken: false },
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

type RawBranch = {
  source_row_index: number;
  branch_name: string;
  country: string | null;
  state: string | null;
};

type RawSite = {
  source_row_index: number;
  customer_name_raw: string;
  site_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lon: number | null;
};

type BranchInsert = {
  customer_org_id: string;
  branch_name: string;
  country: string;
  state: string;
  city: string | null;
  lat: number | null;
  lon: number | null;
  geocode_source: 'city_centroid' | null;
  notes: string | null;
  source_row_index: number;
};

type SiteInsert = {
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
  source_row_index: number;
};

async function loadJson<T>(rel: string): Promise<T> {
  const buf = await readFile(resolve(root, rel), 'utf-8');
  return JSON.parse(buf) as T;
}

async function seedBranches(): Promise<{ inserted: number; geocoded: number; missing: BranchInsert[] }> {
  const raws = await loadJson<RawBranch[]>('public/seed-data/zedcor-branches.json');
  const rows: BranchInsert[] = [];
  const missing: BranchInsert[] = [];

  for (const r of raws) {
    if (!r.branch_name || !r.country || !r.state) continue;
    const centroid = lookupCentroid(r.branch_name, r.state);
    const row: BranchInsert = {
      customer_org_id: 'zedcor',
      branch_name: r.branch_name,
      country: r.country,
      state: r.state,
      city: centroid?.city ?? null,
      lat: centroid?.lat ?? null,
      lon: centroid?.lon ?? null,
      geocode_source: centroid ? 'city_centroid' : null,
      notes: centroid ? null : 'geocoding_failed_no_centroid',
      source_row_index: r.source_row_index,
    };
    rows.push(row);
    if (!centroid) missing.push(row);
  }

  if (dryRun) {
    return { inserted: rows.length, geocoded: rows.length - missing.length, missing };
  }

  // Upsert in one batch (34 rows fits well under any limit). Use the
  // (customer_org_id, branch_name, state) unique index for idempotency.
  const { error } = await supabase
    .from('zedcor_branches')
    .upsert(rows, { onConflict: 'customer_org_id,branch_name,state' });
  if (error) throw new Error(`zedcor_branches upsert failed: ${error.message}`);

  return { inserted: rows.length, geocoded: rows.length - missing.length, missing };
}

async function seedSites(): Promise<{ inserted: number; rejected: number }> {
  const raws = await loadJson<RawSite[]>('public/seed-data/zedcor-customer-sites.json');

  // First pass: normalize all names so resolveParentCompanies can group.
  const normalizedNames: string[] = [];
  const stagedRows: SiteInsert[] = [];
  let rejected = 0;

  for (const r of raws) {
    const normalized = normalizeCustomerName(r.customer_name_raw);
    if (!normalized) {
      rejected += 1;
      continue;
    }
    normalizedNames.push(normalized);
    stagedRows.push({
      customer_org_id: 'zedcor',
      customer_name_raw: r.customer_name_raw,
      customer_name_normalized: normalized,
      parent_company_canonical: null, // filled below
      site_name: r.site_name,
      address: r.address,
      city: r.city,
      state: r.state,
      lat: r.lat,
      lon: r.lon,
      source_row_index: r.source_row_index,
    });
  }

  // Second pass: resolve parent companies via common-prefix heuristic.
  const parents = resolveParentCompanies(normalizedNames);
  for (const row of stagedRows) {
    row.parent_company_canonical = parents.get(row.customer_name_normalized) ?? null;
  }

  // Third pass: in-batch dedupe so a single upsert chunk can't have two
  // rows colliding on the unique index (Postgres rejects with "ON
  // CONFLICT DO UPDATE command cannot affect row a second time").
  const dedupeMap = new Map<string, SiteInsert>();
  for (const row of stagedRows) {
    const key = `${row.customer_org_id}||${row.customer_name_raw}||${row.address ?? ''}||${row.site_name ?? ''}`;
    if (!dedupeMap.has(key)) dedupeMap.set(key, row);
  }
  const dedupedRows = Array.from(dedupeMap.values());
  const droppedDupes = stagedRows.length - dedupedRows.length;

  if (dryRun) {
    const withParent = dedupedRows.filter((r) => r.parent_company_canonical).length;
    console.log(`[dry-run] sites=${dedupedRows.length} (after dedupe of ${droppedDupes}), withParent=${withParent}, rejected=${rejected}`);
    return { inserted: dedupedRows.length, rejected };
  }
  if (droppedDupes > 0) console.log(`  in-batch deduped: ${droppedDupes} rows`);

  // Batched upsert with retry on transient fetch failures.
  const CHUNK = 250;
  const MAX_RETRIES = 3;
  let inserted = 0;
  for (let i = 0; i < dedupedRows.length; i += CHUNK) {
    const chunk = dedupedRows.slice(i, i + CHUNK);
    let attempt = 0;
    let lastErr: unknown = null;
    let count: number | null = null;
    while (attempt < MAX_RETRIES) {
      try {
        const res = await supabase
          .from('zedcor_customer_sites')
          .upsert(chunk, {
            onConflict: 'customer_org_id,customer_name_raw,address,site_name',
            count: 'exact',
            ignoreDuplicates: false,
          });
        if (res.error) throw new Error(res.error.message);
        count = res.count;
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        attempt += 1;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    if (lastErr) {
      throw new Error(
        `zedcor_customer_sites upsert failed at offset ${i} after ${MAX_RETRIES} attempts: ${String(lastErr)}`,
      );
    }
    inserted += count ?? chunk.length;
    process.stdout.write(`  ${Math.min(i + CHUNK, dedupedRows.length)}/${dedupedRows.length}\r`);
  }
  process.stdout.write('\n');

  return { inserted, rejected };
}

async function main() {
  console.log(`▸ seed-zedcor.ts${dryRun ? ' (dry-run)' : ''}`);

  if (!sitesOnly) {
    console.log('▸ seeding branches');
    const result = await seedBranches();
    console.log(`  inserted=${result.inserted} geocoded=${result.geocoded} missing=${result.missing.length}`);
    if (result.missing.length > 0) {
      console.log('  branches without centroid (will need manual geocode):');
      for (const m of result.missing) console.log(`    - ${m.branch_name}, ${m.state}`);
    }
  }

  if (!branchesOnly) {
    console.log('▸ seeding customer sites');
    const result = await seedSites();
    console.log(`  inserted=${result.inserted} rejected=${result.rejected}`);
  }

  console.log('▸ done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
