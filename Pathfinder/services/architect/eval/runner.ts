// services/architect/eval/runner.ts — Phase 2 Stream D Gate D1.
// Spec: SPEC - Architect Agent.md §3 (eval set + pass criteria).
//
// Loads decomposition.jsonl, runs each prompt through runDecomposition()
// (real Anthropic call), scores via score.ts, prints a report.
//
// Designed for human-supervised burst execution, not CI default. Costs
// ~$0.20 to $1.00 per case. Cap at $25/stream means ~25 cases/full-run
// is the safety budget — use --slice <n> to run a subset for development.
//
// USAGE:
//   pnpm tsx services/architect/eval/runner.ts                 # full set
//   pnpm tsx services/architect/eval/runner.ts --slice 5       # first 5
//   pnpm tsx services/architect/eval/runner.ts --ids d-001,d-007  # specific ids
//
// Writes report JSON to services/architect/eval/last-run.json for inspection.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runDecomposition } from '@/services/architect/sessions/decomposition';
import { aggregate, scoreCase, type EvalCase } from '@/services/architect/eval/score';
import { SOURCE_CATALOG } from '@/services/architect/tools/source-catalog';

interface CliArgs {
  slice?: number;
  ids?: string[];
  outPath: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    outPath: resolve(__dirname, 'last-run.json'),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--slice') {
      args.slice = Number(argv[++i]);
    } else if (a === '--ids') {
      args.ids = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '--out') {
      args.outPath = argv[++i] ?? args.outPath;
    }
  }
  return args;
}

async function loadCases(path: string): Promise<EvalCase[]> {
  const text = await readFile(path, 'utf8');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.map((l) => JSON.parse(l) as EvalCase);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const path = resolve(__dirname, 'decomposition.jsonl');
  const all = await loadCases(path);
  let cases = all;
  if (args.ids) cases = all.filter((c) => args.ids!.includes(c.id));
  if (args.slice) cases = cases.slice(0, args.slice);

  if (cases.length === 0) {
    console.error('no eval cases selected');
    process.exit(2);
  }

  const knownSourceTypes = new Set(SOURCE_CATALOG.map((s) => s.type));
  console.log(`[eval] running ${cases.length} cases against decomposition session.`);
  console.log(`[eval] cost cap per case: $1.50 (spec §8); aggregate cap: see stream cost log.`);

  const results: ReturnType<typeof scoreCase>[] = [];
  let totalCost = 0;
  for (const c of cases) {
    process.stdout.write(`[eval] ${c.id} ... `);
    const startedAt = Date.now();
    try {
      const response = await runDecomposition({
        input: { buyer_pain_prompt: c.buyer_pain_prompt },
      });
      const score = scoreCase(c, response.architecture, knownSourceTypes);
      results.push(score);
      totalCost += response.cost_usd;
      const tag = score.passed ? 'PASS' : 'FAIL';
      console.log(
        `${tag} (sources=${score.sources_score} agents=${score.agents_score} cost=$${response.cost_usd.toFixed(3)} ${Date.now() - startedAt}ms)`,
      );
      if (!score.passed) {
        for (const r of score.reasons.slice(0, 3)) console.log(`        ${r}`);
      }
    } catch (err) {
      console.log(`ERROR ${err instanceof Error ? err.message : String(err)}`);
      results.push({
        id: c.id,
        passed: false,
        sources_score: 0,
        agents_score: 0,
        hallucination_score: 0,
        confidence_score: 0,
        open_questions_score: 0,
        reasons: [`runtime error: ${err instanceof Error ? err.message : String(err)}`],
      });
    }
  }

  const report = aggregate(results);
  console.log('');
  console.log(
    `[eval] result: ${report.passed}/${report.total} pass (${(report.pass_rate * 100).toFixed(1)}%); avg_sources=${report.avg_sources}; avg_agents=${report.avg_agents}; hallucination_rate=${(report.hallucination_rate * 100).toFixed(1)}%; total_cost=$${totalCost.toFixed(2)}`,
  );

  await writeFile(
    args.outPath,
    JSON.stringify({ ...report, total_cost_usd: Number(totalCost.toFixed(4)), generated_at: new Date().toISOString() }, null, 2),
  );
  console.log(`[eval] report written to ${args.outPath}`);

  // Pass criteria per spec §3:
  //   - 80%+ on right data sources
  //   - 90%+ on right agent set
  // Aggregate exit code reflects this.
  if (report.avg_sources < 0.8 || report.avg_agents < 0.9 || report.hallucination_rate > 0) {
    console.error('[eval] FAILED spec §3 thresholds.');
    process.exit(1);
  }
  console.log('[eval] PASSED spec §3 thresholds.');
}

main().catch((err) => {
  console.error('[eval] runner crashed:', err);
  process.exit(2);
});
