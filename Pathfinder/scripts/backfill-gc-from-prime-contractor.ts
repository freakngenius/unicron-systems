// scripts/backfill-gc-from-prime-contractor.ts
//
// Sprint Z14 — free GC-name enrichment path.
//
// Federal sources (sam.gov, USAspending) and state DOT (tx-bid-tabs)
// already extract `prime_contractor_name` on award rows. Z6/Z13's Bonfire
// detail-page enrichment is the only way to populate `gc_metadata.gc_name`
// for those rows today — and it requires SCRAPINGBEE or Playwright bypass
// to clear Cloudflare. Until ScrapingBee budget exists, those rows ship
// with prime_contractor_name set but gc_metadata.gc_name = NULL, which
// means Z7 contact resolution + cross-pollination + Notion rep view all
// skip them.
//
// This backfill bridges that gap: for every project where
// prime_contractor_name is set, gc_metadata.gc_name is empty, and the
// title (or summary) passes the Z12 construction-keyword filter, we copy
// prime_contractor_name → gc_metadata.gc_name and tag the extraction
// layer 'prime_contractor_field'. Downstream Z7 + cross-pollination then
// run against the expanded pool without any paid third-party calls.
//
// Idempotent: re-running skips rows that already have a non-empty
// gc_metadata.gc_name (regardless of layer). Use --force to overwrite
// rows where extraction_layer='prime_contractor_field' (don't overwrite
// HTML/Sonnet-extracted gc_name — that's a stronger signal).
//
// Usage:
//   pnpm tsx scripts/backfill-gc-from-prime-contractor.ts
//   pnpm tsx scripts/backfill-gc-from-prime-contractor.ts --dry-run
//   pnpm tsx scripts/backfill-gc-from-prime-contractor.ts --force
//   pnpm tsx scripts/backfill-gc-from-prime-contractor.ts --limit=500

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { isConstructionRelevant } from '../lib/adapters/zedcor/construction-keywords';
import type { GcMetadata } from '../lib/adapters/zedcor/gc-extractor';

dotenvConfig({ path: '.env.production.local' });
dotenvConfig({ path: '.env.local' });
dotenvConfig();

const ZEDCOR_ORG_ID = '6cd87740-7c72-4337-ac79-316a54242eef';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const flags = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');
const force = flags.includes('--force');
const limitFlag = flags.find((f) => f.startsWith('--limit='));
const limit = limitFlag ? Number(limitFlag.split('=')[1]) : 5_000;
if (!Number.isFinite(limit) || limit <= 0) {
  console.error(`Invalid --limit value: ${limitFlag}`);
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
  db: { schema: 'pathfinder' },
});

interface Row {
  id: string;
  source: string;
  title: string;
  summary: string | null;
  prime_contractor_name: string;
  gc_metadata: GcMetadata | null;
}

async function loadCandidates(): Promise<Row[]> {
  // Pull every Zedcor project with a non-empty prime_contractor_name.
  // Filter for gc_name absence + construction relevance in code (Supabase
  // jsonb null-checks across mixed shapes are awkward to express through
  // PostgREST; in-code filtering on ~2K rows is trivial).
  const { data, error } = await supabase
    .from('projects')
    .select('id, source, title, summary, prime_contractor_name, gc_metadata')
    .eq('organization_id', ZEDCOR_ORG_ID)
    .not('prime_contractor_name', 'is', null)
    .neq('prime_contractor_name', '');
  if (error) {
    console.error('candidate query failed:', error.message);
    process.exit(1);
  }
  return ((data as Row[] | null) ?? []).filter((r) => {
    const existing = r.gc_metadata?.gc_name?.trim();
    if (existing) {
      // Only re-overwrite when --force AND the existing entry came from
      // this same script (don't clobber HTML/Sonnet-derived gc_name).
      if (!force) return false;
      if (r.gc_metadata?.extraction_layer !== 'prime_contractor_field') return false;
    }
    return isConstructionRelevant(r.title, r.summary);
  });
}

function buildMetadata(prime: string, existing: GcMetadata | null): GcMetadata {
  const now = new Date().toISOString();
  // Preserve any contact fields the prior extraction might have populated
  // (Z7 contact resolver runs after this script and writes to the same
  // metadata bundle, so we never want to wipe a populated email/phone).
  return {
    gc_name: prime.trim(),
    gc_award_date: existing?.gc_award_date ?? null,
    gc_contact_name: existing?.gc_contact_name ?? null,
    gc_contact_role: existing?.gc_contact_role ?? null,
    gc_contact_email: existing?.gc_contact_email ?? null,
    gc_contact_phone: existing?.gc_contact_phone ?? null,
    sub_bid_deadline: existing?.sub_bid_deadline ?? null,
    subcontract_package_url: existing?.subcontract_package_url ?? null,
    fetched_at: now,
    fetch_status: 'ok',
    extraction_layer: 'prime_contractor_field',
    source_citation: `prime_contractor_name column on pathfinder.projects row ${prime.trim()}`,
  };
}

async function main(): Promise<void> {
  console.log(`backfill-gc-from-prime-contractor: dryRun=${dryRun} force=${force} limit=${limit}`);
  const candidates = await loadCandidates();
  console.log(`candidates after gc_name-absent + construction filter: ${candidates.length}`);
  const batch = candidates.slice(0, limit);

  if (dryRun) {
    for (const r of batch.slice(0, 20)) {
      console.log(`  would set: [${r.source}] gc_name="${r.prime_contractor_name}"  title="${r.title.slice(0, 80)}"`);
    }
    console.log(`(dry-run, ${batch.length} rows would be updated; first 20 shown)`);
    return;
  }

  let updated = 0;
  let failed = 0;
  const bySource: Record<string, number> = {};

  for (const r of batch) {
    const meta = buildMetadata(r.prime_contractor_name, r.gc_metadata);
    const { error } = await supabase
      .from('projects')
      .update({ gc_metadata: meta as unknown as Record<string, unknown> })
      .eq('id', r.id);
    if (error) {
      failed++;
      console.error(`  update failed for ${r.id}: ${error.message}`);
      continue;
    }
    updated++;
    bySource[r.source] = (bySource[r.source] ?? 0) + 1;
  }

  console.log('---');
  console.log(`updated:  ${updated}`);
  console.log(`failed:   ${failed}`);
  console.log(`by_source: ${JSON.stringify(bySource)}`);
}

main().catch((err) => {
  console.error('backfill-gc-from-prime-contractor failed:', err);
  process.exit(1);
});
