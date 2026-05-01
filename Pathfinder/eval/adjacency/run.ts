// eval/adjacency/run.ts — Stream A Gate A2 eval scaffold.
// Mirrors eval/enricher/run.ts. Live API call per case; CI gates on
// regression vs the previous baseline (A3 records baseline numbers).
//
// Usage:
//   pnpm tsx eval/adjacency/run.ts        # all cases
//   pnpm tsx eval/adjacency/run.ts 2      # first 2 cases (cost-bounded)

/* eslint-disable no-console */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { findAdjacent } from '../../lib/agents/adjacency';

interface ExpectedShape {
  candidates_min?: number;
  candidates_max?: number;
  must_have_field?: string[];
}

interface EvalCase {
  id: string;
  input: {
    project_id: string;
    title: string;
    summary?: string;
    geo_hint?: string;
    customer_names?: string[];
  };
  expected_output_shape: ExpectedShape;
  scoring_rubric: Record<string, string>;
}

interface CaseResult {
  id: string;
  passed: boolean;
  failures: string[];
  candidate_count: number;
  cost_usd: number;
  latency_ms: number;
}

async function loadCases(): Promise<EvalCase[]> {
  const file = path.join(__dirname, 'cases.json');
  return JSON.parse(await readFile(file, 'utf-8')) as EvalCase[];
}

function scoreCase(
  c: EvalCase,
  candidates: { company_name: string; rationale: string; location?: string | null }[],
  excluded: string[],
): { passed: boolean; failures: string[] } {
  const failures: string[] = [];
  const exp = c.expected_output_shape;
  if (exp.candidates_min != null && candidates.length < exp.candidates_min) {
    failures.push(`too_few_candidates: ${candidates.length} < ${exp.candidates_min}`);
  }
  if (exp.candidates_max != null && candidates.length > exp.candidates_max) {
    failures.push(`too_many_candidates: ${candidates.length} > ${exp.candidates_max}`);
  }
  for (const cand of candidates) {
    if (!cand.company_name?.trim()) failures.push('missing_company_name');
    if (!cand.rationale?.trim()) failures.push('missing_rationale');
    for (const x of excluded) {
      if (cand.company_name.toLowerCase().includes(x.toLowerCase())) {
        failures.push(`exclusion_violated: candidate '${cand.company_name}' matches active customer '${x}'`);
      }
    }
  }
  return { passed: failures.length === 0, failures };
}

async function main(): Promise<void> {
  const limit = process.argv[2] ? Number(process.argv[2]) : Infinity;
  const cases = (await loadCases()).slice(0, limit);
  const results: CaseResult[] = [];
  let totalCost = 0;

  for (const c of cases) {
    process.stderr.write(`· ${c.id} ... `);
    try {
      const out = await findAdjacent({ ...c.input, surface: 'manual' });
      const score = scoreCase(c, out.candidates, c.input.customer_names ?? []);
      results.push({
        id: c.id,
        passed: score.passed,
        failures: score.failures,
        candidate_count: out.candidates.length,
        cost_usd: out.cost_usd,
        latency_ms: out.latency_ms,
      });
      totalCost += out.cost_usd;
      process.stderr.write(score.passed ? 'pass\n' : `fail (${score.failures.join(';')})\n`);
    } catch (err) {
      results.push({
        id: c.id,
        passed: false,
        failures: [`exception: ${err instanceof Error ? err.message : String(err)}`],
        candidate_count: 0,
        cost_usd: 0,
        latency_ms: 0,
      });
      process.stderr.write('error\n');
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const summary = {
    agent: 'adjacency-mapper',
    total: results.length,
    passed,
    failed: results.length - passed,
    pass_rate: results.length > 0 ? passed / results.length : 0,
    total_cost_usd: Number(totalCost.toFixed(6)),
    cases: results,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
