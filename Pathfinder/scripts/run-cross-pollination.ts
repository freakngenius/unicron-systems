// scripts/run-cross-pollination.ts — Z-F integrator one-off bridge.
//
// Runs the Z-B cross-pollination engine across every project that already
// has nearest_zedcor_branch_id populated and writes match rows into
// pathfinder.lead_cross_pollination. The new ranker (committed in this
// branch) calls findMatches() inline; this script is the equivalent
// retroactive pass for projects scored before that ranker is deployed —
// i.e., the Tuesday-demo prep batch.
//
// Idempotent: skips projects that already have cross-poll rows so re-runs
// don't double-insert.
//
// Usage:
//   pnpm tsx scripts/run-cross-pollination.ts
//   pnpm tsx scripts/run-cross-pollination.ts --dry-run

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { findMatches } from '../lib/cross-pollination/engine';
import type { Project } from '../lib/types';

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

const supabase = createClient(url, serviceKey, {
  db: { schema: 'pathfinder' },
  auth: { persistSession: false, autoRefreshToken: false },
});

function extractFields(p: Project): {
  project_owner: string | null;
  prime_contractor: string | null;
  key_subs: string[];
  parent_company: string | null;
} {
  const rp = (p.raw_payload ?? {}) as Record<string, unknown>;
  const usPrime =
    typeof rp['Recipient Name'] === 'string' ? (rp['Recipient Name'] as string) : null;
  const usOwner =
    typeof rp['Awarding Agency'] === 'string' ? (rp['Awarding Agency'] as string) : null;
  const sgAgency = typeof rp['agency'] === 'string' ? (rp['agency'] as string) : null;
  let sgAwardee: string | null = null;
  const award = rp['award'];
  if (award && typeof award === 'object') {
    const awardee = (award as { awardee?: unknown }).awardee;
    if (awardee && typeof awardee === 'object') {
      const n = (awardee as { name?: unknown }).name;
      if (typeof n === 'string' && n.trim()) sgAwardee = n;
    }
  }
  return {
    project_owner: usOwner ?? sgAgency ?? null,
    prime_contractor: usPrime ?? sgAwardee ?? null,
    key_subs: [],
    parent_company: null,
  };
}

async function main(): Promise<void> {
  // Build set of project IDs that already have cross-poll rows.
  const seen = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('lead_cross_pollination')
      .select('lead_id')
      .range(offset, offset + 999);
    if (error) {
      console.error('Read existing matches failed:', error.message);
      process.exit(1);
    }
    const rows = (data ?? []) as Array<{ lead_id: string }>;
    for (const r of rows) seen.add(r.lead_id);
    if (rows.length < 1000) break;
    offset += 1000;
  }
  console.log(`Existing cross-poll rows cover ${seen.size} projects`);

  // Pull every project with nearest_zedcor_branch_id (good demo audience).
  const projects: Project[] = [];
  let pOff = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .not('nearest_zedcor_branch_id', 'is', null)
      .range(pOff, pOff + 499);
    if (error) {
      console.error('Read projects failed:', error.message);
      process.exit(1);
    }
    const rows = (data ?? []) as unknown as Project[];
    projects.push(...rows);
    if (rows.length < 500) break;
    pOff += 500;
  }
  console.log(`Loaded ${projects.length} candidate projects`);

  let totalMatches = 0;
  let projectsWithMatches = 0;
  let skipped = 0;
  for (const p of projects) {
    if (seen.has(p.id)) {
      skipped++;
      continue;
    }
    const fields = extractFields(p);
    if (!fields.project_owner && !fields.prime_contractor) continue;
    try {
      const matches = await findMatches({
        leadId: p.id,
        fields,
        supabase: supabase as unknown as Parameters<typeof findMatches>[0]['supabase'],
        writeMatches: !dryRun,
      });
      if (matches.length > 0) {
        totalMatches += matches.length;
        projectsWithMatches++;
        console.log(
          `  ${p.id} :: ${matches.length} match(es) — top=${matches[0].customer_canonical} (${matches[0].match_layer}, conf=${matches[0].match_confidence})`,
        );
      }
    } catch (e) {
      console.warn(`  ${p.id} match failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log('---');
  console.log(`Skipped (already had matches): ${skipped}`);
  console.log(`Projects with new matches: ${projectsWithMatches}`);
  console.log(`Total match rows ${dryRun ? 'would-be-' : ''}written: ${totalMatches}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
