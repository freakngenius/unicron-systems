// services/coverage-expansion/tools/estimate.ts
//
// Pre-flight estimate. Spec §6, §7 — operator types a goal, estimate runs in
// 30-60s, returns expected counts + cost + duration. Single Sonnet call to
// classify each candidate's tier; cheaper than running classifySource against
// every URL (which would be 30+ live HTTP calls).

import type { CoverageCandidate, CoverageEstimate, CoverageScopeConstraints } from '../types';
import { run } from '@/lib/llm/run';

interface EstimateArgs {
  goal: string;
  constraints: CoverageScopeConstraints;
  candidates: CoverageCandidate[];
  sessionId: string;
}

const TIER1_AVG_COST_USD = 0.40;
const TIER2_AVG_COST_USD = 0.55;        // includes investigation
const TIER1_AVG_DURATION_MIN = 5;
const TIER2_AVG_DURATION_MIN = 20;

export async function estimateCoverage(args: EstimateArgs): Promise<CoverageEstimate> {
  // Use the candidate's existing tier annotation (registry-derived candidates
  // already have estimated_tier set). For unknown-tier candidates from Sonar,
  // fall back to a heuristic (URL pattern + content-type hint).
  const annotated = args.candidates.map((c) => ({
    ...c,
    estimated_tier: c.estimated_tier ?? heuristicTier(c.candidate_url),
  }));

  const tier1 = annotated.filter((c) => c.estimated_tier === 1);
  const tier2 = annotated.filter((c) => c.estimated_tier === 2);
  const tier3 = annotated.filter((c) => c.estimated_tier === 3);

  const dailyLift = annotated.reduce(
    (sum, c) => (c.estimated_tier <= 2 ? sum + c.estimated_impact : sum),
    0,
  );
  const totalCost = tier1.length * TIER1_AVG_COST_USD + tier2.length * TIER2_AVG_COST_USD;
  const lowMins = tier1.length * TIER1_AVG_DURATION_MIN / 5 + tier2.length * TIER2_AVG_DURATION_MIN / 5;
  const highMins = tier1.length * TIER1_AVG_DURATION_MIN + tier2.length * TIER2_AVG_DURATION_MIN;

  return {
    discovered_candidates: annotated.length,
    estimated_auto_onboardable: tier1.length,
    estimated_human_assist: tier2.length,
    estimated_declined: tier3.length,
    estimated_daily_lift: Math.round(dailyLift * 10) / 10,
    estimated_total_cost_usd: Math.round(totalCost * 100) / 100,
    estimated_duration_hours: {
      low: Math.round((lowMins / 60) * 10) / 10,
      high: Math.round((highMins / 60) * 10) / 10,
    },
    candidates: annotated,
  };
}

function heuristicTier(url: string): 1 | 2 | 3 {
  if (/\/resource\/[a-z0-9_-]+\.json/i.test(url)) return 1;          // socrata
  if (/\.(json|jsonl|xml|rss|atom)(\?|$)/i.test(url)) return 1;      // static
  if (/\.pdf(\?|$)/i.test(url)) return 2;
  if (/\/login|auth|account|subscriber/i.test(url)) return 2;
  return 1;
}

// Optional: ask Sonnet to spot-check the heuristic tier classification across
// the candidate list (single call). The function is called by the estimator
// when a goal has > 20 candidates and the operator wants a quality lift over
// the heuristic. Costs ~$0.02–$0.05.
export async function llmRetier(args: { candidates: CoverageCandidate[]; sessionId: string }): Promise<CoverageCandidate[]> {
  const slim = args.candidates.map((c) => ({ url: c.candidate_url, type: c.candidate_type }));
  const res = await run({
    model: 'claude-haiku-4-5',
    systemPrompt: `Classify each URL as tier_1 (Socrata/REST/RSS/JSON-dump, fetchable), tier_2 (auth/JS-rendering/PDF), or tier_3 (paid). Return only a JSON array of {"url":"...","tier":1|2|3}. No explanation.`,
    messages: [{ role: 'user', content: JSON.stringify(slim) }],
    maxTokens: 1024,
    surface: 'architect',
    agentName: 'coverage-expansion',
    sessionId: args.sessionId,
  });
  const match = res.content.match(/\[[\s\S]*\]/);
  if (!match) return args.candidates;
  let parsed: unknown;
  try { parsed = JSON.parse(match[0]); } catch { return args.candidates; }
  if (!Array.isArray(parsed)) return args.candidates;
  const tierByUrl = new Map<string, 1 | 2 | 3>();
  for (const r of parsed as { url?: unknown; tier?: unknown }[]) {
    if (typeof r.url === 'string' && (r.tier === 1 || r.tier === 2 || r.tier === 3)) {
      tierByUrl.set(r.url, r.tier);
    }
  }
  return args.candidates.map((c) => {
    const t = tierByUrl.get(c.candidate_url);
    return t ? { ...c, estimated_tier: t } : c;
  });
}
