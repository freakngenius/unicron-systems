// lib/agents/funder/enricher.ts
//
// Funder onboarding Stage 4 — Funder-shaped enricher.
//
// The platform Enricher in lib/agents/enricher.ts is shaped for
// "buyer org context" (multi-branch, funding, hiring, news) — Zedcor's
// model. Funder needs different signals:
//   - org name canonicalization
//   - legal form (501c3 vs PBC vs LLC-mission-lock vs fiscally-sponsored)
//   - founder list with current and prior affiliations
//   - raise target / fundraising stage
//
// Same `lib/llm/run` substrate, different prompt + output schema. The
// existing enricher is untouched.
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 4.

import { run } from '@/lib/llm/run';
import type { LLMResponse, LLMSurface } from '@/lib/llm/types';

export interface FunderEnricherInput {
  project_id: string;
  title: string;
  summary?: string | null;
  source: string;
  raw_payload?: Record<string, unknown>;
  agentRunId?: number | null;
  surface?: LLMSurface;
}

export interface FunderFounder {
  name: string;
  role?: string;
  prior_affiliation?: string;
  notes?: string;
}

export interface FunderEnrichment {
  project_id: string;
  org_name: string | null;
  legal_form: '501c3' | 'pbc' | 'llc-mission-lock' | 'fiscally-sponsored' | 'other' | null;
  founders: FunderFounder[];
  founded_year: number | null;
  raise_target_usd: number | null;
  fundraising_stage: 'forming' | 'pre-raise' | 'actively-raising' | 'closing' | 'raised' | null;
  brief: string;
  citations: { url: string; title?: string }[];
  model: string;
  cost_usd: number;
  latency_ms: number;
}

export const FUNDER_ENRICHER_MODEL = 'sonar';
const ENRICHER_MAX_TOKENS = 1_500;
const ENRICHER_RECENCY_DAYS = 90;

const SYSTEM_PROMPT = `You are the Pathfinder Funder Enricher. Given a candidate organization, research and return STRICT JSON with these fields:
{
  "org_name": string | null,
  "legal_form": "501c3" | "pbc" | "llc-mission-lock" | "fiscally-sponsored" | "other" | null,
  "founders": [ { "name": string, "role"?: string, "prior_affiliation"?: string, "notes"?: string } ],
  "founded_year": number | null,
  "raise_target_usd": number | null,
  "fundraising_stage": "forming" | "pre-raise" | "actively-raising" | "closing" | "raised" | null,
  "brief": string ≤ 600 chars
}

Rules:
- Use Sonar web search; cite each non-trivial fact. Citations come back in the citations array.
- If you cannot find the org's legal form or founders with public-record support, set those fields to null / empty array. Do not guess.
- prior_affiliation should be the founder's most recent employer or affiliation before this org (e.g. "OpenAI alignment team", "MIT BCS").
- The first character of your response must be '{'. No prose outside the JSON. No code fence.`;

function buildUserPrompt(input: FunderEnricherInput): string {
  const lines = [`Candidate organization: ${input.title}`, `Source: ${input.source}`];
  if (input.summary) lines.push(`Summary: ${input.summary.slice(0, 600)}`);
  if (input.raw_payload?.city || input.raw_payload?.state) {
    lines.push(`Location hint: ${[input.raw_payload.city, input.raw_payload.state].filter(Boolean).join(', ')}`);
  }
  return lines.join('\n');
}

export function parseFunderEnrichment(text: string): Omit<FunderEnrichment, 'project_id' | 'citations' | 'model' | 'cost_usd' | 'latency_ms'> | null {
  const trimmed = text.trim();
  if (!trimmed || !trimmed.startsWith('{')) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const p = parsed as Record<string, unknown>;
  return {
    org_name: typeof p.org_name === 'string' ? p.org_name : null,
    legal_form: typeof p.legal_form === 'string' ? (p.legal_form as FunderEnrichment['legal_form']) : null,
    founders: Array.isArray(p.founders)
      ? (p.founders as Array<Record<string, unknown>>).flatMap((f) => {
          const name = f.name;
          if (typeof name !== 'string' || !name.trim()) return [];
          return [
            {
              name: name.trim(),
              role: typeof f.role === 'string' ? f.role : undefined,
              prior_affiliation: typeof f.prior_affiliation === 'string' ? f.prior_affiliation : undefined,
              notes: typeof f.notes === 'string' ? f.notes : undefined,
            },
          ];
        })
      : [],
    founded_year: typeof p.founded_year === 'number' ? p.founded_year : null,
    raise_target_usd: typeof p.raise_target_usd === 'number' ? p.raise_target_usd : null,
    fundraising_stage:
      typeof p.fundraising_stage === 'string'
        ? (p.fundraising_stage as FunderEnrichment['fundraising_stage'])
        : null,
    brief: typeof p.brief === 'string' ? p.brief.slice(0, 600) : '',
  };
}

export async function enrichForFunder(input: FunderEnricherInput): Promise<FunderEnrichment> {
  if (!input.project_id) throw new Error('enrichForFunder: project_id required');
  if (!input.title) throw new Error('enrichForFunder: title required');

  const res: LLMResponse = await run({
    model: FUNDER_ENRICHER_MODEL,
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(input) }],
    maxTokens: ENRICHER_MAX_TOKENS,
    surface: input.surface ?? 'cron',
    agentName: 'enricher',
    agentRunId: input.agentRunId ?? null,
    recencyDays: ENRICHER_RECENCY_DAYS,
    returnCitations: true,
  });

  const parsed = parseFunderEnrichment(res.content);
  const empty = {
    org_name: null,
    legal_form: null,
    founders: [],
    founded_year: null,
    raise_target_usd: null,
    fundraising_stage: null,
    brief: '',
  };
  const fields = parsed ?? empty;

  return {
    project_id: input.project_id,
    ...fields,
    citations: res.citations ?? [],
    model: res.model,
    cost_usd: res.usage.costUsd,
    latency_ms: res.usage.latencyMs,
  };
}
