#!/usr/bin/env node
// scripts/sample-judge-invocation.ts — Sprint 9 Phase 0
//
// Demonstrates the full satisfaction pipeline end-to-end. By default uses a
// mock Anthropic client so the script runs without ANTHROPIC_API_KEY. Set
// SAMPLE_JUDGE_LIVE=1 (with ANTHROPIC_API_KEY) to hit the real API.
//
// Output is the verbatim transcript that goes into the Sprint 9 Phase 0 PR.

import { parseScenario } from '../src/lib/satisfaction/scenario.ts';
import {
  judgeScenario,
  type JudgeOptions,
} from '../src/lib/satisfaction/judge.ts';
import { runSatisfactionGate } from '../src/lib/satisfaction/gate.ts';

const SCENARIO = `---
type: scenario
surface: orchestrator
status: active
priority: regression
created: 2026-05-14
ttl_days: permanent
satisfaction_threshold: 0.85
---

# Greet and status pulse

## Setup
Ledger has three open action items assigned to Kyle, Keenan, and Curtis with
due dates within the current sprint window.

## User action
Operator says "give me a status pulse" in Atrium Now.

## Expected behavior
Orchestrator responds with a one-paragraph rollup that names the three
action items, identifies each DRI, and surfaces the soonest due date.

## Refusal cases
Do NOT enumerate items as a numbered list. Do NOT invent action items that
are not in the ledger. Do NOT promise outcomes the system has not committed
to.

## Evaluation
Judge should verify: each ledger action item is referenced; each DRI is
named; the earliest due date appears; the response is a paragraph, not a
numbered list.

## Notes
Canonical scenario; do not edit without peer review.
`;

const TRAJECTORY = `Orchestrator response to "give me a status pulse":

"Three items are open this sprint. Kyle is driving the Sprint 9 Phase 0
satisfaction primitives, due Friday — earliest deadline of the three.
Keenan is leading the HCFCD procurement_pull follow-up, due next Monday.
Curtis is reviewing the Refero design refs batch, also due next Monday.
Friday is the load-bearing date this week."

Ledger evidence:
- action_items[1]: dri=kyle, title="Sprint 9 Phase 0 satisfaction primitives", due=2026-05-15
- action_items[2]: dri=keenan, title="HCFCD procurement_pull follow-up", due=2026-05-18
- action_items[3]: dri=curtis, title="Refero design refs review", due=2026-05-18
`;

function mockClient(): JudgeOptions['client'] {
  return {
    messages: {
      create: async (_args: unknown) => {
        void _args;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                satisfaction: 0.92,
                reasoning:
                  'Trajectory names all three action items with correct DRIs, identifies Friday as the soonest due date, and uses paragraph form. Slight miss: does not explicitly state "earliest" until the closing sentence, which weakens scannability.',
                missed_dimensions: ['leading_with_soonest_due_date'],
                reward_hacking_detected: false,
                evidence: [
                  {
                    trajectory_span:
                      'Kyle is driving the Sprint 9 Phase 0 satisfaction primitives, due Friday',
                    scenario_clause:
                      'identifies each DRI, and surfaces the soonest due date',
                  },
                  {
                    trajectory_span: 'Three items are open this sprint.',
                    scenario_clause:
                      'one-paragraph rollup that names the three action items',
                  },
                ],
                recommend_block_merge: false,
              }),
            },
          ],
        } as unknown;
      },
    },
  } as unknown as JudgeOptions['client'];
}

async function main(): Promise<void> {
  const live = process.env.SAMPLE_JUDGE_LIVE === '1';
  const client = live ? undefined : mockClient();

  process.stdout.write('=== Sample judge invocation ===\n');
  process.stdout.write(`mode: ${live ? 'LIVE (Anthropic API)' : 'MOCK (no API key required)'}\n\n`);

  const scenario = parseScenario(SCENARIO, 'inline://sample/orchestrator/greet-and-status-pulse.md');

  process.stdout.write('--- Scenario (parsed) ---\n');
  process.stdout.write(JSON.stringify({
    path: scenario.path,
    title: scenario.title,
    frontmatter: scenario.frontmatter,
    sectionsPresent: Object.keys(scenario.sections),
  }, null, 2));
  process.stdout.write('\n\n--- Trajectory under judgment ---\n');
  process.stdout.write(TRAJECTORY + '\n');

  process.stdout.write('--- Judge verdict ---\n');
  const verdict = await judgeScenario(
    { scenario, trajectory: TRAJECTORY },
    { client },
  );
  process.stdout.write(JSON.stringify(verdict, null, 2) + '\n\n');

  process.stdout.write('--- Gate result over [scenario] ---\n');
  const gate = await runSatisfactionGate(
    [{ scenario, trajectory: TRAJECTORY }],
    { judge: async () => verdict },
  );
  process.stdout.write(JSON.stringify(gate, null, 2) + '\n');
  process.exit(gate.blockMerge ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`FATAL: ${(err as Error).message}\n`);
  process.exit(2);
});
