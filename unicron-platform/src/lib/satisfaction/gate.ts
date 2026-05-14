// src/lib/satisfaction/gate.ts — Sprint 9 Phase 0
// Addendum 4 §3 + §5 satisfaction-threshold gate. Runs N scenarios against
// trajectory evidence, aggregates results, and emits a blockMerge decision.
//
// Per-scenario threshold: scenario.frontmatter.satisfaction_threshold takes
// precedence; fall back to the gate-wide default (0.85). reward_hacking_detected
// disqualifies regardless of satisfaction score. recommend_block_merge from the
// judge also blocks merge.

import type { Scenario } from './scenario.ts';
import type { JudgeVerdict } from './judge.ts';
import { judgeScenario, type JudgeOptions } from './judge.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScenarioRun {
  scenario: Scenario;
  /** The trajectory evidence to judge for this scenario. */
  trajectory: string;
  /** Optional prior trajectories for relative judgment. */
  priorTrajectories?: { label: string; text: string }[];
}

export interface PerScenarioResult {
  scenarioPath: string;
  scenarioTitle: string;
  surface: string;
  priority: string;
  score: number;
  threshold: number;
  passed: boolean;
  rewardHackingDetected: boolean;
  recommendBlockMerge: boolean;
  missedDimensions: string[];
  reasoning: string;
}

export interface GateResult {
  /** Mean satisfaction score across all per-scenario verdicts (unweighted). */
  aggregateScore: number;
  perScenario: PerScenarioResult[];
  blockMerge: boolean;
  blockReasons: string[];
}

export interface RunGateOptions {
  /** Default per-scenario threshold when frontmatter omits one. Default 0.85. */
  defaultThreshold?: number;
  /** Forwarded to the judge for each scenario (model override, mock client, etc.). */
  judgeOptions?: JudgeOptions;
  /**
   * Inject a custom judge function (used by tests to bypass the SDK entirely).
   * Default: the real judgeScenario.
   */
  judge?: (input: {
    scenario: Scenario;
    trajectory: string;
    priorTrajectories?: { label: string; text: string }[];
  }, opts?: JudgeOptions) => Promise<JudgeVerdict>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const DEFAULT_SATISFACTION_THRESHOLD = 0.85;

/**
 * Run the satisfaction gate over a list of (scenario, trajectory) pairs.
 *
 * Per-scenario logic:
 *   threshold = scenario.frontmatter.satisfaction_threshold ?? defaultThreshold
 *   passed    = verdict.satisfaction >= threshold
 *               && !verdict.reward_hacking_detected
 *               && !verdict.recommend_block_merge
 *
 * Gate logic:
 *   blockMerge = ANY (rewardHackingDetected || recommendBlockMerge)
 *                || ANY (!passed)
 *   aggregateScore = mean of per-scenario satisfaction scores
 */
export async function runSatisfactionGate(
  runs: ScenarioRun[],
  options: RunGateOptions = {},
): Promise<GateResult> {
  const defaultThreshold = options.defaultThreshold ?? DEFAULT_SATISFACTION_THRESHOLD;
  const judge = options.judge ?? judgeScenario;

  const perScenario: PerScenarioResult[] = [];
  const blockReasons: string[] = [];

  for (const run of runs) {
    const verdict = await judge(
      {
        scenario: run.scenario,
        trajectory: run.trajectory,
        priorTrajectories: run.priorTrajectories,
      },
      options.judgeOptions,
    );

    const threshold = run.scenario.frontmatter.satisfaction_threshold ?? defaultThreshold;
    const meetsScore = verdict.satisfaction >= threshold;
    const rh = verdict.reward_hacking_detected === true;
    const recBlock = verdict.recommend_block_merge === true;
    const passed = meetsScore && !rh && !recBlock;

    perScenario.push({
      scenarioPath: run.scenario.path,
      scenarioTitle: run.scenario.title,
      surface: run.scenario.frontmatter.surface,
      priority: String(run.scenario.frontmatter.priority),
      score: verdict.satisfaction,
      threshold,
      passed,
      rewardHackingDetected: rh,
      recommendBlockMerge: recBlock,
      missedDimensions: verdict.missed_dimensions,
      reasoning: verdict.reasoning,
    });

    if (rh) {
      blockReasons.push(
        `reward-hacking detected in ${run.scenario.path}: ${verdict.reasoning}`,
      );
    }
    if (recBlock) {
      blockReasons.push(
        `judge recommended block on ${run.scenario.path}: ${verdict.reasoning}`,
      );
    }
    if (!meetsScore) {
      blockReasons.push(
        `${run.scenario.path} below threshold: ${verdict.satisfaction.toFixed(3)} < ${threshold}`,
      );
    }
  }

  const aggregateScore =
    perScenario.length === 0
      ? 0
      : perScenario.reduce((sum, p) => sum + p.score, 0) / perScenario.length;

  return {
    aggregateScore,
    perScenario,
    blockMerge: blockReasons.length > 0,
    blockReasons,
  };
}
