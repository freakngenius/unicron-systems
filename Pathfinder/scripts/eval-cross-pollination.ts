// scripts/eval-cross-pollination.ts
// Z-B feature #10 — eval runner.
//
// Loads the 50-case eval set in eval/cross-pollination/cases.json, runs the
// cross-pollination engine against the production Supabase corpus
// (READ-ONLY: passes writeMatches: false so no rows are written to
// pathfinder.lead_cross_pollination), and prints pass-rate / FP-rate per
// SPEC - Cross-Pollination Engine.md § 7. Acceptance:
//   - true-positive pass rate >= 90%
//   - false-positive rate <= 5%
//
// Run with: pnpm tsx scripts/eval-cross-pollination.ts
//
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env
// (sourced from .env.production.local). Connects to whichever Supabase the
// env var points at — production is fine because we do not write.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { findMatches, type CrossPollinationMatch } from '../lib/cross-pollination/engine';
import type { PathfinderDatabase } from '../lib/types';

interface Case {
  id: string;
  note?: string;
  fields: {
    project_owner?: string;
    prime_contractor?: string;
    key_subs?: string[];
    parent_company?: string;
  };
  expected_matches: string[];
}

interface EvalSet {
  true_positives: Case[];
  false_positives: Case[];
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Try:\n  set -a; source .env.production.local; set +a',
    );
    process.exit(1);
  }

  const supabase = createClient<PathfinderDatabase, 'pathfinder'>(url, serviceKey, {
    db: { schema: 'pathfinder' },
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as SupabaseClient<PathfinderDatabase, 'pathfinder'>;

  const casesPath = resolve(process.cwd(), 'eval/cross-pollination/cases.json');
  const evalSet = JSON.parse(readFileSync(casesPath, 'utf8')) as EvalSet;

  console.log('--- Cross-Pollination Engine Eval ---');
  console.log(`True positives: ${evalSet.true_positives.length}`);
  console.log(`False positives: ${evalSet.false_positives.length}`);
  console.log('');

  let tpPass = 0;
  let tpFail = 0;
  const tpMisses: { id: string; expected: string[]; got: string[] }[] = [];

  const tStart = Date.now();
  for (const c of evalSet.true_positives) {
    const matches = await runCase(supabase, c);
    const got = matches.map((m) => m.customer_canonical);
    const allFound = c.expected_matches.every((exp) => got.includes(exp));
    if (allFound) tpPass += 1;
    else {
      tpFail += 1;
      tpMisses.push({ id: c.id, expected: c.expected_matches, got });
    }
  }

  let fpClean = 0;
  let fpHit = 0;
  const fpHits: { id: string; got: CrossPollinationMatch[] }[] = [];

  for (const c of evalSet.false_positives) {
    const matches = await runCase(supabase, c);
    if (matches.length === 0) fpClean += 1;
    else {
      fpHit += 1;
      fpHits.push({ id: c.id, got: matches });
    }
  }

  const tpTotal = evalSet.true_positives.length;
  const fpTotal = evalSet.false_positives.length;
  const passRate = tpPass / tpTotal;
  const fpRate = fpHit / fpTotal;
  const elapsedMs = Date.now() - tStart;

  console.log('=== Results ===');
  console.log(`True-positive pass rate : ${tpPass}/${tpTotal} = ${(passRate * 100).toFixed(1)}%  (target ≥ 90%)`);
  console.log(`False-positive rate     : ${fpHit}/${fpTotal} = ${(fpRate * 100).toFixed(1)}%  (target ≤ 5%)`);
  console.log(`Elapsed                 : ${elapsedMs}ms (${(elapsedMs / (tpTotal + fpTotal)).toFixed(1)}ms/case)`);
  console.log('');

  if (tpMisses.length > 0) {
    console.log('--- True-positive misses ---');
    for (const m of tpMisses) {
      console.log(`  ${m.id}  expected=[${m.expected.join(', ')}]  got=[${m.got.join(', ') || '(none)'}]`);
    }
    console.log('');
  }
  if (fpHits.length > 0) {
    console.log('--- False-positive hits ---');
    for (const h of fpHits) {
      const summary = h.got
        .map((g) => `${g.customer_canonical}@${g.match_layer}/${g.match_confidence}`)
        .join(', ');
      console.log(`  ${h.id}  got=[${summary}]`);
    }
    console.log('');
  }

  const passed = passRate >= 0.9 && fpRate <= 0.05;
  console.log(passed ? '✓ EVAL PASSED' : '✗ EVAL FAILED');
  process.exit(passed ? 0 : 1);
}

async function runCase(
  supabase: SupabaseClient<PathfinderDatabase, 'pathfinder'>,
  c: Case,
): Promise<CrossPollinationMatch[]> {
  return findMatches({
    leadId: `eval-${c.id}`,
    fields: c.fields,
    supabase,
    writeMatches: false,
  });
}

main().catch((err) => {
  console.error('Eval runner failed:', err);
  process.exit(1);
});
