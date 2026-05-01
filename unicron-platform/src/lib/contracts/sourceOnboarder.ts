// Stream C ↔ Stream E contract (Source Onboarder Agent).
//
// Stream E ships:
//   - SPEC - Source Onboarder Agent.md Sections 4-7 (Tier 1: Socrata, REST,
//     RSS, JSON-dump)
//   - HTTP API surfaced via E's services/source-onboarder/ runtime
//   - The 90-second live-demo path (URL → analyze → deploy → first event)
//
// As of 2026-05-01 Stream E has not published its real contract. This file
// defines the contract Stream C wires against. When E's STREAM-README.md
// publishes the canonical shapes, this file is the single source-of-truth
// to update.
//
// **TODO[stream-e-contract]**: When Stream E's STREAM-README publishes its
// API URLs + payload shapes, reconcile this file against them.

import type { DataSource, AgentDef } from '../../context/SystemContext';

// ---- Analysis (introspect candidate URL) --------------------------------

export type SourceTabKind = 'url' | 'api' | 'feed' | 'file' | 'describe';

export type AnalyzeRequest = {
  /** Which onboarding tab the operator used. Drives the input shape. */
  tab: SourceTabKind;
  /** The free-text URL / endpoint / description, depending on `tab`. */
  input: string;
  /** Optional metadata captured in the panel form (api key, sample fields, etc.). */
  meta?: Record<string, string>;
};

export type AnalysisFieldGuess = {
  field: string;
  /** What the Architect believes this field represents. */
  guess: string;
  /** Confidence 0..1. */
  confidence: number;
};

export type AnalysisResponse = {
  analysisId: string;
  jurisdiction: string;
  sourceType: 'permits' | 'sam_gov' | 'news' | 'entity_formation' | 'land_txn' | 'rfp';
  detectedAdapter: 'socrata' | 'rest-json' | 'rss' | 'json-dump' | 'unknown';
  estimatedDailyVolume: number;
  estimatedQualifiedPerDay: number;
  fields: AnalysisFieldGuess[];
  /** The DataSource the deploy step will materialize. */
  proposedSource: DataSource;
  /** The watcher AgentDef the deploy step will materialize. */
  proposedWatcher: AgentDef;
  confidence: number;
  costUsd?: number;
};

// ---- Deploy --------------------------------------------------------------

export type DeployRequest = {
  /** From `AnalysisResponse.analysisId`. */
  analysisId: string;
  /** Operator may override fields from the analysis before deploy. */
  overrides?: Partial<DataSource>;
};

export type DeployResponse = {
  ok: true;
  source: DataSource;
  watcher: AgentDef;
  /**
   * Live-demo metric: ms between deploy time and the first event flowing
   * downstream. Spec target is < 90 000 ms.
   */
  firstEventMs?: number;
};

// ---- Errors --------------------------------------------------------------

export type SourceOnboarderError = {
  ok: false;
  code: string;
  message: string;
};
