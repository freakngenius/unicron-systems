// lib/chat/sonar.ts — Perplexity Sonar API wrapper for the Intelligence
// Chat panel. Mirrors lib/anthropic.ts in shape: deferred-throw pattern
// so build-time imports don't blow up when PERPLEXITY_API_KEY isn't set.
//
// Per PLAN-P0-01-INTELLIGENCE-CHAT.md § 0 Q2: when the key is unset, the
// chat route consults isSonarConfigured() before dispatching, and emits
// the verbatim degraded-path message instead of calling this module. So
// streamSonar / completeSonar are only invoked when the key IS present.
// We still guard at the call site to fail loudly if someone forgets.

import type { ChatSourceCitation } from '@/lib/types';

export const SONAR_MODEL = process.env.PF_SONAR_MODEL ?? 'sonar';
const ENDPOINT = 'https://api.perplexity.ai/chat/completions';
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_RECENCY: 'month' | 'week' | 'day' | 'hour' = 'month';

// Verbatim degraded-path message — locked in spec § 0 Q2. Do not paraphrase.
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

function apiKey(): string {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) throw new SonarNotConfiguredError();
  return key;
}

// Test-only override. Mirrors setAnthropicForTesting in lib/anthropic.ts.
// When set, completeSonar / streamSonar bypass the HTTP fetch and return
// the override's responses. Production paths never set this.
interface SonarTestStub {
  complete: (req: SonarRequest) => Promise<SonarResponse>;
  stream?: (req: SonarRequest) => AsyncGenerator<SonarStreamEvent, void, unknown>;
}
let _override: SonarTestStub | null = null;

export function setSonarForTesting(stub: SonarTestStub | null): void {
  _override = stub;
}

function recencyFilter(days?: number): 'hour' | 'day' | 'week' | 'month' {
  if (days == null) return DEFAULT_RECENCY;
  if (days <= 1) return 'day';
  if (days <= 7) return 'week';
  if (days <= 31) return 'month';
  return 'month';
}

function buildBody(req: SonarRequest, stream: boolean): Record<string, unknown> {
  const messages: { role: 'system' | 'user'; content: string }[] = [];
  if (req.systemPrompt) messages.push({ role: 'system', content: req.systemPrompt });
  messages.push({ role: 'user', content: req.query });

  const body: Record<string, unknown> = {
    model: req.model ?? SONAR_MODEL,
    messages,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    return_citations: true,
    search_recency_filter: recencyFilter(req.recencyDays),
    stream,
  };
  if (req.domains && req.domains.length > 0) {
    body.search_domain_filter = req.domains;
  }
  return body;
}

export async function completeSonar(req: SonarRequest): Promise<SonarResponse> {
  if (_override) return _override.complete(req);
  const startedAt = Date.now();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildBody(req, false)),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '<unreadable body>');
    throw new SonarRequestError(res.status, text);
  }
  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
    citations?: string[];
    model?: string;
  };
  const text = json.choices?.[0]?.message?.content ?? '';
  const citations = (json.citations ?? []).map((url) => ({ url, title: hostFromUrl(url) }));
  return {
    text,
    citations,
    model: json.model ?? req.model ?? SONAR_MODEL,
    latencyMs: Date.now() - startedAt,
  };
}

// Streaming variant — yields delta events as they arrive, then a final
// citations event, then done. Sonar's SSE format roughly mirrors OpenAI's:
// `data: {"choices":[{"delta":{"content":"..."}}]}` lines, with citations
// arriving on the final chunk under `citations`.
export async function* streamSonar(req: SonarRequest): AsyncGenerator<SonarStreamEvent, void, unknown> {
  if (_override?.stream) {
    yield* _override.stream(req);
    return;
  }
  if (_override) {
    // Stream-stub not provided; replay completeSonar as a single delta.
    const r = await _override.complete(req);
    if (r.text) yield { type: 'delta', text: r.text };
    if (r.citations.length > 0) yield { type: 'citations', items: r.citations };
    yield { type: 'done' };
    return;
  }
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(buildBody(req, true)),
  });
  if (!res.ok || !res.body) {
    const text = res.body ? await res.text().catch(() => '<unreadable body>') : 'no body';
    throw new SonarRequestError(res.status, text);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let citations: ChatSourceCitation[] = [];

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Sonar uses CRLF (`\r\n\r\n`); standard SSE uses LF (`\n\n`).
      // Normalize CRLF→LF first, then split on the canonical LF separator
      // so this parser handles both.
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
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (citations.length > 0) yield { type: 'citations', items: citations };
  yield { type: 'done' };
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
