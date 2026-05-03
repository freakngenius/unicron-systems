// scripts/run-lead-detail-enrichment.ts — Demo Polish UX Gate 3C.
//
// One-shot. Pulls top-50 pathfinder.projects rows by score (descending,
// `rejection_reason is null`), runs the lead-detail enricher on each,
// persists the resulting updates. Honors a hard cost halt of $10 across the
// whole batch.
//
// Usage (from inside Pathfinder/):
//   pnpm tsx scripts/run-lead-detail-enrichment.ts
//
// Optional env knobs:
//   ENRICHMENT_LIMIT       — override the 50-lead cap (e.g. 5 for a smoke
//                            run before the full batch).
//   ENRICHMENT_COST_HALT   — override the $10 hard halt (decimal USD).
//   ENRICHMENT_DRY_RUN=1   — skip persistence; print results only.

import 'dotenv/config';

import { supabaseAdmin } from '@/lib/supabase';
import { enrichOneLead } from '@/services/enricher/lead-detail';
import type {
  EnricherBatchSummary,
  EnricherInput,
  EnricherUpdate,
} from '@/services/enricher/types';

const DEFAULT_LIMIT = 50;
const DEFAULT_COST_HALT_USD = 10;

interface ProjectRowSlim extends EnricherInput {
  score: number | null;
  rejection_reason: string | null;
}

async function loadTopLeads(
  admin: ReturnType<typeof supabaseAdmin>,
  limit: number,
): Promise<ProjectRowSlim[]> {
  const res = await (
    admin.from('projects') as unknown as {
      select: (cols: string) => {
        is: (col: string, val: null) => {
          order: (col: string, opts: { ascending: boolean; nullsFirst?: boolean }) => {
            limit: (n: number) => Promise<{
              data: ProjectRowSlim[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    }
  )
    .select(
      'id, source, title, summary, location_text, lat, lon, ' +
        'owner_name, owner_type, prime_contractor_name, description_long, ' +
        'naics_code, naics_description, estimated_start_date, ' +
        'estimated_end_date, permit_number, permit_jurisdiction, ' +
        'permit_filing_date, permit_type, lot_size_acres, project_value, ' +
        'enriched_at, enrichment_provider, enrichment_cost_usd, ' +
        'score, rejection_reason',
    )
    .is('rejection_reason', null)
    .order('score', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (res.error) {
    throw new Error(`failed to load top leads: ${res.error.message}`);
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
    throw new Error(`update failed for ${projectId}: ${res.error.message}`);
  }
}

async function main(): Promise<void> {
  const admin = supabaseAdmin();
  const limit = Number(process.env.ENRICHMENT_LIMIT ?? DEFAULT_LIMIT) | 0;
  const costHalt = Number(
    process.env.ENRICHMENT_COST_HALT ?? DEFAULT_COST_HALT_USD,
  );
  const dryRun = process.env.ENRICHMENT_DRY_RUN === '1';

  const topLeads = await loadTopLeads(admin, limit);
  console.log(
    `[lead-detail-enrichment] loaded ${topLeads.length} top leads ` +
      `(cap=${limit}, cost halt=$${costHalt}, dryRun=${dryRun})`,
  );

  const summary: EnricherBatchSummary = {
    totalLeads: topLeads.length,
    totalCostUsd: 0,
    totalSonarCalls: 0,
    totalAnthropicCalls: 0,
    totalFieldsFilled: 0,
    perLeadResults: [],
    haltedReason: null,
  };

  for (const p of topLeads) {
    if (summary.totalCostUsd >= costHalt) {
      summary.haltedReason = `cost halt: $${summary.totalCostUsd.toFixed(4)} >= $${costHalt}`;
      console.log(`[lead-detail-enrichment] HALT — ${summary.haltedReason}`);
      break;
    }
    process.stdout.write(
      `[lead-detail-enrichment] ${p.id} (score=${p.score}) … `,
    );
    const result = await enrichOneLead(p);
    summary.totalCostUsd += result.costUsd;
    summary.totalFieldsFilled += result.sonarFieldsFilled + result.anthropicFieldsFilled;
    if (result.sonarFieldsFilled > 0) summary.totalSonarCalls++;
    if (result.anthropicFieldsFilled > 0) summary.totalAnthropicCalls++;
    summary.perLeadResults.push(result);

    process.stdout.write(
      `+${result.sonarFieldsFilled}s/+${result.anthropicFieldsFilled}a ` +
        `cost=$${result.costUsd.toFixed(4)} ` +
        `errors=${result.errors.length}\n`,
    );
    if (result.errors.length > 0) {
      for (const err of result.errors) {
        console.log(`  ! ${err}`);
      }
    }

    if (!dryRun) {
      await persistUpdate(admin, p.id, result.update);
    }
  }

  console.log('\n[lead-detail-enrichment] DONE');
  console.log(`  total leads processed: ${summary.perLeadResults.length}/${summary.totalLeads}`);
  console.log(`  total cost USD:        $${summary.totalCostUsd.toFixed(4)}`);
  console.log(`  total fields filled:   ${summary.totalFieldsFilled}`);
  console.log(`  Sonar calls (with fills): ${summary.totalSonarCalls}`);
  console.log(`  Anthropic calls (with fills): ${summary.totalAnthropicCalls}`);
  if (summary.haltedReason) {
    console.log(`  HALTED: ${summary.haltedReason}`);
  }
}

main().catch((err: unknown) => {
  console.error('[lead-detail-enrichment] fatal', err);
  process.exit(1);
});
