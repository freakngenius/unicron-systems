// lib/agents/funder/adjacency.ts
//
// Funder onboarding Stage 4 — Funder talent-graph adjacency.
//
// The platform AdjacencyMapper in lib/agents/adjacency.ts is shaped for
// "named companies in adjacent verticals or proximate geography" —
// Zedcor's cross-pollination model. Funder cares about a different
// adjacency: founder talent graph.
//
// For each candidate org, find:
//   - prior affiliations of founders (AI lab? top-tier research group?)
//   - whether founders share co-author / collaborator ties with anyone
//     in Funder's portfolio (degrades gracefully with synthetic portfolio)
//
// Same `lib/llm/run` substrate, different prompt + output schema. The
// existing adjacency mapper is untouched.
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 4 (blueprint §6
// "Adjacency-mapper" row).

import { run } from '@/lib/llm/run';
import type { LLMResponse, LLMSurface } from '@/lib/llm/types';

export interface FunderAdjacencyInput {
  project_id: string;
  title: string;
  summary?: string | null;
  founders?: Array<{ name: string; prior_affiliation?: string }>;
  /** Names of orgs already in Funder's grantee portfolio (synthetic or real). */
  portfolio_names?: string[];
  agentRunId?: number | null;
  surface?: LLMSurface;
}

export interface FunderTalentEdge {
  founder_name: string;
  prior_affiliation: string;
  /** Tier 1 = AI lab / top research group, Tier 2 = senior tech operator, Tier 3 = other. */
  tier: 1 | 2 | 3;
}

export interface FunderAdjacencyOutput {
  project_id: string;
  talent_edges: FunderTalentEdge[];
  peer_funder_signal: string | null; // Free-form note when a peer funder is already in.
  portfolio_warm_intros: string[];   // Portfolio org names that link via co-author/collaborator.
  citations: { url: string; title?: string }[];
  model: string;
  cost_usd: number;
  latency_ms: number;
  raw_response: string;
}

export const FUNDER_ADJACENCY_MODEL = 'sonar';
const ADJACENCY_MAX_TOKENS = 1_500;
const RECENCY_DAYS = 90;

// Tier 1 institutions for the founder credential signal. Surfaced
// up-front in the prompt so the model uses a consistent rubric.
const TIER_1_INSTITUTIONS = [
  'OpenAI',
  'Anthropic',
  'DeepMind',
  'Google Research',
  'Meta AI',
  'MIT CSAIL',
  'Stanford AI Lab',
  'Berkeley BAIR',
  'Carnegie Mellon LTI',
  'Princeton CS',
  'Allen Institute',
  'NVIDIA Research',
];

const SYSTEM_PROMPT = `You are the Pathfinder Funder AdjacencyMapper. Given a candidate fundable organization and (optionally) its founders, return STRICT JSON:
{
  "talent_edges": [ { "founder_name": string, "prior_affiliation": string, "tier": 1 | 2 | 3 } ],
  "peer_funder_signal": string | null,
  "portfolio_warm_intros": [ string ]
}

Rules:
- Use Sonar web search. Cite each prior_affiliation claim.
- tier=1 reserves for Tier 1 institutions: ${TIER_1_INSTITUTIONS.join(', ')}.
  tier=2 covers senior operator roles at top-tier tech / research orgs.
  tier=3 is anything else.
- peer_funder_signal: a free-form note when public record shows another well-known philanthropic funder (Open Philanthropy, FTX-era SFF predecessor, Founders Pledge, etc.) is already funding this org.
- portfolio_warm_intros: names from the supplied portfolio list that have a co-author / advisor / collaborator link to one of the candidate's founders.
- Empty arrays / nulls are acceptable when nothing is verifiable. Do not invent ties.
- First char of response must be '{'. No code fence. No prose outside the JSON.`;

function buildUserPrompt(input: FunderAdjacencyInput): string {
  const lines = [`Candidate organization: ${input.title}`];
  if (input.summary) lines.push(`Summary: ${input.summary.slice(0, 500)}`);
  if (input.founders && input.founders.length > 0) {
    lines.push(`Known founders: ${input.founders.map((f) => `${f.name}${f.prior_affiliation ? ` (was at ${f.prior_affiliation})` : ''}`).join('; ')}`);
  }
  if (input.portfolio_names && input.portfolio_names.length > 0) {
    lines.push(`Funder's grantee portfolio (look for co-author / advisor ties): ${input.portfolio_names.join(', ')}`);
  }
  return lines.join('\n');
}

export function parseFunderAdjacency(text: string): Pick<FunderAdjacencyOutput, 'talent_edges' | 'peer_funder_signal' | 'portfolio_warm_intros'> {
  const trimmed = text.trim();
  if (!trimmed || !trimmed.startsWith('{')) {
    return { talent_edges: [], peer_funder_signal: null, portfolio_warm_intros: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { talent_edges: [], peer_funder_signal: null, portfolio_warm_intros: [] };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { talent_edges: [], peer_funder_signal: null, portfolio_warm_intros: [] };
  }
  const p = parsed as Record<string, unknown>;
  const edges = Array.isArray(p.talent_edges)
    ? (p.talent_edges as Array<Record<string, unknown>>).flatMap((e) => {
        const name = e.founder_name;
        const aff = e.prior_affiliation;
        const tier = e.tier;
        if (typeof name !== 'string' || !name.trim()) return [];
        if (typeof aff !== 'string' || !aff.trim()) return [];
        if (tier !== 1 && tier !== 2 && tier !== 3) return [];
        return [{ founder_name: name.trim(), prior_affiliation: aff.trim(), tier: tier as 1 | 2 | 3 }];
      })
    : [];
  const intros = Array.isArray(p.portfolio_warm_intros)
    ? (p.portfolio_warm_intros as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    : [];
  return {
    talent_edges: edges,
    peer_funder_signal: typeof p.peer_funder_signal === 'string' ? p.peer_funder_signal : null,
    portfolio_warm_intros: intros,
  };
}

export async function findFunderAdjacency(input: FunderAdjacencyInput): Promise<FunderAdjacencyOutput> {
  if (!input.project_id) throw new Error('findFunderAdjacency: project_id required');
  if (!input.title) throw new Error('findFunderAdjacency: title required');

  const res: LLMResponse = await run({
    model: FUNDER_ADJACENCY_MODEL,
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(input) }],
    maxTokens: ADJACENCY_MAX_TOKENS,
    surface: input.surface ?? 'cron',
    agentName: 'adjacency-mapper',
    agentRunId: input.agentRunId ?? null,
    recencyDays: RECENCY_DAYS,
    returnCitations: true,
  });

  const parsed = parseFunderAdjacency(res.content);
  return {
    project_id: input.project_id,
    ...parsed,
    citations: res.citations ?? [],
    model: res.model,
    cost_usd: res.usage.costUsd,
    latency_ms: res.usage.latencyMs,
    raw_response: res.content,
  };
}
