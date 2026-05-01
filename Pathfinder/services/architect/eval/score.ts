// services/architect/eval/score.ts — Phase 2 Stream D Gate D1.
// Spec: SPEC - Architect Agent.md §3 (eval pass criteria).
//
// Pure scoring helpers. No LLM. The eval runner produces real Architect
// outputs and these functions grade them against the expected_proposal
// shape stored in decomposition.jsonl.
//
// Pass criteria per spec §3:
//   - 80%+ on right data sources
//   - 90%+ on right agent set
//   - No hallucinated source types
//   - Reasonable confidence

import type { DecompositionProposal } from '@/services/architect/types';

export interface ExpectedDecomposition {
  // Each entry is one acceptable answer set; the proposal passes the
  // sources check if its source set is a superset of any acceptable answer.
  acceptable_source_types: string[][];
  required_layer3_roles: string[];
  required_layer4_roles: string[];
  forbidden_source_types: string[];
  min_confidence: 'low' | 'medium' | 'high';
  expect_open_questions?: boolean;
  expect_rejected_count_min?: number;
}

export interface EvalCase {
  id: string;
  buyer_pain_prompt: string;
  expected: ExpectedDecomposition;
}

export interface CaseScore {
  id: string;
  passed: boolean;
  // Component scores (0..1).
  sources_score: number;
  agents_score: number;
  hallucination_score: number; // 1.0 = no hallucinations, 0 = many
  confidence_score: number; // 1.0 = at-or-above min, 0.5 = one tier below, 0 = two tiers below
  open_questions_score: number; // 1 if expectation matched, 0 otherwise
  reasons: string[];
}

const CONFIDENCE_RANK: Record<'low' | 'medium' | 'high', number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export function scoreCase(
  c: EvalCase,
  proposal: DecompositionProposal,
  knownSourceTypes: Set<string>,
): CaseScore {
  const reasons: string[] = [];
  const proposed = new Set(proposal.data_sources_proposed.map((s) => s.type));
  const layer3Roles = new Set(proposal.layer_3_agents.map((a) => a.role.toLowerCase()));
  const layer4Roles = new Set(proposal.layer_4_agents.map((a) => a.role.toLowerCase()));

  // ---- Source set match -------------------------------------------------
  let sourcesScore = 0;
  if (c.expected.acceptable_source_types.length === 0) {
    // Vague prompt — proposal should NOT have hallucinated; full credit if
    // open_questions surfaced and few sources proposed.
    sourcesScore = proposed.size <= 2 ? 1 : 0.5;
  } else {
    for (const acceptable of c.expected.acceptable_source_types) {
      const required = new Set(acceptable);
      const overlap = [...required].filter((s) => proposed.has(s)).length;
      const ratio = overlap / required.size;
      if (ratio > sourcesScore) sourcesScore = ratio;
    }
    if (sourcesScore < 0.5) {
      reasons.push(
        `sources mismatch: proposed ${[...proposed].join(',')}; expected (any of) ${c.expected.acceptable_source_types.map((a) => a.join('+')).join(' OR ')}`,
      );
    }
  }

  // ---- Forbidden sources (hard penalty) ---------------------------------
  let forbiddenHit = 0;
  for (const f of c.expected.forbidden_source_types) {
    if (proposed.has(f)) {
      forbiddenHit += 1;
      reasons.push(`forbidden source proposed: ${f}`);
    }
  }
  if (forbiddenHit > 0) {
    sourcesScore = Math.max(0, sourcesScore - 0.3 * forbiddenHit);
  }

  // ---- Agent set match --------------------------------------------------
  const requiredAgents = [
    ...c.expected.required_layer3_roles.map((r) => ({ layer: 3, role: r })),
    ...c.expected.required_layer4_roles.map((r) => ({ layer: 4, role: r })),
  ];
  let agentHits = 0;
  for (const a of requiredAgents) {
    const haystack = a.layer === 3 ? layer3Roles : layer4Roles;
    if ([...haystack].some((h) => h.includes(a.role.toLowerCase()))) {
      agentHits += 1;
    } else {
      reasons.push(`missing layer-${a.layer} role: ${a.role}`);
    }
  }
  const agentsScore = requiredAgents.length === 0 ? 1 : agentHits / requiredAgents.length;

  // ---- Hallucination: every proposed source must be in catalog or marked custom-* ----
  let hallucinated = 0;
  for (const s of proposed) {
    if (!knownSourceTypes.has(s) && !s.startsWith('custom-')) {
      hallucinated += 1;
      reasons.push(`hallucinated source: ${s}`);
    }
  }
  const hallucinationScore = proposed.size === 0 ? 1 : 1 - hallucinated / proposed.size;

  // ---- Confidence -------------------------------------------------------
  const minRank = CONFIDENCE_RANK[c.expected.min_confidence];
  const actualRank = CONFIDENCE_RANK[proposal.estimates.architecture_confidence];
  const confidenceScore =
    actualRank >= minRank
      ? 1
      : actualRank >= minRank - 1
      ? 0.5
      : 0;
  if (confidenceScore < 1) {
    reasons.push(
      `confidence too low: got=${proposal.estimates.architecture_confidence}, min=${c.expected.min_confidence}`,
    );
  }

  // ---- Open questions expectation ---------------------------------------
  let oqScore = 1;
  if (c.expected.expect_open_questions) {
    if (proposal.open_questions.length === 0) {
      oqScore = 0;
      reasons.push('expected open_questions for ambiguous prompt; got none');
    }
  }
  if (c.expected.expect_rejected_count_min) {
    if (proposal.data_sources_rejected.length < c.expected.expect_rejected_count_min) {
      oqScore = Math.min(oqScore, 0.5);
      reasons.push(
        `expected at least ${c.expected.expect_rejected_count_min} rejected sources; got ${proposal.data_sources_rejected.length}`,
      );
    }
  }

  // ---- Pass logic per spec ---------------------------------------------
  // 80%+ on sources, 90%+ on agents, no hallucinations.
  const passed =
    sourcesScore >= 0.8 &&
    agentsScore >= 0.9 &&
    hallucinationScore >= 1 &&
    confidenceScore >= 0.5 &&
    oqScore >= 0.5;

  return {
    id: c.id,
    passed,
    sources_score: Number(sourcesScore.toFixed(2)),
    agents_score: Number(agentsScore.toFixed(2)),
    hallucination_score: Number(hallucinationScore.toFixed(2)),
    confidence_score: confidenceScore,
    open_questions_score: oqScore,
    reasons,
  };
}

export interface EvalReport {
  total: number;
  passed: number;
  pass_rate: number;
  avg_sources: number;
  avg_agents: number;
  hallucination_rate: number;
  cases: CaseScore[];
}

export function aggregate(cases: CaseScore[]): EvalReport {
  const total = cases.length;
  const passed = cases.filter((c) => c.passed).length;
  const avg = (key: keyof CaseScore) =>
    total === 0
      ? 0
      : cases.reduce((acc, c) => acc + (typeof c[key] === 'number' ? (c[key] as number) : 0), 0) /
        total;
  const hallucinationRate =
    total === 0 ? 0 : cases.filter((c) => c.hallucination_score < 1).length / total;
  return {
    total,
    pass_rate: total === 0 ? 0 : passed / total,
    passed,
    avg_sources: Number(avg('sources_score').toFixed(2)),
    avg_agents: Number(avg('agents_score').toFixed(2)),
    hallucination_rate: Number(hallucinationRate.toFixed(2)),
    cases,
  };
}
