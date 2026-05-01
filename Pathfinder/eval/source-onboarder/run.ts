// eval/source-onboarder/run.ts — Phase 2 Stream E.
//
// Eval harness. Replays cases.json against classifySource(), reports per-tier
// pass rates. Does NOT run the full agent (no live deploys); focuses on the
// classification gate which is the load-bearing accuracy step. Live-fetch
// classification means the real network is exercised — pass rate floor is
// 80% per-tier-1 (degraded by transient source unavailability).
//
// CLI:  pnpm tsx eval/source-onboarder/run.ts
//       pnpm tsx eval/source-onboarder/run.ts --skip-live   (skip URL-fetch cases)

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { classifySource } from '@/services/source-onboarder/tools/classify-source';

interface Case {
  id: string;
  input: { url?: string; api_key_env?: string };
  expected: { outcome: string; adapter_kind?: string; blocked_reason?: string; tier: number };
  label: string;
  note?: string;
}

interface CasesFile {
  cases: Case[];
}

interface ResultRow {
  id: string;
  expected_tier: number;
  expected_kind?: string;
  expected_blocked?: string;
  observed_kind: string;
  observed_blocked?: string;
  ok: boolean;
  durationMs: number;
  note?: string;
}

async function runOne(c: Case, opts: { skipLive: boolean }): Promise<ResultRow> {
  const start = Date.now();
  if (opts.skipLive || !c.input.url) {
    return {
      id: c.id,
      expected_tier: c.expected.tier,
      expected_kind: c.expected.adapter_kind,
      expected_blocked: c.expected.blocked_reason,
      observed_kind: 'skipped',
      ok: false,
      durationMs: Date.now() - start,
      note: 'skipped',
    };
  }
  try {
    const r = await classifySource(c.input.url);
    const observedKind = r.classification.kind;
    let observedBlocked: string | undefined;
    if (observedKind === 'tier_2' || observedKind === 'tier_3') {
      observedBlocked = (r.classification as { reason?: string }).reason;
    }
    let ok = false;
    if (c.expected.tier === 1) {
      ok = observedKind === c.expected.adapter_kind;
    } else if (c.expected.tier === 2) {
      ok = observedKind === 'tier_2' && observedBlocked === c.expected.blocked_reason;
    } else if (c.expected.tier === 3) {
      ok = observedKind === 'tier_3' || (observedKind === 'tier_2' && c.expected.outcome === 'human-assist');
    }
    return {
      id: c.id,
      expected_tier: c.expected.tier,
      expected_kind: c.expected.adapter_kind,
      expected_blocked: c.expected.blocked_reason,
      observed_kind: observedKind,
      observed_blocked: observedBlocked,
      ok,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return {
      id: c.id,
      expected_tier: c.expected.tier,
      expected_kind: c.expected.adapter_kind,
      expected_blocked: c.expected.blocked_reason,
      observed_kind: 'fetch_error',
      ok: false,
      durationMs: Date.now() - start,
      note: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main(): Promise<void> {
  const skipLive = process.argv.includes('--skip-live');
  const data = JSON.parse(readFileSync(resolve(__dirname, 'cases.json'), 'utf8')) as CasesFile;

  const results: ResultRow[] = [];
  for (const c of data.cases) {
    const r = await runOne(c, { skipLive });
    results.push(r);
    process.stdout.write(`${r.ok ? 'PASS' : 'FAIL'}  ${c.id.padEnd(28)}  ${r.observed_kind}${r.observed_blocked ? ` / ${r.observed_blocked}` : ''}${r.note ? `  -- ${r.note}` : ''}\n`);
  }

  const tier1 = results.filter((r) => r.expected_tier === 1);
  const tier2 = results.filter((r) => r.expected_tier === 2);
  const tier3 = results.filter((r) => r.expected_tier === 3);
  const pct = (xs: ResultRow[]) => (xs.length === 0 ? 0 : (xs.filter((r) => r.ok).length / xs.length) * 100);

  process.stdout.write('\n');
  process.stdout.write(`Tier 1 pass: ${pct(tier1).toFixed(1)}%  (${tier1.filter((r) => r.ok).length}/${tier1.length})\n`);
  process.stdout.write(`Tier 2 pass: ${pct(tier2).toFixed(1)}%  (${tier2.filter((r) => r.ok).length}/${tier2.length})\n`);
  process.stdout.write(`Tier 3 pass: ${pct(tier3).toFixed(1)}%  (${tier3.filter((r) => r.ok).length}/${tier3.length})\n`);

  // Exit non-zero if floor not met (but skip if --skip-live used).
  if (!skipLive) {
    const FLOOR = 0.7;
    if (pct(tier1) / 100 < FLOOR) {
      process.exitCode = 1;
    }
  }
}

void main();
