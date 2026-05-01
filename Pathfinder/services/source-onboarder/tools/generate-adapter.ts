// services/source-onboarder/tools/generate-adapter.ts
//
// Wraps lib/llm/run.ts to ask Sonnet for a TypeScript adapter module body.
// Spec §7 — verbatim system prompt.
//
// The generated code is stored in pathfinder.source_adapters.generated_code
// for traceability. For Tier 1 default adapters (socrata-default, rest-default,
// rss-default, json-dump-default), generation is skipped — those use the
// hand-written modules in lib/adapters/. Generation runs for source-specific
// custom adapters where the default is insufficient.

import { run } from '@/lib/llm/run';
import type { AdapterSpec } from '@/lib/adapters/types';

const SYSTEM_PROMPT = `You are writing a TypeScript adapter module for the Unicron source library.

Module signature:
  export const adapter: Adapter<TRaw, TNormalized> = {
    type: '<source_type>',
    poll: async (source) => { ... return TRaw[] },
    normalize: (raw: TRaw) => TNormalized,
    validate: (n: TNormalized) => ValidationResult,
  };

Canonical TNormalized shape:
  { source_event_id: string, timestamp: ISO8601, project_value?: number,
    project_type?: string, location?: { address?, city?, state?, lat?, lng? },
    gc_name?: string, raw_text?: string, source_url: string,
    jurisdiction: string, metadata: object }

You MUST:
- Handle pagination if the source paginates
- Handle rate limits (axios with retry-after)
- Map at least source_event_id, timestamp, raw_text, source_url, jurisdiction
- Leave optional fields undefined if source does not provide them
- Use only built-in fetch and standard parsing libs available in the runtime

Return ONLY the TypeScript module. No explanation.`;

export interface GenerateAdapterOptions {
  spec: AdapterSpec;
  sessionId: string;
  agentRunId?: number | null;
}

export async function generateAdapterCode(opts: GenerateAdapterOptions): Promise<{ code: string; costUsd: number }> {
  const userPrompt = buildUserPrompt(opts.spec);
  const res = await run({
    model: 'claude-sonnet-4-6',
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 2048,
    surface: 'architect',
    agentName: 'source-onboarder',
    sessionId: opts.sessionId,
    agentRunId: opts.agentRunId ?? null,
  });
  return { code: stripCodeFence(res.content), costUsd: res.usage.costUsd };
}

function buildUserPrompt(spec: AdapterSpec): string {
  const samples = JSON.stringify(spec.sampleRecords.slice(0, 3), null, 2);
  return `Source spec:
  Type: ${spec.kind}
  Endpoint: ${spec.endpoint}
  Auth: ${spec.authPattern ?? 'none'}
  Pagination: ${spec.paginationPattern ?? 'unknown'}
  Jurisdiction hint: ${spec.jurisdictionHint ?? 'unknown'}

  Sample records (3):
  ${samples}

  Inferred schema:
  ${JSON.stringify(spec.schemaInferred ?? {}, null, 2)}`;
}

function stripCodeFence(s: string): string {
  return s
    .replace(/^```(?:typescript|ts)?\n/i, '')
    .replace(/\n```\s*$/i, '')
    .trim();
}
