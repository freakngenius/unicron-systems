// eval/enricher/run.ts — Stream A Gate A2 eval scaffold.
//
// Runs each case in `cases.json` against the live Enricher and scores
// the output against the per-case rubric. Outputs a JSON report to
// stdout; CI gates on regression vs the previous baseline.
//
// Usage:
//   pnpm tsx eval/enricher/run.ts          # all cases
//   pnpm tsx eval/enricher/run.ts 2        # first 2 cases (cost-bounded slice)
//
// This scaffold is deliberately minimal — A3 gate fills in baseline
// numbers; the harness shape is the contract Stream D / weekly cron will
// later subscribe to.

/* eslint-disable no-console */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { enrichProject, isUsableBrief } from '../../lib/agents/enricher';

interface ExpectedShape {
  brief_min_chars?: number;
  must_contain_any_of?: string[];
  citations_min?: number;
  model?: string;
  alt_paths?: string[];
}

interface EvalCase {
  id: string;
  input: { project_id: string; title: string; summary?: string; source: string };
  expected_output_shape: ExpectedShape;
  scoring_rubric: Record<string, string>;
}

interface CaseResult {
  id: string;
  passed: boolean;
  failures: string[];
  cost_usd: number;
  latency_ms: number;
  brief_chars: number;
}

async function loadCases(): Promise<EvalCase[]> {
  const file = path.join(__dirname, 'cases.json');
  const text = await readFile(file, 'utf-8');
  return JSON.parse(text) as EvalCase[];
}

function scoreCase(c: EvalCase, brief: string, citations: { url: string }[]): {
  passed: boolean;
  failures: string[];
} {
  const failures: string[] = [];
  const exp = c.expected_output_shape;

  if (exp.alt_paths?.includes(brief.trim())) {
    return { passed: true, failures: [] };
  }

  if (exp.brief_min_chars != null && brief.length < exp.brief_min_chars) {
    failures.push(`brief_too_short: ${brief.length} < ${exp.brief_min_chars}`);
  }
  if (exp.must_contain_any_of && exp.must_contain_any_of.length > 0) {
    const hit = exp.must_contain_any_of.some((kw) =>
      brief.toLowerCase().includes(kw.toLowerCase()),
    );
    if (!hit) failures.push(`missing_keywords: any of ${exp.must_contain_any_of.join(',')}`);
  }
  if (exp.citations_min != null && citations.length < exp.citations_min) {
    failures.push(`citations_too_few: ${citations.length} < ${exp.citations_min}`);
  }
  if (!isUsableBrief(brief) && !exp.alt_paths?.includes(brief.trim())) {
    failures.push('brief_not_usable');
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
      const out = await enrichProject({ ...c.input, surface: 'manual' });
      const score = scoreCase(c, out.brief, out.citations);
      results.push({
        id: c.id,
        passed: score.passed,
        failures: score.failures,
        cost_usd: out.cost_usd,
        latency_ms: out.latency_ms,
        brief_chars: out.brief.length,
      });
      totalCost += out.cost_usd;
      process.stderr.write(score.passed ? 'pass\n' : `fail (${score.failures.join(';')})\n`);
    } catch (err) {
      results.push({
        id: c.id,
        passed: false,
        failures: [`exception: ${err instanceof Error ? err.message : String(err)}`],
        cost_usd: 0,
        latency_ms: 0,
        brief_chars: 0,
      });
      process.stderr.write('error\n');
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const summary = {
    agent: 'enricher',
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
