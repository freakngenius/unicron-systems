// LLM gateway types — Phase 1 G1 Task A2.
// Spec: SPEC - Backend Architecture.md §5.

export type LLMModel =
  | 'claude-sonnet-4-6'
  | 'claude-haiku-4-5'
  | 'sonar-pro'
  | 'sonar';

export type LLMSurface = 'cron' | 'chat' | 'architect' | 'manual' | 'test' | 'dev';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  model: LLMModel | string;
  systemPrompt?: string;
  messages: LLMMessage[];
  maxTokens?: number;
  surface: LLMSurface;
  agentRunId?: number | null;
  agentName?: string | null;
  sessionId?: string | null;

  // Perplexity-only knobs. Gateway forwards them when the model is Sonar; ignored for Anthropic.
  recencyDays?: number;
  domains?: string[];
  returnCitations?: boolean;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costUsd: number;
  latencyMs: number;
  cacheHit: boolean;
}

export interface LLMResponse {
  content: string;
  citations?: { url: string; title?: string }[];
  model: string;
  usage: LLMUsage;
}

export type LLMStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'citations'; items: { url: string; title?: string }[] }
  | { type: 'usage'; usage: LLMUsage }
  | { type: 'done' };
