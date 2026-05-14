// gate.test.ts — satisfaction-threshold gate logic.
// Judge is mocked at the module boundary via the gate's `judge` option.

import { describe, expect, it } from 'vitest';
import { parseScenario } from '../scenario';
import type { JudgeVerdict } from '../judge';
import { runSatisfactionGate, DEFAULT_SATISFACTION_THRESHOLD } from '../gate';

const SCENARIO_DEFAULT = `---
type: scenario
surface: orchestrator
status: active
priority: regression
created: 2026-05-14
ttl_days: permanent
---

# Default-threshold scenario

## Expected behavior
Behaves correctly.
`;

const SCENARIO_TIGHT = `---
type: scenario
surface: voice
status: active
priority: irreversible
created: 2026-05-14
ttl_days: permanent
satisfaction_threshold: 0.95
---

# Tight-threshold scenario

## Expected behavior
Behaves correctly with very high confidence.
`;

function makeVerdict(overrides: Partial<JudgeVerdict> = {}): JudgeVerdict {
  return {
    satisfaction: 0.9,
    reasoning: 'mock reasoning',
    missed_dimensions: [],
    reward_hacking_detected: false,
    evidence: [{ trajectory_span: 'span', scenario_clause: 'clause' }],
    recommend_block_merge: false,
    ...overrides,
  };
}

describe('runSatisfactionGate — default threshold (0.85)', () => {
  it('passes when score >= default threshold and no flags', async () => {
    const scenario = parseScenario(SCENARIO_DEFAULT, '/s/default.md');
    const result = await runSatisfactionGate(
      [{ scenario, trajectory: 'some evidence' }],
      { judge: async () => makeVerdict({ satisfaction: 0.91 }) },
    );

    expect(DEFAULT_SATISFACTION_THRESHOLD).toBe(0.85);
    expect(result.blockMerge).toBe(false);
    expect(result.blockReasons).toEqual([]);
    expect(result.perScenario[0].passed).toBe(true);
    expect(result.perScenario[0].threshold).toBe(0.85);
    expect(result.aggregateScore).toBeCloseTo(0.91, 5);
  });

  it('blocks when score < default threshold', async () => {
    const scenario = parseScenario(SCENARIO_DEFAULT, '/s/default.md');
    const result = await runSatisfactionGate(
      [{ scenario, trajectory: 'evidence' }],
      { judge: async () => makeVerdict({ satisfaction: 0.7 }) },
    );

    expect(result.blockMerge).toBe(true);
    expect(result.perScenario[0].passed).toBe(false);
    expect(result.blockReasons.join(' ')).toMatch(/below threshold/);
  });
});

describe('runSatisfactionGate — frontmatter threshold override', () => {
  it('honors a tighter frontmatter threshold', async () => {
    const scenario = parseScenario(SCENARIO_TIGHT, '/s/tight.md');
    const result = await runSatisfactionGate(
      [{ scenario, trajectory: 'evidence' }],
      { judge: async () => makeVerdict({ satisfaction: 0.9 }) },
    );

    expect(result.perScenario[0].threshold).toBe(0.95);
    expect(result.perScenario[0].passed).toBe(false);
    expect(result.blockMerge).toBe(true);
  });

  it('passes when score meets the tighter frontmatter threshold', async () => {
    const scenario = parseScenario(SCENARIO_TIGHT, '/s/tight.md');
    const result = await runSatisfactionGate(
      [{ scenario, trajectory: 'evidence' }],
      { judge: async () => makeVerdict({ satisfaction: 0.96 }) },
    );

    expect(result.perScenario[0].threshold).toBe(0.95);
    expect(result.perScenario[0].passed).toBe(true);
    expect(result.blockMerge).toBe(false);
  });
});

describe('runSatisfactionGate — reward-hacking disqualifier', () => {
  it('blocks merge even when satisfaction is perfect', async () => {
    const scenario = parseScenario(SCENARIO_DEFAULT, '/s/default.md');
    const result = await runSatisfactionGate(
      [{ scenario, trajectory: 'evidence' }],
      {
        judge: async () =>
          makeVerdict({
            satisfaction: 1.0,
            reward_hacking_detected: true,
            reasoning: 'hardcoded shortcut',
          }),
      },
    );

    expect(result.blockMerge).toBe(true);
    expect(result.perScenario[0].rewardHackingDetected).toBe(true);
    expect(result.perScenario[0].passed).toBe(false);
    expect(result.blockReasons.join(' ')).toMatch(/reward-hacking detected/);
  });
});

describe('runSatisfactionGate — recommend_block_merge disqualifier', () => {
  it('blocks merge when the judge recommends blocking', async () => {
    const scenario = parseScenario(SCENARIO_DEFAULT, '/s/default.md');
    const result = await runSatisfactionGate(
      [{ scenario, trajectory: 'evidence' }],
      {
        judge: async () =>
          makeVerdict({
            satisfaction: 0.95,
            recommend_block_merge: true,
            reasoning: 'safety dimension missed',
          }),
      },
    );

    expect(result.blockMerge).toBe(true);
    expect(result.perScenario[0].recommendBlockMerge).toBe(true);
    expect(result.perScenario[0].passed).toBe(false);
    expect(result.blockReasons.join(' ')).toMatch(/judge recommended block/);
  });
});

describe('runSatisfactionGate — aggregate math across multiple scenarios', () => {
  it('computes the mean of per-scenario satisfaction scores', async () => {
    const a = parseScenario(SCENARIO_DEFAULT, '/s/a.md');
    const b = parseScenario(SCENARIO_DEFAULT, '/s/b.md');
    const c = parseScenario(SCENARIO_DEFAULT, '/s/c.md');

    let i = 0;
    const scores = [0.9, 0.95, 0.88];
    const result = await runSatisfactionGate(
      [
        { scenario: a, trajectory: 'evA' },
        { scenario: b, trajectory: 'evB' },
        { scenario: c, trajectory: 'evC' },
      ],
      { judge: async () => makeVerdict({ satisfaction: scores[i++] }) },
    );

    expect(result.aggregateScore).toBeCloseTo((0.9 + 0.95 + 0.88) / 3, 5);
    expect(result.perScenario).toHaveLength(3);
    expect(result.blockMerge).toBe(false);
  });

  it('blocks if ANY scenario fails, even when aggregate is high', async () => {
    const a = parseScenario(SCENARIO_DEFAULT, '/s/a.md');
    const b = parseScenario(SCENARIO_DEFAULT, '/s/b.md');

    let i = 0;
    const scores = [0.99, 0.5];
    const result = await runSatisfactionGate(
      [
        { scenario: a, trajectory: 'evA' },
        { scenario: b, trajectory: 'evB' },
      ],
      { judge: async () => makeVerdict({ satisfaction: scores[i++] }) },
    );

    expect(result.aggregateScore).toBeCloseTo((0.99 + 0.5) / 2, 5);
    expect(result.blockMerge).toBe(true);
    expect(result.perScenario[0].passed).toBe(true);
    expect(result.perScenario[1].passed).toBe(false);
  });
});

describe('runSatisfactionGate — empty input', () => {
  it('returns aggregateScore=0 and does not block when no scenarios provided', async () => {
    const result = await runSatisfactionGate([], { judge: async () => makeVerdict() });
    expect(result.aggregateScore).toBe(0);
    expect(result.blockMerge).toBe(false);
    expect(result.perScenario).toEqual([]);
  });
});

describe('runSatisfactionGate — custom defaultThreshold override', () => {
  it('uses caller-supplied default when frontmatter omits one', async () => {
    const scenario = parseScenario(SCENARIO_DEFAULT, '/s/default.md');
    const result = await runSatisfactionGate(
      [{ scenario, trajectory: 'ev' }],
      {
        defaultThreshold: 0.7,
        judge: async () => makeVerdict({ satisfaction: 0.75 }),
      },
    );
    expect(result.perScenario[0].threshold).toBe(0.7);
    expect(result.perScenario[0].passed).toBe(true);
  });
});
