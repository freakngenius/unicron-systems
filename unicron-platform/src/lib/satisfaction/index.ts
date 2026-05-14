// src/lib/satisfaction/index.ts — Sprint 9 Phase 0
// Public exports for the Addendum 4 satisfaction primitives.

export type {
  Scenario,
  ScenarioFrontmatter,
  ScenarioSections,
  ScenarioStatus,
  ScenarioPriority,
} from './scenario.ts';
export { loadScenario, parseScenario, ScenarioParseError } from './scenario.ts';

export type {
  JudgeVerdict,
  JudgeEvidence,
  JudgeInput,
  JudgeOptions,
} from './judge.ts';
export {
  judgeScenario,
  parseVerdict,
  modelForScenario,
  JudgeError,
  JUDGE_MODEL_DEFAULT,
  JUDGE_MODEL_IRREVERSIBLE,
} from './judge.ts';

export type {
  ScenarioRun,
  PerScenarioResult,
  GateResult,
  RunGateOptions,
} from './gate.ts';
export { runSatisfactionGate, DEFAULT_SATISFACTION_THRESHOLD } from './gate.ts';
