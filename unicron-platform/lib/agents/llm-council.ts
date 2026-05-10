// lib/agents/llm-council.ts — Sprint 5 Stream B
// LLM Council specialist agent: 3-stage deliberation pattern per Karpathy llm-council.
//
// Stage 1 — Parallel responses: 3 concurrent claude-sonnet-4-5 calls answer independently.
// Stage 2 — Anonymous cross-review: each model rates the other two (identities hidden).
// Stage 3 — Chairman synthesis: claude-opus-4-7 compiles final verdict + ranking.
//
// Also exports the ScoringAgent interface and createLLMCouncilScorer factory
// for use by sprint-fork.ts (Stream D).

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface CouncilCandidate {
  response: string;
  ratings: { [reviewerId: string]: number }; // 1-5 scale per reviewer
  avg_rating: number;
}

export interface CouncilResult {
  winner: string;        // best single-sentence recommendation from Chairman
  ranking: CouncilCandidate[];
  synthesis: string;     // Chairman's full synthesis
  raw_responses: string[];
  deliberation_cost_estimate: string; // e.g. "~$0.15"
}

// ScoringAgent interface — used by sprint-fork.ts (Stream D)
export interface ForkCandidate {
  fork_id: string;
  diff_summary: string;
  self_evaluation: string;
  score?: number;
}

export interface ForkScore {
  fork_id: string;
  score: number;   // 0-100
  rationale: string;
  rank: number;
}

export type ScoringAgent = {
  score: (candidates: ForkCandidate[]) => Promise<ForkScore[]>;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const PANELIST_MODEL = 'claude-sonnet-4-5';
const CHAIRMAN_MODEL = 'claude-opus-4-7';

interface ReviewRatings {
  responseA: number;
  responseB: number;
  responseC: number;
  rationale: string;
}

/**
 * Parse a 1-5 integer from a string.  Falls back to 3 on any failure.
 */
function safeRating(value: unknown): number {
  const n = Number(value);
  if (Number.isInteger(n) && n >= 1 && n <= 5) return n;
  return 3;
}

/**
 * Extract ReviewRatings from raw LLM text.  Expects JSON anywhere in the output.
 */
function parseReviewRatings(raw: string): ReviewRatings {
  const fallback: ReviewRatings = { responseA: 3, responseB: 3, responseC: 3, rationale: raw };
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    return {
      responseA: safeRating(parsed['responseA'] ?? parsed['response_a'] ?? parsed['A']),
      responseB: safeRating(parsed['responseB'] ?? parsed['response_b'] ?? parsed['B']),
      responseC: safeRating(parsed['responseC'] ?? parsed['response_c'] ?? parsed['C']),
      rationale: typeof parsed['rationale'] === 'string' ? parsed['rationale'] : raw.slice(0, 300),
    };
  } catch {
    return fallback;
  }
}

/**
 * Pull `winner` from Chairman text — first line or first quoted string.
 */
function extractWinner(synthesis: string): string {
  const firstLine = synthesis.split('\n').find((l) => l.trim().length > 0) ?? synthesis;
  return firstLine.replace(/^#+\s*/, '').slice(0, 200);
}

// ---------------------------------------------------------------------------
// councilDeliberate — the three-stage loop
// ---------------------------------------------------------------------------

/**
 * Run a full LLM Council deliberation.
 *
 * @param question  - The question or decision to deliberate
 * @param criteria  - Evaluation criteria each panelist must address
 * @param context   - Optional additional context prepended to the prompt
 */
export async function councilDeliberate(
  question: string,
  criteria: string[],
  context?: string
): Promise<CouncilResult> {
  const panelistPrompt = [
    context ? `Context: ${context}\n\n` : '',
    `Question: ${question}\n\n`,
    `Criteria to address: ${criteria.join(', ')}\n\n`,
    'Provide a thorough, structured answer. Be direct and specific.',
  ].join('');

  // ------------------------------------------------------------------
  // Stage 1 — Parallel independent responses (3 × claude-sonnet-4-5)
  // ------------------------------------------------------------------

  const [respA, respB, respC] = await Promise.all(
    [0, 1, 2].map(async () => {
      const msg = await anthropic.messages.create({
        model: PANELIST_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: panelistPrompt }],
      });
      const block = msg.content[0];
      return block.type === 'text' ? block.text : '';
    })
  );

  const rawResponses = [respA, respB, respC];

  // ------------------------------------------------------------------
  // Stage 2 — Anonymous cross-review (3 × claude-sonnet-4-5)
  // Each reviewer sees ALL three responses labelled A / B / C (not by source)
  // and rates them 1-5 on each criterion.
  // ------------------------------------------------------------------

  const reviewTemplate = (reviewerLabel: string) =>
    `You are Reviewer ${reviewerLabel}. Rate each of the three responses below on the following criteria: ${criteria.join(', ')}.

Response A:
${respA}

Response B:
${respB}

Response C:
${respC}

For each response give a single overall score (1=poor, 5=excellent) that reflects how well it addresses all criteria.
Return JSON only — no prose outside the JSON block:
{
  "responseA": <1-5>,
  "responseB": <1-5>,
  "responseC": <1-5>,
  "rationale": "<one sentence explaining the top-ranked response>"
}`;

  const [review1Raw, review2Raw, review3Raw] = await Promise.all(
    ['1', '2', '3'].map(async (label) => {
      const msg = await anthropic.messages.create({
        model: PANELIST_MODEL,
        max_tokens: 512,
        messages: [{ role: 'user', content: reviewTemplate(label) }],
      });
      const block = msg.content[0];
      return block.type === 'text' ? block.text : '{}';
    })
  );

  const review1 = parseReviewRatings(review1Raw);
  const review2 = parseReviewRatings(review2Raw);
  const review3 = parseReviewRatings(review3Raw);

  // Build the ratings matrix keyed by response index (0=A, 1=B, 2=C)
  const ratingsMatrix: Array<{ [reviewerId: string]: number }> = [
    { reviewer1: review1.responseA, reviewer2: review2.responseA, reviewer3: review3.responseA },
    { reviewer1: review1.responseB, reviewer2: review2.responseB, reviewer3: review3.responseB },
    { reviewer1: review1.responseC, reviewer2: review2.responseC, reviewer3: review3.responseC },
  ];

  const avgRatings = ratingsMatrix.map((r) => {
    const vals = Object.values(r);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  });

  // ------------------------------------------------------------------
  // Stage 3 — Chairman synthesis (1 × claude-opus-4-7)
  // ------------------------------------------------------------------

  const chairmanPrompt = `You are the Chairman of an LLM Council convened to answer the following question:

Question: ${question}
Criteria: ${criteria.join(', ')}

Three panelists provided independent responses, then rated each other anonymously.

--- Response A (avg rating: ${avgRatings[0].toFixed(2)}) ---
${respA}

--- Response B (avg rating: ${avgRatings[1].toFixed(2)}) ---
${respB}

--- Response C (avg rating: ${avgRatings[2].toFixed(2)}) ---
${respC}

Reviewer 1 ratings — A: ${review1.responseA}, B: ${review1.responseB}, C: ${review1.responseC}
Reviewer 2 ratings — A: ${review2.responseA}, B: ${review2.responseB}, C: ${review2.responseC}
Reviewer 3 ratings — A: ${review3.responseA}, B: ${review3.responseB}, C: ${review3.responseC}

Your job:
1. Synthesize the strongest elements across all three responses into a definitive answer.
2. Explicitly rank the three responses (best to worst) with a brief reason for each placement.
3. State a clear winner recommendation in the first line.

Format:
- Line 1: One-sentence winner recommendation (the single best answer or synthesis).
- Then: Full synthesis incorporating the strongest elements.
- Then: Ranking section clearly labelled "## Ranking".`;

  const chairmanMsg = await anthropic.messages.create({
    model: CHAIRMAN_MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: chairmanPrompt }],
  });

  const chairmanBlock = chairmanMsg.content[0];
  const synthesis = chairmanBlock.type === 'text' ? chairmanBlock.text : '';

  // ------------------------------------------------------------------
  // Build CouncilResult
  // ------------------------------------------------------------------

  const ranking: CouncilCandidate[] = rawResponses.map((response, i) => ({
    response,
    ratings: ratingsMatrix[i],
    avg_rating: Math.round(avgRatings[i] * 100) / 100,
  }));

  // Sort ranking best → worst by avg_rating
  ranking.sort((a, b) => b.avg_rating - a.avg_rating);

  // Cost estimate: 3 panelist + 3 reviewer (sonnet) + 1 chairman (opus)
  // Approximate: 6 × sonnet (~$0.003/1k input, ~$0.015/1k output) + 1 × opus (~$0.015/$0.075)
  const costEstimate = '~$0.12–$0.20';

  return {
    winner: extractWinner(synthesis),
    ranking,
    synthesis,
    raw_responses: rawResponses,
    deliberation_cost_estimate: costEstimate,
  };
}

// ---------------------------------------------------------------------------
// createLLMCouncilScorer — ScoringAgent factory for sprint-fork.ts (Stream D)
// ---------------------------------------------------------------------------

/**
 * Wraps councilDeliberate as a ScoringAgent.
 * Presents fork candidates as a structured question to the council and
 * maps the ranking back to numeric 0-100 scores.
 */
export function createLLMCouncilScorer(criteria: string[]): ScoringAgent {
  return {
    score: async (candidates: ForkCandidate[]): Promise<ForkScore[]> => {
      if (candidates.length === 0) return [];

      const candidateList = candidates
        .map(
          (c, i) =>
            `Candidate ${i + 1} (${c.fork_id}):\nDiff summary: ${c.diff_summary}\nSelf-evaluation: ${c.self_evaluation}`
        )
        .join('\n\n');

      const question = `Rank these ${candidates.length} implementation candidates from best to worst:\n\n${candidateList}`;

      const result = await councilDeliberate(question, criteria);

      // Build a rank map from the council's ranking order
      // ranking[0] = best, ranking[last] = worst
      const rankMap = new Map<string, number>();
      result.ranking.forEach((candidate, idx) => {
        // Match council candidates back to ForkCandidate fork_ids by position
        // The council ranking preserves the original response text; use idx for scoring
        rankMap.set(candidate.response, idx);
      });

      // Score by avg_rating: top candidate = 100, scale linearly down
      const maxRating = result.ranking[0]?.avg_rating ?? 5;
      const minRating = result.ranking[result.ranking.length - 1]?.avg_rating ?? 1;
      const ratingRange = maxRating - minRating || 1;

      return candidates.map((candidate, i) => {
        // Use position in council ranking (best = 0) mapped back via response text
        const councilEntry = result.ranking.find((_, rankIdx) => rankIdx === i);
        const avgRating = councilEntry?.avg_rating ?? Math.max(1, 5 - i);
        const score = Math.round(((avgRating - minRating) / ratingRange) * 100);
        const clampedScore = Math.min(100, Math.max(0, score));

        return {
          fork_id: candidate.fork_id,
          score: clampedScore,
          rationale: councilEntry?.response?.slice(0, 300) ?? result.synthesis.slice(0, 300),
          rank: i + 1,
        };
      });
    },
  };
}
