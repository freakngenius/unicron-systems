// lib/chat/sonar.ts — Perplexity Sonar surface for the Intelligence Chat.
//
// As of Phase 1 G1 (Task A3), production calls flow through the LLM gateway
// at lib/llm/run.ts. This file preserves its public API (completeSonar,
// streamSonar, isSonarConfigured, SonarRequestError, SonarNotConfiguredError,
// SONAR_UNCONFIGURED_MESSAGE, setSonarForTesting, request/response/event
// types). Internals delegate.
//
// SonarTestStub backward-compat: the legacy stub (returning parsed
// SonarResponse / SonarStreamEvent values) takes precedence over the
// gateway. New tests should prefer setSonarFetchForTesting() in
// lib/llm/run.ts. Existing 19 tests in __tests__/chat/sonar.test.ts and
// __tests__/chat/outreach-drafter.test.ts continue to use this stub
// without modification.

import { run, runStream } from '../llm/run';
import type { ChatSourceCitation } from '@/lib/types';

export const SONAR_MODEL = process.env.PF_SONAR_MODEL ?? 'sonar';
const DEFAULT_MAX_TOKENS = 1024;

export const SONAR_UNCONFIGURED_MESSAGE =
  "This question requires Perplexity Sonar research, which is not yet configured. Available now: ask me anything about the dashboard's existing data, or use me to draft and refine outreach.";

export class SonarNotConfiguredError extends Error {
  constructor() {
    super('PERPLEXITY_API_KEY is not set');
    this.name = 'SonarNotConfiguredError';
  }
}

export class SonarRequestError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Sonar request failed with status ${status}`);
    this.name = 'SonarRequestError';
    this.status = status;
    this.body = body;
  }
}

export interface SonarRequest {
  query: string;
  systemPrompt?: string;
  recencyDays?: number;
  domains?: string[];
  maxTokens?: number;
  model?: string;
  agentRunId?: number | null;
  agentName?: string | null;
  sessionId?: string | null;
}

export interface SonarResponse {
  text: string;
  citations: ChatSourceCitation[];
  model: string;
  latencyMs: number;
}

export type SonarStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'citations'; items: ChatSourceCitation[] }
  | { type: 'done' };

export function isSonarConfigured(): boolean {
  if (_override) return true;
  return Boolean(process.env.PERPLEXITY_API_KEY);
}

interface SonarTestStub {
  complete: (req: SonarRequest) => Promise<SonarResponse>;
  stream?: (req: SonarRequest) => AsyncGenerator<SonarStreamEvent, void, unknown>;
}
let _override: SonarTestStub | null = null;

export function setSonarForTesting(stub: SonarTestStub | null): void {
  _override = stub;
}

export async function completeSonar(req: SonarRequest): Promise<SonarResponse> {
  if (_override) return _override.complete(req);
  if (!process.env.PERPLEXITY_API_KEY) throw new SonarNotConfiguredError();

  try {
    const res = await run({
      model: req.model ?? SONAR_MODEL,
      systemPrompt: req.systemPrompt,
      messages: [{ role: 'user', content: req.query }],
      maxTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      surface: 'chat',
      agentName: req.agentName ?? 'chat',
      agentRunId: req.agentRunId ?? null,
      sessionId: req.sessionId ?? null,
      recencyDays: req.recencyDays,
      domains: req.domains,
      returnCitations: true,
    });
    return {
      text: res.content,
      citations: (res.citations ?? []) as ChatSourceCitation[],
      model: res.model,
      latencyMs: res.usage.latencyMs,
    };
  } catch (err) {
    // Translate gateway errors into Sonar-shaped errors that downstream
    // route code already knows how to handle.
    if (err instanceof Error && err.message.startsWith('Sonar request failed')) {
      const m = err.message.match(/status=(\d+)\s+body=([\s\S]*)$/);
      if (m) throw new SonarRequestError(Number(m[1]), m[2]);
    }
    throw err;
  }
}

export async function* streamSonar(
  req: SonarRequest,
): AsyncGenerator<SonarStreamEvent, void, unknown> {
  if (_override?.stream) {
    yield* _override.stream(req);
    return;
  }
  if (_override) {
    const r = await _override.complete(req);
    if (r.text) yield { type: 'delta', text: r.text };
    if (r.citations.length > 0) yield { type: 'citations', items: r.citations };
    yield { type: 'done' };
    return;
  }
  if (!process.env.PERPLEXITY_API_KEY) throw new SonarNotConfiguredError();

  try {
    const stream = runStream({
      model: req.model ?? SONAR_MODEL,
      systemPrompt: req.systemPrompt,
      messages: [{ role: 'user', content: req.query }],
      maxTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      surface: 'chat',
      agentName: req.agentName ?? 'chat',
      agentRunId: req.agentRunId ?? null,
      sessionId: req.sessionId ?? null,
      recencyDays: req.recencyDays,
      domains: req.domains,
      returnCitations: true,
    });
    for await (const event of stream) {
      if (event.type === 'delta') yield { type: 'delta', text: event.text };
      else if (event.type === 'citations') yield { type: 'citations', items: event.items as ChatSourceCitation[] };
      else if (event.type === 'done') yield { type: 'done' };
      // 'usage' events are gateway-internal; recorder writes the row.
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Sonar stream request failed')) {
      const m = err.message.match(/status=(\d+)\s+body=([\s\S]*)$/);
      if (m) throw new SonarRequestError(Number(m[1]), m[2]);
    }
    throw err;
  }
}
