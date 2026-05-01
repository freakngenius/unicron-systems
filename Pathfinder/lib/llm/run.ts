// LLM gateway — Phase 1 G1 Task A2.
// Spec: SPEC - Backend Architecture.md §5.
//
// Single entry points for the 4 production model families:
//   - claude-sonnet-4-6, claude-haiku-4-5  → Anthropic SDK
//   - sonar, sonar-pro                      → Perplexity REST
//
// run(req) is the one-shot, non-streaming variant. Returns LLMResponse.
// runStream(req) yields LLMStreamEvent values for SSE consumers.
// Both write a row to pathfinder.llm_calls after completion via the recorder.
//
// The existing call sites (lib/anthropic.ts, lib/chat/sonar.ts) retain their
// public APIs and delegate to this gateway. Cost-summary endpoint reads from
// the llm_calls table (G1 Task A4).

import Anthropic from '@anthropic-ai/sdk';
import type { LLMRequest, LLMResponse, LLMStreamEvent, LLMUsage } from './types';
import { costUsd } from './pricing';
import { recordLLMCall } from './recorder';

const DEFAULT_MAX_TOKENS = 1024;
const SONAR_ENDPOINT_DIRECT = 'https://api.perplexity.ai/chat/completions';
// Helicone gateway endpoints (env-gated; no-op when HELICONE_API_KEY unset).
// Helicone routes the same Anthropic / Perplexity API surface through its
// observability layer for trace inspection + per-call attribution.
// Anthropic: clients SDK with baseURL override + Helicone-Auth header.
// Perplexity: Helicone proxies the OpenAI-compatible endpoint.
const HELICONE_ANTHROPIC_BASE_URL = 'https://anthropic.helicone.ai';
const HELICONE_PERPLEXITY_ENDPOINT = 'https://oai.helicone.ai/v1/chat/completions';

type AnthropicLike = Pick<Anthropic, 'messages'>;
let _anthropicOverride: AnthropicLike | null = null;
let _anthropicClient: Anthropic | null = null;

export function setAnthropicClientForTesting(stub: AnthropicLike | null): void {
  _anthropicOverride = stub;
  // Reset cached client so the next anthropicClient() call rebuilds with
  // (or without) Helicone routing if env changed mid-test.
  _anthropicClient = null;
}

function anthropicClient(): Anthropic {
  if (_anthropicOverride) return _anthropicOverride as Anthropic;
  if (_anthropicClient) return _anthropicClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  const heliconeKey = process.env.HELICONE_API_KEY;
  if (heliconeKey) {
    _anthropicClient = new Anthropic({
      apiKey,
      baseURL: HELICONE_ANTHROPIC_BASE_URL,
      defaultHeaders: {
        'Helicone-Auth': `Bearer ${heliconeKey}`,
      },
    });
  } else {
    _anthropicClient = new Anthropic({ apiKey });
  }
  return _anthropicClient;
}

function sonarEndpoint(): string {
  return process.env.HELICONE_API_KEY
    ? HELICONE_PERPLEXITY_ENDPOINT
    : SONAR_ENDPOINT_DIRECT;
}

function sonarHeaders(apiKey: string, accept?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (accept) headers.Accept = accept;
  // When routing through Helicone, the gateway needs its own auth header
  // alongside the upstream Perplexity Authorization header.
  const heliconeKey = process.env.HELICONE_API_KEY;
  if (heliconeKey) {
    headers['Helicone-Auth'] = `Bearer ${heliconeKey}`;
    // Tell Helicone which target API to forward to (its OAI-compatible
    // generic gateway needs a hint).
    headers['Helicone-Target-URL'] = SONAR_ENDPOINT_DIRECT;
  }
  return headers;
}

interface SonarFetchOverride {
  (url: string, init: RequestInit): Promise<Response>;
}
let _sonarFetchOverride: SonarFetchOverride | null = null;

export function setSonarFetchForTesting(stub: SonarFetchOverride | null): void {
  _sonarFetchOverride = stub;
}

function sonarFetch(): SonarFetchOverride {
  return _sonarFetchOverride ?? ((url, init) => fetch(url, init));
}

function isAnthropicModel(model: string): boolean {
  return model.startsWith('claude-');
}

function isSonarModel(model: string): boolean {
  return model === 'sonar' || model.startsWith('sonar-');
}

function recencyFilter(days?: number): 'hour' | 'day' | 'week' | 'month' {
  if (days == null) return 'month';
  if (days <= 1) return 'day';
  if (days <= 7) return 'week';
  if (days <= 31) return 'month';
  return 'month';
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function buildSonarBody(req: LLMRequest, stream: boolean): Record<string, unknown> {
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
  if (req.systemPrompt) messages.push({ role: 'system', content: req.systemPrompt });
  for (const m of req.messages) messages.push({ role: m.role, content: m.content });

  const body: Record<string, unknown> = {
    model: req.model,
    messages,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    return_citations: req.returnCitations ?? true,
    search_recency_filter: recencyFilter(req.recencyDays),
    stream,
  };
  if (req.domains && req.domains.length > 0) {
    body.search_domain_filter = req.domains;
  }
  return body;
}

function recordFromUsage(req: LLMRequest, model: string, usage: LLMUsage): void {
  recordLLMCall({
    model,
    surface: req.surface,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    costUsd: usage.costUsd,
    latencyMs: usage.latencyMs,
    cacheHit: usage.cacheHit,
    agentRunId: req.agentRunId ?? null,
    agentName: req.agentName ?? null,
    sessionId: req.sessionId ?? null,
  });
}

// ----- One-shot (non-streaming) ------------------------------------------

export async function run(req: LLMRequest): Promise<LLMResponse> {
  if (isAnthropicModel(req.model)) return runAnthropic(req);
  if (isSonarModel(req.model)) return runSonar(req);
  throw new Error(`Unknown model family for model: ${req.model}`);
}

async function runAnthropic(req: LLMRequest): Promise<LLMResponse> {
  const startedAt = Date.now();
  const client = anthropicClient();
  const res = await client.messages.create({
    model: req.model,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: req.systemPrompt,
    messages: req.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  });
  const content = res.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim();
  const inputTokens = res.usage.input_tokens ?? 0;
  const outputTokens = res.usage.output_tokens ?? 0;
  const cachedInputTokens =
    (res.usage as unknown as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0;
  const cost = costUsd({ model: req.model, inputTokens, outputTokens, cachedInputTokens });
  const usage: LLMUsage = {
    inputTokens,
    outputTokens,
    cachedInputTokens,
    costUsd: cost,
    latencyMs: Date.now() - startedAt,
    cacheHit: false,
  };
  recordFromUsage(req, req.model, usage);
  return { content, model: req.model, usage };
}

async function runSonar(req: LLMRequest): Promise<LLMResponse> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY is not set');
  const startedAt = Date.now();
  const res = await sonarFetch()(sonarEndpoint(), {
    method: 'POST',
    headers: sonarHeaders(apiKey),
    body: JSON.stringify(buildSonarBody(req, false)),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '<unreadable body>');
    throw new Error(`Sonar request failed status=${res.status} body=${text}`);
  }
  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
    citations?: string[];
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = json.choices?.[0]?.message?.content ?? '';
  const citations = (json.citations ?? []).map((url) => ({ url, title: hostFromUrl(url) }));
  const inputTokens = json.usage?.prompt_tokens ?? 0;
  const outputTokens = json.usage?.completion_tokens ?? 0;
  const cost = costUsd({ model: req.model, inputTokens, outputTokens });
  const model = json.model ?? req.model;
  const usage: LLMUsage = {
    inputTokens,
    outputTokens,
    cachedInputTokens: 0,
    costUsd: cost,
    latencyMs: Date.now() - startedAt,
    cacheHit: false,
  };
  recordFromUsage(req, model, usage);
  return { content, citations, model, usage };
}

// ----- Streaming ---------------------------------------------------------

export async function* runStream(req: LLMRequest): AsyncGenerator<LLMStreamEvent, void, unknown> {
  if (isAnthropicModel(req.model)) {
    yield* streamAnthropic(req);
    return;
  }
  if (isSonarModel(req.model)) {
    yield* streamSonar(req);
    return;
  }
  throw new Error(`Unknown model family for model: ${req.model}`);
}

async function* streamAnthropic(req: LLMRequest): AsyncGenerator<LLMStreamEvent, void, unknown> {
  const startedAt = Date.now();
  const client = anthropicClient();
  const stream = client.messages.stream({
    model: req.model,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: req.systemPrompt,
    messages: req.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  });
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      const text = event.delta.text;
      if (text) yield { type: 'delta', text };
    } else if (event.type === 'message_delta') {
      outputTokens = event.usage?.output_tokens ?? outputTokens;
    } else if (event.type === 'message_start') {
      const u = event.message.usage as unknown as {
        input_tokens?: number;
        cache_read_input_tokens?: number;
      };
      inputTokens = u.input_tokens ?? 0;
      cachedInputTokens = u.cache_read_input_tokens ?? 0;
    }
  }
  const cost = costUsd({ model: req.model, inputTokens, outputTokens, cachedInputTokens });
  const usage: LLMUsage = {
    inputTokens,
    outputTokens,
    cachedInputTokens,
    costUsd: cost,
    latencyMs: Date.now() - startedAt,
    cacheHit: false,
  };
  yield { type: 'usage', usage };
  yield { type: 'done' };
  recordFromUsage(req, req.model, usage);
}

async function* streamSonar(req: LLMRequest): AsyncGenerator<LLMStreamEvent, void, unknown> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY is not set');
  const startedAt = Date.now();
  const res = await sonarFetch()(sonarEndpoint(), {
    method: 'POST',
    headers: sonarHeaders(apiKey, 'text/event-stream'),
    body: JSON.stringify(buildSonarBody(req, true)),
  });
  if (!res.ok || !res.body) {
    const text = res.body ? await res.text().catch(() => '<unreadable body>') : 'no body';
    throw new Error(`Sonar stream request failed status=${res.status} body=${text}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let citations: { url: string; title?: string }[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let lastModel = req.model;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const normalized = buffer.replace(/\r\n/g, '\n');
      const events = normalized.split('\n\n');
      buffer = events.pop() ?? '';
      for (const block of events) {
        const line = block.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        let parsed: {
          choices?: { delta?: { content?: string } }[];
          citations?: string[];
          model?: string;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }
        const text = parsed.choices?.[0]?.delta?.content;
        if (text) yield { type: 'delta', text };
        if (parsed.citations && parsed.citations.length > 0) {
          citations = parsed.citations.map((url) => ({ url, title: hostFromUrl(url) }));
        }
        if (parsed.usage) {
          inputTokens = parsed.usage.prompt_tokens ?? inputTokens;
          outputTokens = parsed.usage.completion_tokens ?? outputTokens;
        }
        if (parsed.model) lastModel = parsed.model;
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (citations.length > 0) yield { type: 'citations', items: citations };
  const cost = costUsd({ model: lastModel, inputTokens, outputTokens });
  const usage: LLMUsage = {
    inputTokens,
    outputTokens,
    cachedInputTokens: 0,
    costUsd: cost,
    latencyMs: Date.now() - startedAt,
    cacheHit: false,
  };
  yield { type: 'usage', usage };
  yield { type: 'done' };
  recordFromUsage(req, lastModel, usage);
}
