// lib/anthropic.ts — Anthropic-side surface for Pathfinder.
//
// As of Phase 1 G1 (Task A3), all production calls flow through the LLM
// gateway at lib/llm/run.ts. This file preserves its public API
// (streamRationaleDeltas, completeRationale, anthropic, setAnthropicForTesting)
// so existing callers in lib/claude.ts, lib/outreach.ts, and
// app/api/rationale/[projectId]/route.ts don't change. Internals delegate.
//
// The legacy `anthropic()` factory and `setAnthropicForTesting()` continue
// to work; the gateway's `setAnthropicClientForTesting()` accepts the same
// AnthropicLike shape, so existing test stubs are forwarded transparently.
//
// Cloud-only. Never import from `lib/scoring.ts` (which must stay pure).

import Anthropic from '@anthropic-ai/sdk';
import { run, runStream, setAnthropicClientForTesting } from './llm/run';

export const RATIONALE_MODEL = process.env.PF_RATIONALE_MODEL ?? 'claude-sonnet-4-6';
const MAX_TOKENS = 800;

const apiKey = process.env.ANTHROPIC_API_KEY;
let _client: Anthropic | null = null;
type AnthropicLike = Pick<Anthropic, 'messages'>;
let _override: AnthropicLike | null = null;

export function setAnthropicForTesting(stub: AnthropicLike | null): void {
  _override = stub;
  setAnthropicClientForTesting(stub);
}

/**
 * Direct Anthropic client accessor. Retained for callers that need
 * non-gateway features (today: none in production). Telemetry from this
 * path bypasses the llm_calls recorder; new callers should use run() /
 * runStream() from lib/llm/run.ts directly.
 */
export function anthropic(): Anthropic {
  if (_override) return _override as Anthropic;
  if (_client) return _client;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  _client = new Anthropic({ apiKey });
  return _client;
}

/**
 * Async iterator yielding rationale text deltas. Streams via the LLM
 * gateway, which writes a row to pathfinder.llm_calls on stream completion.
 */
export async function* streamRationaleDeltas(args: {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
  agentRunId?: number | null;
}): AsyncGenerator<string, void, unknown> {
  const stream = runStream({
    model: args.model ?? RATIONALE_MODEL,
    maxTokens: args.maxTokens ?? MAX_TOKENS,
    systemPrompt: args.systemPrompt,
    messages: [{ role: 'user', content: args.userPrompt }],
    surface: 'cron',
    agentName: 'ranker',
    agentRunId: args.agentRunId ?? null,
  });
  for await (const event of stream) {
    if (event.type === 'delta' && event.text) yield event.text;
  }
}

/**
 * One-shot non-streaming completion via the LLM gateway. Writes a row to
 * pathfinder.llm_calls on completion.
 */
export async function completeRationale(args: {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
  agentRunId?: number | null;
}): Promise<string> {
  const res = await run({
    model: args.model ?? RATIONALE_MODEL,
    maxTokens: args.maxTokens ?? MAX_TOKENS,
    systemPrompt: args.systemPrompt,
    messages: [{ role: 'user', content: args.userPrompt }],
    surface: 'cron',
    agentName: 'ranker',
    agentRunId: args.agentRunId ?? null,
  });
  return res.content.trim();
}
