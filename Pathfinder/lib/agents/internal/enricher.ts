// lib/agents/internal/enricher.ts
//
// Internal onboarding Stage 5 — Internal-shaped enricher.
//
// The platform Enricher in lib/agents/enricher.ts is shaped for Zedcor
// "buyer org context" (multi-branch, funding, hiring, news). The Funder
// enricher is shaped for fundable-org research (legal_form, founders,
// raise stage). Internal needs different signals:
//   - company website + LinkedIn profile
//   - employee count
//   - service_category (one of the architecture enum values)
//   - primary contacts (sales / BD leadership)
//
// Same `lib/llm/run` substrate, different prompt + output schema. The
// existing enricher and Funder enricher are untouched.
//
// Spec: Pathfinder/Pathfinder-Internal-Blueprint.md §7.
//       Pathfinder/Pathfinder-Internal-Architecture.json (service_category enum).

import { run } from '@/lib/llm/run';
import type { LLMResponse, LLMSurface } from '@/lib/llm/types';

export interface InternalEnricherInput {
  project_id: string;
  title: string;
  summary?: string | null;
  source: string;
  raw_payload?: Record<string, unknown>;
  agentRunId?: number | null;
  surface?: LLMSurface;
}

export interface InternalContact {
  name: string;
  title?: string;
  email?: string;
  linkedin_url?: string;
}

export type InternalSalesMotion = 'active-outbound' | 'hiring-bd' | 'inbound-only' | 'unknown';

export type InternalServiceCategory =
  | 'equipment-rental'
  | 'temp-fence'
  | 'temp-power-sanitation'
  | 'traffic-control'
  | 'modular-site-offices'
  | 'commercial-roofing'
  | 'industrial-cleaning'
  | 'waste-management'
  | 'crane-rental'
  | 'jobsite-connectivity'
  | 'site-safety-services'
  | 'general-contractor'
  | 'specialty-trade'
  | 'other';

export const INTERNAL_SERVICE_CATEGORIES: InternalServiceCategory[] = [
  'equipment-rental',
  'temp-fence',
  'temp-power-sanitation',
  'traffic-control',
  'modular-site-offices',
  'commercial-roofing',
  'industrial-cleaning',
  'waste-management',
  'crane-rental',
  'jobsite-connectivity',
  'site-safety-services',
  'general-contractor',
  'specialty-trade',
  'other',
];

export interface InternalEnrichment {
  project_id: string;
  website: string | null;
  linkedin: string | null;
  employee_count: number | null;
  service_category: InternalServiceCategory | null;
  sales_motion: InternalSalesMotion | null;
  contacts: InternalContact[];
  associations: string[];
  brief: string;
  citations: { url: string; title?: string }[];
  model: string;
  cost_usd: number;
  latency_ms: number;
}

export const INTERNAL_ENRICHER_MODEL = 'sonar';
const ENRICHER_MAX_TOKENS = 1_500;
const ENRICHER_RECENCY_DAYS = 90;

const SYSTEM_PROMPT = `You are the Pathfinder Internal Enricher. Given a candidate construction-vertical B2B services company, research and return STRICT JSON with these fields:
{
  "website": string | null,
  "linkedin": string | null,
  "employee_count": number | null,
  "service_category": "equipment-rental" | "temp-fence" | "temp-power-sanitation" | "traffic-control" | "modular-site-offices" | "commercial-roofing" | "industrial-cleaning" | "waste-management" | "crane-rental" | "jobsite-connectivity" | "site-safety-services" | "general-contractor" | "specialty-trade" | "other" | null,
  "sales_motion": "active-outbound" | "hiring-bd" | "inbound-only" | "unknown" | null,
  "contacts": [ { "name": string, "title"?: string, "email"?: string, "linkedin_url"?: string } ],
  "associations": [ string ],
  "brief": string
}

Rules:
- Use Sonar web search; cite each non-trivial fact via citations.
- service_category is REQUIRED to be one of the enum values listed. Choose the closest fit; use "specialty-trade" or "other" when unsure rather than guessing.
- sales_motion: pick "hiring-bd" if you see recent sales/BD job postings; "active-outbound" if you see outbound sequencer / SDR-tool footprint or recent press; "inbound-only" if their public posture is inbound-marketing-only; "unknown" otherwise.
- contacts: include only public, role-relevant leaders (VP/Director/Head of Sales, Business Development, Revenue, Growth). Skip if you cannot confirm by name.
- associations: list trade-association memberships you can confirm (ARA, NUCA, NDA, AGC, ABC, etc).
- brief: <= 600 chars summarizing what they do + where + how they sell.
- The first character of your response must be '{'. No prose outside the JSON. No code fence. No em-dashes.`;

function buildUserPrompt(input: InternalEnricherInput): string {
  const lines = [`Candidate company: ${input.title}`, `Source: ${input.source}`];
  if (input.summary) lines.push(`Summary: ${input.summary.slice(0, 600)}`);
  const payload = input.raw_payload ?? {};
  if (payload.city || payload.state) {
    lines.push(`Location hint: ${[payload.city, payload.state].filter(Boolean).join(', ')}`);
  }
  const naics =
    (payload.internal_construction_naics_match as string | undefined) ??
    (payload.primary_naics as string | undefined);
  if (naics) lines.push(`NAICS hint: ${naics}`);
  const inferred = payload.internal_inferred_service_category as string | undefined;
  if (inferred) lines.push(`Qualifier service_category guess: ${inferred}`);
  return lines.join('\n');
}

function clampServiceCategory(value: unknown): InternalServiceCategory | null {
  if (typeof value !== 'string') return null;
  return (INTERNAL_SERVICE_CATEGORIES as string[]).includes(value)
    ? (value as InternalServiceCategory)
    : null;
}

function clampSalesMotion(value: unknown): InternalSalesMotion | null {
  if (typeof value !== 'string') return null;
  if (['active-outbound', 'hiring-bd', 'inbound-only', 'unknown'].includes(value)) {
    return value as InternalSalesMotion;
  }
  return null;
}

export function parseInternalEnrichment(
  text: string,
): Omit<InternalEnrichment, 'project_id' | 'citations' | 'model' | 'cost_usd' | 'latency_ms'> | null {
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
    website: typeof p.website === 'string' && p.website.trim() ? p.website.trim() : null,
    linkedin: typeof p.linkedin === 'string' && p.linkedin.trim() ? p.linkedin.trim() : null,
    employee_count: typeof p.employee_count === 'number' && Number.isFinite(p.employee_count) ? p.employee_count : null,
    service_category: clampServiceCategory(p.service_category),
    sales_motion: clampSalesMotion(p.sales_motion),
    contacts: Array.isArray(p.contacts)
      ? (p.contacts as Array<Record<string, unknown>>).flatMap((c) => {
          const name = c.name;
          if (typeof name !== 'string' || !name.trim()) return [];
          return [
            {
              name: name.trim(),
              title: typeof c.title === 'string' ? c.title : undefined,
              email: typeof c.email === 'string' ? c.email : undefined,
              linkedin_url: typeof c.linkedin_url === 'string' ? c.linkedin_url : undefined,
            },
          ];
        })
      : [],
    associations: Array.isArray(p.associations)
      ? (p.associations as unknown[]).filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      : [],
    brief: typeof p.brief === 'string' ? p.brief.slice(0, 600) : '',
  };
}

export async function enrichForInternal(input: InternalEnricherInput): Promise<InternalEnrichment> {
  if (!input.project_id) throw new Error('enrichForInternal: project_id required');
  if (!input.title) throw new Error('enrichForInternal: title required');

  const res: LLMResponse = await run({
    model: INTERNAL_ENRICHER_MODEL,
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(input) }],
    maxTokens: ENRICHER_MAX_TOKENS,
    surface: input.surface ?? 'cron',
    agentName: 'enricher',
    agentRunId: input.agentRunId ?? null,
    recencyDays: ENRICHER_RECENCY_DAYS,
    returnCitations: true,
  });

  const parsed = parseInternalEnrichment(res.content);
  const empty = {
    website: null,
    linkedin: null,
    employee_count: null,
    service_category: null,
    sales_motion: null,
    contacts: [],
    associations: [],
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

// Exported for tests.
export { SYSTEM_PROMPT as INTERNAL_ENRICHER_SYSTEM_PROMPT };
