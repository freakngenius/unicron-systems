// lib/agents/adjacency.ts — Phase 2 Stream A Gate A2.
//
// Research-tier agent. Given a qualified project + the active customer
// roster, find adjacent companies (same vertical / same geographic
// territory / shape-aligned to the active customer) that look like
// targets for cross-pollination outreach.
//
// Distinct from `prompts/computer-adjacent.md` (the Computer Space agent
// that runs weekly to discover NEW vertical-shaped accounts). This
// in-repo AdjacencyMapper runs per `signal.qualified` event from the
// Ranker (A1) — same trigger as Enricher — and answers a different
// question: given THIS project, which named companies should we look up
// or check for proximity? Output feeds the Outreach drafter's
// warm-intro discovery and (eventually) the AdjacentTargets table.
//
// Per SPEC - Backend Architecture.md §4 (research-tier). Per Stream A
// README A2: "AdjacencyMapper (research-tier)" — paired with Enricher
// for parallel fan-out off signal.qualified.

import { run } from '@/lib/llm/run';
import type { LLMResponse, LLMSurface } from '@/lib/llm/types';

export interface AdjacencyInput {
  project_id: string;
  title: string;
  summary?: string | null;
  // Free-form geo hint — city / state / region pulled from the project's
  // raw_payload by the caller. Loose typing on purpose; AdjacencyMapper
  // is meant to consume whatever the upstream Ingestor surfaces.
  geo_hint?: string | null;
  // Customer names to seed the adjacency check ("are any of these
  // already in the named territory?"). Optional — when omitted the
  // model returns generic shape-aligned candidates.
  customer_names?: string[];
  agentRunId?: number | null;
  surface?: LLMSurface;
}

export interface AdjacentCandidate {
  company_name: string;
  rationale: string;
  // Optional location string the model surfaced. May be empty/null when
  // Sonar can't pin a specific location to the candidate.
  location?: string | null;
}

export interface AdjacencyOutput {
  project_id: string;
  candidates: AdjacentCandidate[];
  citations: { url: string; title?: string }[];
  model: string;
  cost_usd: number;
  latency_ms: number;
  // Echo of the raw model text. Useful for debugging / eval.
  raw_response: string;
}

export const ADJACENCY_MODEL = 'sonar';
const ADJACENCY_MAX_TOKENS = 1_500;
const ADJACENCY_RECENCY_DAYS = 30;
const MAX_CANDIDATES = 5;

const SYSTEM_PROMPT = `You are the Pathfinder AdjacencyMapper. Given one qualified project lead, identify up to ${MAX_CANDIDATES} named companies in adjacent verticals or proximate geography that the operator should check for cross-pollination outreach.

Constraints:
- Use Sonar's web search to confirm each candidate company actually exists with the named profile.
- Only surface companies you can name and cite. No generics ("a multi-branch service company").
- Skip the active customer if any are passed in. The point of adjacency is to expand the addressable set.
- Return STRICT JSON in the exact shape:
  { "candidates": [ { "company_name": string, "rationale": string ≤ 240 chars, "location": string | null } ] }
- No prose outside the JSON. No code-fence. The first character of your response must be \`{\`.
- If you find fewer than ${MAX_CANDIDATES} verifiable candidates, return what you have — empty candidates array is acceptable when nothing surfaces.`;

function buildUserPrompt(input: AdjacencyInput): string {
  const lines = [`Project: ${input.title}`];
  if (input.summary) lines.push(`Summary: ${input.summary.slice(0, 500)}`);
  if (input.geo_hint) lines.push(`Geographic hint: ${input.geo_hint}`);
  if (input.customer_names && input.customer_names.length > 0) {
    lines.push(`Active customers (skip these): ${input.customer_names.join(', ')}`);
  }
  return lines.join('\n');
}

interface ParsedAdjacency {
  candidates: AdjacentCandidate[];
  parse_error: string | null;
}

export function parseAdjacencyResponse(text: string): ParsedAdjacency {
  const trimmed = text.trim();
  if (!trimmed) return { candidates: [], parse_error: 'empty_response' };
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch (err) {
    return {
      candidates: [],
      parse_error: `json_parse: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (typeof json !== 'object' || json === null) {
    return { candidates: [], parse_error: 'not_object' };
  }
  const obj = json as { candidates?: unknown };
  if (!Array.isArray(obj.candidates)) {
    return { candidates: [], parse_error: 'candidates_not_array' };
  }
  const out: AdjacentCandidate[] = [];
  for (const c of obj.candidates) {
    if (typeof c !== 'object' || c === null) continue;
    const row = c as { company_name?: unknown; rationale?: unknown; location?: unknown };
    if (typeof row.company_name !== 'string' || !row.company_name.trim()) continue;
    if (typeof row.rationale !== 'string' || !row.rationale.trim()) continue;
    out.push({
      company_name: row.company_name.trim(),
      rationale: row.rationale.trim().slice(0, 240),
      location:
        typeof row.location === 'string' && row.location.trim()
          ? row.location.trim()
          : null,
    });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return { candidates: out, parse_error: null };
}

export async function findAdjacent(
  input: AdjacencyInput,
): Promise<AdjacencyOutput> {
  if (!input.project_id) throw new Error('findAdjacent: project_id required');
  if (!input.title) throw new Error('findAdjacent: title required');

  const res: LLMResponse = await run({
    model: ADJACENCY_MODEL,
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(input) }],
    maxTokens: ADJACENCY_MAX_TOKENS,
    surface: input.surface ?? 'cron',
    agentName: 'adjacency-mapper',
    agentRunId: input.agentRunId ?? null,
    recencyDays: ADJACENCY_RECENCY_DAYS,
    returnCitations: true,
  });

  const parsed = parseAdjacencyResponse(res.content);

  return {
    project_id: input.project_id,
    candidates: parsed.candidates,
    citations: res.citations ?? [],
    model: res.model,
    cost_usd: res.usage.costUsd,
    latency_ms: res.usage.latencyMs,
    raw_response: res.content,
  };
}
