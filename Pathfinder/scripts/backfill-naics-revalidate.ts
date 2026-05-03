// scripts/backfill-naics-revalidate.ts — post-demo Gate 2 fix.
//
// Re-validates the NAICS code/description pair on every project that has
// both fields filled and was enriched by Anthropic during Gate 3C. The
// new applyAnthropic logic in services/enricher/lead-detail.ts enforces
// pair-or-neither — this script forces the re-validation pass so the
// existing rows that were grafted (description from Anthropic, code from
// raw_payload) get re-paired correctly.
//
// Usage (from Pathfinder/):
//   pnpm tsx scripts/backfill-naics-revalidate.ts
//
// Idempotent: re-running with no Anthropic credits is a no-op (errors
// surface but nothing gets corrupted).
//
// Cost: ~$0.005 per row × ~43 rows ≈ $0.22.

import 'dotenv/config';

import { supabaseAdmin } from '@/lib/supabase';
import { enrichOneLead } from '@/services/enricher/lead-detail';
import type { EnricherInput, EnricherUpdate } from '@/services/enricher/types';

interface ProjectRowSlim extends EnricherInput {
  score: number | null;
  rejection_reason: string | null;
}

const SELECT_COLS =
  'id, source, title, summary, location_text, lat, lon, ' +
  'owner_name, owner_type, prime_contractor_name, description_long, ' +
  'naics_code, naics_description, estimated_start_date, ' +
  'estimated_end_date, permit_number, permit_jurisdiction, ' +
  'permit_filing_date, permit_type, lot_size_acres, project_value, ' +
  'enriched_at, enrichment_provider, enrichment_cost_usd, ' +
  'score, rejection_reason';

async function loadEnrichedNaicsRows(
  admin: ReturnType<typeof supabaseAdmin>,
): Promise<ProjectRowSlim[]> {
  const res = await (
    admin.from('projects') as unknown as {
      select: (cols: string) => {
        not: (col: string, op: string, val: null) => {
          not: (col: string, op: string, val: null) => {
            in: (col: string, vals: string[]) => {
              is: (col: string, val: null) => Promise<{
                data: ProjectRowSlim[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    }
  )
    .select(SELECT_COLS)
    .not('naics_code', 'is', null)
    .not('naics_description', 'is', null)
    .in('enrichment_provider', ['sonar', 'anthropic', 'sonar+anthropic'])
    .is('rejection_reason', null);

  if (res.error) {
    throw new Error(`load failed: ${res.error.message}`);
  }
  return res.data ?? [];
}

async function persistUpdate(
  admin: ReturnType<typeof supabaseAdmin>,
  projectId: string,
  upd: EnricherUpdate,
): Promise<void> {
  if (Object.keys(upd).length === 0) return;
  const res = await (
    admin.from('projects') as unknown as {
      update: (v: EnricherUpdate) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .update(upd)
    .eq('id', projectId);
  if (res.error) {
    throw new Error(`update ${projectId} failed: ${res.error.message}`);
  }
}

async function main(): Promise<void> {
  const admin = supabaseAdmin();
  const rows = await loadEnrichedNaicsRows(admin);
  console.log(`[naics-revalidate] loaded ${rows.length} enriched rows`);

  let totalCost = 0;
  let changed = 0;
  let unchanged = 0;
  let errors = 0;

  for (const p of rows) {
    process.stdout.write(`[naics-revalidate] ${p.id} … `);
    const before = { code: p.naics_code, desc: p.naics_description };
    const result = await enrichOneLead(p, { forceRevalidateNaics: true });
    totalCost += result.costUsd;

    if (result.errors.length > 0) {
      errors++;
      process.stdout.write(`ERROR (${result.errors[0]?.slice(0, 60)})\n`);
      continue;
    }

    const newCode = result.update.naics_code;
    const newDesc = result.update.naics_description;
    if (newCode == null && newDesc == null) {
      unchanged++;
      process.stdout.write(`unchanged (Anthropic agreed)\n`);
      continue;
    }
    changed++;
    process.stdout.write(
      `CHANGED ${before.code}→${newCode} | "${(before.desc ?? '').slice(0, 30)}" → "${(newDesc ?? '').slice(0, 30)}"\n`,
    );
    await persistUpdate(admin, p.id, result.update);
  }

  console.log('\n[naics-revalidate] DONE');
  console.log(`  rows processed: ${rows.length}`);
  console.log(`  changed:        ${changed}`);
  console.log(`  unchanged:      ${unchanged}`);
  console.log(`  errors:         ${errors}`);
  console.log(`  total cost:     $${totalCost.toFixed(4)}`);
}

main().catch((err: unknown) => {
  console.error('[naics-revalidate] fatal', err);
  process.exit(1);
});
