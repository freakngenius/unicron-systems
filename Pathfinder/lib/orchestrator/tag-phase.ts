// lib/orchestrator/tag-phase.ts
//
// Sprint Z1A — deterministic, date-based phase tagger for the Zedcor
// Houston manual-trigger orchestrator. Replaces a full phase-mapper agent
// (descoped to follow-up Sprint Z2 per Kyle 2026-05-27).
//
// Covers 4 of the 5 Notion Phase enum values:
//   - 'awarded'      → deadline already passed
//   - 'closing-soon' → deadline within 7 days
//   - 'open'         → future deadline > 7 days, OR posted with no deadline
//   - 'unknown'      → neither deadline nor posted date is parseable
//
// 'pre-bid' is NOT detectable from dates alone. Sprint Z2 handles
// pre-bid inference (RFI/RFP classification, pre-bid conference language).
//
// Pure date math. No keyword heuristics, no LLM, no confidence threshold.
// Caller (the orchestrator) writes phase_confidence=1.0 when this function
// returns a deterministic phase, 0.0 when 'unknown'.
//
// Spec: Specs/SPEC-zedcor-tier1-manual.md §"Phase mapper descope (Sprint Z2)".

export type Phase = 'pre-bid' | 'open' | 'closing-soon' | 'awarded' | 'unknown';

export interface TagPhaseInput {
  response_deadline?: string | Date | null;
  posted_date?: string | Date | null;
}

const SEVEN_DAYS_MS = 7 * 86_400_000;

function toMs(v: string | Date | null | undefined): number | null {
  if (v == null) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

export function tagPhase(input: TagPhaseInput, now: number = Date.now()): Phase {
  const deadlineMs = toMs(input.response_deadline);
  const postedMs = toMs(input.posted_date);
  if (deadlineMs !== null && deadlineMs < now) return 'awarded';
  if (deadlineMs !== null && deadlineMs - now <= SEVEN_DAYS_MS) return 'closing-soon';
  if (deadlineMs !== null && deadlineMs - now > SEVEN_DAYS_MS) return 'open';
  if (postedMs !== null && deadlineMs === null) return 'open';
  return 'unknown';
}

/** Convenience for orchestrator: returns the phase + the canonical confidence. */
export function tagPhaseWithConfidence(
  input: TagPhaseInput,
  now: number = Date.now(),
): { phase: Phase; phase_confidence: number } {
  const phase = tagPhase(input, now);
  return { phase, phase_confidence: phase === 'unknown' ? 0 : 1 };
}
