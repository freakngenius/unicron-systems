// scripts/reverify-funder-locally.ts
//
// Operational re-verify — runs `verifyFunderProject` against every
// Funder row and writes back `verified`, `verifier_pass_count`, and
// `verifier_notes`. Mirrors the funder-branch of
// app/api/cron/verifier/route.ts so the same logic decides.
//
// The previous verifier runs sometimes saw stale scores (score=0 at
// verify time because the ranker hadn't filled them in yet). This
// script re-evaluates against the row's current persisted state, which
// includes the post-enrichment `funder_enrichment.founders` block.
//
// Read-only on every column except `verified`, `verifier_pass_count`,
// and `verifier_notes`. Does NOT touch rationale / outreach / scores.
//
// Usage:
//   pnpm tsx scripts/reverify-funder-locally.ts [--limit N] [--dry-run]

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
dotenvConfig({ path: '.env.production.local' });

import { createClient } from '@supabase/supabase-js';
import { verifyFunderProject } from '@/lib/agents/verifier/funderChecks';
import { resolveArchitecture } from '@/lib/config/resolveArchitecture';
import type { OrgArchitecture } from '@/lib/types/architecture';
import type { Project } from '@/lib/types';

const FUNDER_SLUG = 'funder';

interface Args { limit: number; dryRun: boolean }

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let limit = 1000;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit' && argv[i + 1]) { limit = Number(argv[i + 1]); i++; }
    else if (argv[i] === '--dry-run') dryRun = true;
  }
  return { limit, dryRun };
}

async function main() {
  const { limit, dryRun } = parseArgs();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
  const sb = createClient(url, key, { db: { schema: 'pathfinder' }, auth: { persistSession: false } });

  const { data: orgRow, error: orgErr } = await sb
    .from('organizations')
    .select('id, slug, architecture')
    .eq('slug', FUNDER_SLUG)
    .maybeSingle();
  if (orgErr || !orgRow) throw new Error(`Funder org not found: ${orgErr?.message ?? 'missing'}`);
  const org = orgRow as { id: string; slug: string; architecture: unknown };
  const architecture: OrgArchitecture = resolveArchitecture(org.architecture as Record<string, unknown>);

  const { data: rows, error } = await sb
    .from('projects')
    .select('*')
    .eq('organization_id', org.id)
    .order('score', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`select failed: ${error.message}`);
  const projects = (rows ?? []) as Project[];

  console.log(`[reverify] org=${FUNDER_SLUG} rows=${projects.length} threshold_0_100=${(architecture.scoring?.thresholds?.verified ?? 0.6) * 100} dryRun=${dryRun}`);

  let nowVerified = 0;
  let flippedToVerified = 0;
  let flippedToUnverified = 0;
  const failureReasonCounts = new Map<string, number>();
  const newlyVerified: Array<{ id: string; score: number | null; title: string | null; source: string }> = [];

  for (const p of projects) {
    const v = verifyFunderProject({ project: p, architecture });
    const prevVerified = p.verified === true;
    if (v.verified) {
      nowVerified++;
      if (!prevVerified) {
        flippedToVerified++;
        newlyVerified.push({ id: p.id, score: p.score, title: p.title, source: p.source });
      }
    } else {
      if (prevVerified) flippedToUnverified++;
      const primary = v.failures[0] ?? 'unknown';
      const key = primary.split(':')[0];
      failureReasonCounts.set(key, (failureReasonCounts.get(key) ?? 0) + 1);
    }
    if (!dryRun) {
      const { error: updErr } = await sb
        .from('projects')
        .update({
          verified: v.verified,
          verifier_pass_count: (p.verifier_pass_count ?? 0) + 1,
          verifier_notes: v.notes,
        })
        .eq('id', p.id);
      if (updErr) console.error(`  ! ${p.id} persist: ${updErr.message}`);
    }
  }

  console.log(`\n[reverify] DONE`);
  console.log(`  verified_now=${nowVerified}/${projects.length}`);
  console.log(`  newly_verified=${flippedToVerified}`);
  console.log(`  newly_unverified=${flippedToUnverified}`);
  console.log(`  failure_reason_breakdown:`);
  const sortedReasons = [...failureReasonCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [reason, count] of sortedReasons) {
    console.log(`    ${reason}: ${count}`);
  }
  if (newlyVerified.length) {
    console.log(`\n  newly verified rows:`);
    for (const r of newlyVerified) {
      console.log(`    · ${r.id} | score=${r.score ?? '-'} | ${r.source} | ${r.title ?? ''}`);
    }
  }
}

main().catch((err: unknown) => {
  console.error('[reverify-funder-locally] FAILED:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
