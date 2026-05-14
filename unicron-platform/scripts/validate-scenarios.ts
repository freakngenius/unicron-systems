#!/usr/bin/env node
// scripts/validate-scenarios.ts — Sprint 9 Phase 0
// CLI runner for the Addendum 4 satisfaction gate.
//
// Usage:
//   node --experimental-strip-types scripts/validate-scenarios.ts \
//     --scenarios-dir vault/wiki/scenarios/orchestrator \
//     --evidence ./trajectory.json \
//     [--threshold 0.85]
//
// The evidence file must be JSON of shape:
//   { "<scenario-path>": "<trajectory string>", ... }
// where <scenario-path> matches a path under --scenarios-dir, OR the special
// key "*" to apply the same trajectory to every loaded scenario.
//
// Outputs the GateResult JSON to stdout. Exits non-zero when blockMerge=true.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadScenario } from '../src/lib/satisfaction/scenario.ts';
import { runSatisfactionGate, type ScenarioRun } from '../src/lib/satisfaction/gate.ts';

interface CliArgs {
  scenariosDir: string;
  evidence: string;
  threshold?: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scenarios-dir') args.scenariosDir = argv[++i];
    else if (a === '--evidence') args.evidence = argv[++i];
    else if (a === '--threshold') args.threshold = Number(argv[++i]);
    else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  if (!args.scenariosDir || !args.evidence) {
    printHelp();
    throw new Error('--scenarios-dir and --evidence are required');
  }
  return args as CliArgs;
}

function printHelp(): void {
  process.stderr.write(
    [
      'validate-scenarios — run the Addendum 4 satisfaction gate',
      '',
      'Required:',
      '  --scenarios-dir <path>  Directory of .md scenario files (recurses)',
      '  --evidence <path|->     JSON file of {scenarioPath: trajectory}, or "-" for stdin',
      '',
      'Optional:',
      '  --threshold <num>       Override the default per-scenario threshold (0.85)',
      '',
      'Exit code is non-zero when the gate blocks merge.',
      '',
    ].join('\n'),
  );
}

async function readEvidence(path: string): Promise<Record<string, string>> {
  const raw = path === '-' ? await readStdin() : await readFile(path, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('evidence JSON must be an object of { scenarioPath: trajectory }');
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== 'string') {
      throw new Error(`evidence["${k}"] must be a string, got ${typeof v}`);
    }
    out[k] = v;
  }
  return out;
}

function readStdin(): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolvePromise(data));
    process.stdin.on('error', reject);
  });
}

async function walkMarkdown(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir);
  for (const name of entries) {
    const full = join(dir, name);
    const s = await stat(full);
    if (s.isDirectory()) {
      out.push(...(await walkMarkdown(full)));
    } else if (s.isFile() && name.endsWith('.md') && !name.startsWith('_')) {
      out.push(full);
    }
  }
  return out.sort();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const scenariosDir = resolve(args.scenariosDir);
  const evidence = await readEvidence(args.evidence);

  const files = await walkMarkdown(scenariosDir);
  if (files.length === 0) {
    throw new Error(`no scenario files found under ${scenariosDir}`);
  }

  const runs: ScenarioRun[] = [];
  for (const file of files) {
    const scenario = await loadScenario(file);
    if (scenario.frontmatter.status !== 'active') continue;
    const trajectory = evidence[file] ?? evidence[scenario.path] ?? evidence['*'];
    if (typeof trajectory !== 'string') {
      process.stderr.write(
        `[validate-scenarios] WARN: no trajectory provided for ${file}; skipping\n`,
      );
      continue;
    }
    runs.push({ scenario, trajectory });
  }

  if (runs.length === 0) {
    throw new Error('no active scenarios with provided trajectories — nothing to evaluate');
  }

  const result = await runSatisfactionGate(runs, {
    defaultThreshold: args.threshold,
  });

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.blockMerge ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`[validate-scenarios] FATAL: ${(err as Error).message}\n`);
  process.exit(2);
});
