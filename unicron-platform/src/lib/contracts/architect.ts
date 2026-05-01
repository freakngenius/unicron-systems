// Stream C ↔ Stream D contract (Architect Agent).
//
// Stream D ships:
//   - SPEC - Architect Agent.md Sections 3-5 (decomposition / tuning / discovery)
//   - HTTP API endpoints surfaced via D's services/architect/ runtime
//   - architect_inbox table (migration 0070_architect_inbox.sql) backing the
//     proposals list
//
// As of 2026-05-01 Stream D has not published its real contract. This file
// defines the contract Stream C wires against. When D's STREAM-README.md
// publishes the canonical shapes, this file is the single source-of-truth
// to update — every consumer reads the types from here.
//
// **TODO[stream-d-contract]**: When Stream D's STREAM-README publishes its
// API URLs + payload shapes, reconcile this file against them. Expected
// fields below are derived from `SPEC - Architect Agent.md`.

import type { SystemConfig, AgentDef, DataSource } from '../../context/SystemContext';

// ---- Decomposition -------------------------------------------------------
// SPEC - Architect Agent.md Section 3.

export type DecompositionRequest = {
  /** Buyer-pain free-text from the operator (Onboarding step 1). */
  buyerPain: string;
};

export type DecompositionLine = {
  /** Line number in the structured "thinking" output. */
  index: number;
  /** Free-text reveal line; renders type-on in ArchitectThinking. */
  text: string;
  /** Optional category for color/glyph treatment. */
  kind?: 'header' | 'buyer' | 'signal' | 'data' | 'arch' | 'cost' | 'confidence';
};

export type DecompositionResponse = {
  sessionId: string;
  /** Lines to render type-on. Order matters. */
  lines: DecompositionLine[];
  /** Architect's final SystemConfig recommendation. */
  recommendedConfig: SystemConfig;
  /** Architect's confidence in the recommendation (0..1). */
  confidence: number;
  /** Cost in USD of this decomposition session, if cost telemetry is enabled. */
  costUsd?: number;
};

// ---- Inbox proposals -----------------------------------------------------
// SPEC - Architect Agent.md Section 4 (tuning) + Section 5 (discovery).

export type ProposalCategory = 'sources' | 'agents' | 'tuning';

export type ProposalDetail = {
  k: string;
  v: string;
};

export type Proposal = {
  id: string;
  category: ProposalCategory;
  /** Human-readable proposal type label (e.g. "SOURCE DISCOVERY"). */
  type: string;
  /** Relative time string ("8m ago"). Server-side rendered. */
  time: string;
  headline: string;
  body: string;
  details: ProposalDetail[];
  /**
   * Apply payload — a structured patch the client can replay against
   * SystemContext if the operator approves before the server roundtrip.
   * Per spec, the canonical apply happens server-side (Architect mutates
   * its own state and returns the new SystemConfig).
   */
  apply?:
    | { kind: 'add-source'; source: DataSource; watcher?: AgentDef }
    | { kind: 'add-agent'; agent: AgentDef }
    | { kind: 'update-agent'; agentId: string; patch: Partial<AgentDef> };
};

export type ListProposalsResponse = {
  proposals: Proposal[];
};

export type ApproveProposalResponse = {
  ok: true;
  /** The new SystemConfig snapshot after the apply landed. */
  systemConfig: SystemConfig;
};

export type DismissProposalResponse = {
  ok: true;
};

// ---- Errors --------------------------------------------------------------

export type ArchitectError = {
  ok: false;
  code: string;
  message: string;
};
