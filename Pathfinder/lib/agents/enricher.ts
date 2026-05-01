// lib/agents/enricher.ts — Phase 2 Stream A Gate A2.
//
// Research-tier agent that takes a freshly-qualified project and pulls
// structured enrichment from the open web via Perplexity Sonar. Output
// is a typed envelope intended to land in pathfinder.projects.enrichment_data
// (column TBD by Stream B's data-model expansion) or to be returned
// directly to in-memory callers (Inngest A1 chain consumers).
//
// Per SPEC - Backend Architecture.md §4 (research-tier agents):
//   "An Enricher reads the qualified raw_event, runs a focused Sonar
//    query for buyer org context (multi-location, recent funding, hiring
//    pulse, recent news/PR), and writes a normalized JSON blob downstream
//    consumers can rank, draft, or surface against."
//
// Subscription model: this agent is invoked per `signal.qualified` event
// emitted by the Ranker (A1). Cost ≈ $0.005-0.02 per call (Sonar small,
// 1k-2k output tokens). Idempotent on `project_id`: multiple calls return
// equivalent shape; caller dedupes by writing to enrichment_data with a
// `last_enriched_at` timestamp.
//
// Two-engine rule: this is the first deliberate use of Perplexity Sonar
// in the agent pipeline (chat panel uses Sonar but is operator-driven).
// The Architect / CompetitiveIntel agents will follow this same shape in
// later phases.

import { run } from '@/lib/llm/run';
import type { LLMResponse, LLMSurface } from '@/lib/llm/types';

export interface EnricherInput {
  project_id: string;
  title: string;
  summary?: string | null;
  source: string;
  // Optional caller-supplied scope override. When omitted the prompt
  // uses the default "buyer org context" scope.
  scope?: string;
  // Tracing / attribution.
  agentRunId?: number | null;
  surface?: LLMSurface;
}

export interface EnricherOutput {
  project_id: string;
  // Free-form research-tier brief, multi-paragraph markdown OK. Consumers
  // can render as-is in the Edit Node panel or feed back into a downstream
  // rationale step.
  brief: string;
  // Citations from Sonar's web research. Always present (may be empty).
  citations: { url: string; title?: string }[];
  // Bookkeeping for the recorder. The wrapped run() call already wrote
  // an llm_calls row; this is the in-memory mirror so callers can build
  // observability without a second round-trip to Supabase.
  model: string;
  cost_usd: number;
  latency_ms: number;
}

export const ENRICHER_MODEL = 'sonar';
const ENRICHER_MAX_TOKENS = 1_500;
const ENRICHER_RECENCY_DAYS = 60;

const SYSTEM_PROMPT = `You are the Pathfinder Enricher. Your job is to research the buyer organization behind a qualified project lead and return a tight markdown brief that downstream agents (ranker rationale, outreach drafter) can quote.

Constraints:
- Stay under 8 sentences total.
- Use Sonar's web search to find: buyer org type (multi-branch / single-site), recent funding or M&A within the last 12 months, hiring pulse on relevant roles, and any news that bears on procurement timing.
- If a fact is unsupported by your citations, omit it. Do not speculate.
- Format: 4 short paragraphs (org / funding / hiring / news). Skip a paragraph if you have no citation for it. Each paragraph ≤ 2 sentences.
- Cite by URL inline only when the source is the primary record (filings, press release, official site). Otherwise let the citations array carry the references.

If you cannot find any open-web evidence about the buyer beyond the title/source already given, return the literal string "INSUFFICIENT_PUBLIC_RECORD" and nothing else. Downstream agents handle that case explicitly.`;

function buildUserPrompt(input: EnricherInput): string {
  const scope =
    input.scope ??
    'buyer organization shape (branches, ownership), recent funding or M&A, hiring pulse, and procurement-timing news';
  const lines = [
    `Project: ${input.title}`,
    `Source: ${input.source}`,
  ];
  if (input.summary) lines.push(`Summary: ${input.summary.slice(0, 600)}`);
  lines.push('');
  lines.push(`Research scope: ${scope}.`);
  return lines.join('\n');
}

export async function enrichProject(
  input: EnricherInput,
): Promise<EnricherOutput> {
  if (!input.project_id) throw new Error('enrichProject: project_id required');
  if (!input.title) throw new Error('enrichProject: title required');

  const res: LLMResponse = await run({
    model: ENRICHER_MODEL,
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(input) }],
    maxTokens: ENRICHER_MAX_TOKENS,
    surface: input.surface ?? 'cron',
    agentName: 'enricher',
    agentRunId: input.agentRunId ?? null,
    recencyDays: ENRICHER_RECENCY_DAYS,
    returnCitations: true,
  });

  return {
    project_id: input.project_id,
    brief: res.content.trim(),
    citations: res.citations ?? [],
    model: res.model,
    cost_usd: res.usage.costUsd,
    latency_ms: res.usage.latencyMs,
  };
}

/**
 * Lightweight client-side heuristic: does the brief look like it
 * carries usable enrichment, or is it the documented "give-up" string?
 * Eval cases gate on this for the failure-recovery path.
 */
export function isUsableBrief(brief: string): boolean {
  const trimmed = brief.trim();
  if (!trimmed) return false;
  if (trimmed === 'INSUFFICIENT_PUBLIC_RECORD') return false;
  // Some Sonar responses produce a pre-wrapper "I couldn't find …" message.
  // Treat anything below 80 chars as insufficient signal.
  if (trimmed.length < 80) return false;
  return true;
}
