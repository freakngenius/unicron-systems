// lib/anthropic.ts — Anthropic-side surface for Pathfinder.
//
// As of Phase 1 G1 (Task A3), all production calls flow through the LLM
// gateway at lib/llm/run.ts. This file preserves its public API
// (streamRationaleDeltas, completeRationale, anthropic, setAnthropicForTesting)
// so existing callers in lib/claude.ts, lib/outreach.ts, and
// app/api/rationale/[projectId]/route.ts don't change. Internals delegate.
//
// **Phase 1 G2 follow-up (2026-05-01):** the legacy `anthropic()` factory is
// also instrumented now. Callers that import it directly (currently the
// Ranker + Verifier cron route handlers, which call
// `client.messages.create(...)` inline rather than through completeRationale)
// previously bypassed the gateway and didn't write llm_calls rows. The
// returned client now wraps `messages.create` + `messages.stream` to fire
// the same recorder used by run() / runStream(). Surface is recorded as
// 'manual' because the wrapper can't know which agent context invoked it;
// agent-attribution context can be set per-handler via setAgentContext()
// and gets read back by the wrapper. Callers that want full attribution
// should migrate to run() / runStream() directly; this is a stop-gap so
// G2's exit-gate verification (llm_calls rows present) passes.
//
// Cloud-only. Never import from `lib/scoring.ts` (which must stay pure).

import Anthropic from '@anthropic-ai/sdk';
import { run, runStream, setAnthropicClientForTesting } from './llm/run';
import { recordLLMCall } from './llm/recorder';
import { costUsd } from './llm/pricing';
import type { LLMSurface } from './llm/types';

export const RATIONALE_MODEL = process.env.PF_RATIONALE_MODEL ?? 'claude-sonnet-4-6';
const MAX_TOKENS = 800;

const apiKey = process.env.ANTHROPIC_API_KEY;
let _client: Anthropic | null = null;
type AnthropicLike = Pick<Anthropic, 'messages'>;
let _override: AnthropicLike | null = null;

export function setAnthropicForTesting(stub: AnthropicLike | null): void {
  _override = stub;
  setAnthropicClientForTesting(stub);
  // Reset the wrapped factory cache so the next anthropic() call re-wraps
  // (or returns the override straight through).
  _client = null;
}

interface AgentContext {
  agentName: string | null;
  agentRunId: number | null;
  sessionId: string | null;
  surface: LLMSurface;
}

let _agentContext: AgentContext = {
  agentName: null,
  agentRunId: null,
  sessionId: null,
  surface: 'manual',
};

/**
 * Set the agent context that the wrapped `anthropic()` client reports
 * with each recorded call. Cron handlers should call this once at the
 * start of their work so `pathfinder.llm_calls` rows carry attribution
 * even when the handler uses the legacy `client.messages.create()` path.
 *
 * Vercel function isolates handle a single request at a time, so module
 * state is safe within an invocation. Tests that need to scope context
 * should use the returned reset thunk.
 */
export function setAgentContext(ctx: Partial<AgentContext>): () => void {
  const previous = { ..._agentContext };
  _agentContext = { ..._agentContext, ...ctx };
  return () => {
    _agentContext = previous;
  };
}

/**
 * Direct Anthropic client accessor. Retained for callers that need raw
 * SDK features. The returned client is INSTRUMENTED — `.messages.create`
 * and `.messages.stream` fire `recordLLMCall()` after each call so the
 * llm_calls table captures these requests. New callers should still
 * prefer run() / runStream() from lib/llm/run.ts for explicit attribution.
 */
export function anthropic(): Anthropic {
  if (_override) return _override as Anthropic;
  if (_client) return _client;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  const heliconeKey = process.env.HELICONE_API_KEY;
  const real = heliconeKey
    ? new Anthropic({
        apiKey,
        baseURL: 'https://anthropic.helicone.ai',
        defaultHeaders: { 'Helicone-Auth': `Bearer ${heliconeKey}` },
      })
    : new Anthropic({ apiKey });
  _client = wrapForRecording(real);
  return _client;
}

interface AnthropicMessageUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

function wrapForRecording(real: Anthropic): Anthropic {
  const realCreate = real.messages.create.bind(real.messages);
  const realStream = real.messages.stream.bind(real.messages);

  // Override the methods on the messages object directly. The Anthropic SDK
  // exposes `messages` as a class instance with bound methods; rebinding
  // here is the lowest-friction wrapping.
  (real.messages as unknown as { create: typeof realCreate }).create = (async function (
    ...args: Parameters<typeof realCreate>
  ): Promise<Awaited<ReturnType<typeof realCreate>>> {
    const t0 = Date.now();
    const params = args[0] as { model: string };
    const res = await realCreate(...args);
    try {
      const usage = (res as unknown as { usage?: AnthropicMessageUsage }).usage;
      const inputTokens = usage?.input_tokens ?? 0;
      const outputTokens = usage?.output_tokens ?? 0;
      const cachedInputTokens = usage?.cache_read_input_tokens ?? 0;
      recordLLMCall({
        model: params.model,
        surface: _agentContext.surface,
        agentName: _agentContext.agentName,
        agentRunId: _agentContext.agentRunId,
        sessionId: _agentContext.sessionId,
        inputTokens,
        outputTokens,
        cachedInputTokens,
        costUsd: costUsd({ model: params.model, inputTokens, outputTokens, cachedInputTokens }),
        latencyMs: Date.now() - t0,
        cacheHit: false,
      });
    } catch (e) {
      console.error('[lib/anthropic] post-call telemetry failed (non-fatal)', e);
    }
    return res;
  }) as typeof realCreate;

  (real.messages as unknown as { stream: typeof realStream }).stream = (function (
    ...args: Parameters<typeof realStream>
  ): ReturnType<typeof realStream> {
    const t0 = Date.now();
    const params = args[0] as { model: string };
    const stream = realStream(...args);
    // Hook the final-message callback. Anthropic SDK's MessageStream emits
    // 'finalMessage' once aggregation is done; we tap it for usage.
    void (async () => {
      try {
        const final = await (stream as unknown as { finalMessage?: () => Promise<{ usage?: AnthropicMessageUsage }> }).finalMessage?.();
        const usage = final?.usage;
        const inputTokens = usage?.input_tokens ?? 0;
        const outputTokens = usage?.output_tokens ?? 0;
        const cachedInputTokens = usage?.cache_read_input_tokens ?? 0;
        recordLLMCall({
          model: params.model,
          surface: _agentContext.surface,
          agentName: _agentContext.agentName,
          agentRunId: _agentContext.agentRunId,
          sessionId: _agentContext.sessionId,
          inputTokens,
          outputTokens,
          cachedInputTokens,
          costUsd: costUsd({ model: params.model, inputTokens, outputTokens, cachedInputTokens }),
          latencyMs: Date.now() - t0,
          cacheHit: false,
        });
      } catch (e) {
        console.error('[lib/anthropic] stream telemetry failed (non-fatal)', e);
      }
    })();
    return stream;
  }) as typeof realStream;

  return real;
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
