// lib/agents/search/interpret.ts — interpret an ICP into a search architecture.
//
// SPEC: docs/SPEC-ICP-Search.md (S2 slice).
//
// Calls the existing Architect decomposition session (services/architect/
// sessions/decomposition.ts) to get vertical / lead schema / scoring signals
// grounded in the buyer-pain prompt, then runs a small Sonnet 4.6 follow-up
// to derive NAICS / PSC codes and search keywords used by Tier 1 source
// filters (sam.gov primaryNaics, USAspending recipient_naics, news/RSS
// keyword query).
//
// Dependencies are injected so unit tests mock the Architect and the LLM
// gateway without touching Anthropic.

import { runDecomposition as runDecompositionLive } from '@/services/architect/sessions/decomposition';
import type {
  DecompositionInput,
  DecompositionResponse,
} from '@/services/architect/types';
import { run as runLlm } from '@/lib/llm/run';
import type { LLMRequest, LLMResponse } from '@/lib/llm/types';
import type {
  InterpretResult,
  LeadFieldDef,
  ScoringSignal,
  SearchArchitecture,
} from './types';

export interface InterpretDeps {
  runDecomposition?: (
    opts: { input: DecompositionInput },
  ) => Promise<DecompositionResponse>;
  runLlm?: (req: LLMRequest) => Promise<LLMResponse>;
  // Used to namespace the Architect's vertical_id; defaults to a random UUID.
  newId?: () => string;
  // Overall ceiling for interpretIcp (Architect + NAICS classifier). Defaults
  // to PF_SEARCH_INTERPRET_TIMEOUT_MS (150s) so the call cannot outlive the
  // /api/inngest serverless invocation. The Architect agent loop's own
  // SESSION_TIMEOUT_MS.decomposition (180s) sits ABOVE this on purpose:
  // when the loop hangs (network, model overload), Promise.race surfaces
  // a real error to the orchestrator instead of waiting for Vercel to kill
  // the process — that path leaves the run stuck at status='running'.
  timeoutMs?: number;
}

const MIN_ICP_LENGTH = 10;
const NAICS_MODEL = process.env.PF_SEARCH_INTERPRET_MODEL ?? 'claude-sonnet-4-6';
const NAICS_MAX_TOKENS = 600;
const NAICS_TIMEOUT_MS = Number.parseInt(
  process.env.PF_SEARCH_NAICS_TIMEOUT_MS ?? '60000',
  10,
);
const DEFAULT_INTERPRET_TIMEOUT_MS = Number.parseInt(
  process.env.PF_SEARCH_INTERPRET_TIMEOUT_MS ?? '150000',
  10,
);

class InterpretTimeoutError extends Error {
  constructor(stage: string, ms: number) {
    super(`interpretIcp timed out after ${ms}ms during ${stage}`);
    this.name = 'InterpretTimeoutError';
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, stage: string): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const handle = setTimeout(() => reject(new InterpretTimeoutError(stage, ms)), ms);
    p.then(
      (v) => {
        clearTimeout(handle);
        resolve(v);
      },
      (e) => {
        clearTimeout(handle);
        reject(e);
      },
    );
  });
}

const NAICS_SYSTEM_PROMPT = `You are a precise NAICS / PSC classifier for a B2B lead-search platform. Given a buyer profile, return a tight JSON object with the most relevant NAICS codes, PSC codes (if any apply), and search keywords. Prefer 4-6 digit NAICS. Include 3-6 keywords that would surface the buyer in news/RSS feeds and procurement-portal full-text search. Be honest about scope — if a code is only loosely relevant, drop it.

Return ONLY a JSON object with this exact shape:
{
  "naics_codes": ["236220", "237310"],
  "psc_codes": ["Y1AA"],
  "keywords": ["solar field construction", "utility-scale PV", "EPC contractor"]
}
No prose, no markdown fences, no commentary.`;

interface NaicsJson {
  naics_codes?: unknown;
  psc_codes?: unknown;
  keywords?: unknown;
}

function dedupeStrings(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function safeParseJson(raw: string): NaicsJson | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Strip code-fence wrappers if the model included them despite instructions.
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(stripped);
    if (parsed && typeof parsed === 'object') return parsed as NaicsJson;
  } catch {
    // Try to locate a JSON object substring as a fallback.
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as NaicsJson;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function inferLeadSchema(buyer: string): Record<string, LeadFieldDef> {
  // Default schema is intentionally generic — the front-page surface needs
  // every search to come back with the same baseline fields so the shared
  // lead card renders consistently. Per-vertical fields are added by
  // downstream consumers (the Internal cataloger is already vertical-agnostic).
  return {
    company_name: { type: 'string', required: true, display_label: 'Company' },
    domain: { type: 'string', display_label: 'Website' },
    city: { type: 'string', display_label: 'City' },
    state: { type: 'string', display_label: 'State' },
    naics_primary: { type: 'string', display_label: 'NAICS' },
    signal_type: { type: 'string', display_label: 'Signal', enum_values: ['contract_award', 'rfp', 'news', 'registry', 'license'] },
    signal_summary: { type: 'string', display_label: 'Why' },
    score: { type: 'number', display_label: 'Score' },
    why_now: { type: 'string', display_label: 'Why now' },
    target_buyer_role: { type: 'string', display_label: 'Buyer', enum_values: [buyer || 'decision_maker'] },
  };
}

function scoringSignalsFromProposal(proposal: DecompositionResponse['architecture']): ScoringSignal[] {
  const out: ScoringSignal[] = [];
  // Weight Layer 3 (synthesis) signals slightly above Layer 4 (research).
  for (const a of proposal.layer_3_agents ?? []) {
    out.push({ name: a.role, weight: 0.7, hint: a.instruction.slice(0, 200) });
  }
  for (const a of proposal.layer_4_agents ?? []) {
    out.push({ name: a.role, weight: 0.4, hint: a.instruction.slice(0, 200) });
  }
  // Ensure baseline signals every B2B search needs even when the Architect
  // omits them (so the ranker has something to lean on for thin profiles).
  const baseline: ScoringSignal[] = [
    { name: 'geo_proximity', weight: 0.5, hint: 'How close is the lead to the operator region?' },
    { name: 'signal_recency', weight: 0.5, hint: 'How recent is the public signal?' },
    { name: 'naics_fit', weight: 0.6, hint: 'Does the lead\'s NAICS match the target architecture?' },
  ];
  for (const b of baseline) {
    if (!out.some((s) => s.name === b.name)) out.push(b);
  }
  return out;
}

function fallbackKeywords(icp: string, summary: { lead_type: string; business_area: string } | null): string[] {
  // Cheap keyword fallback: pick capitalized phrases + the two business
  // summary fields. Used when the NAICS classifier call fails or returns
  // empty — we'd rather have weak keywords than no keywords.
  const seeds: string[] = [];
  if (summary) {
    if (summary.lead_type) seeds.push(summary.lead_type);
    if (summary.business_area) seeds.push(summary.business_area);
  }
  // Phrase pulls: two-to-four-word title-case runs in the ICP text.
  const matches = icp.match(/\b([A-Z][a-z]+(?:\s+[A-Za-z]+){1,3})\b/g) ?? [];
  for (const m of matches) seeds.push(m);
  // Verbatim fallback for short prompts.
  if (seeds.length === 0 && icp.trim()) seeds.push(icp.trim().slice(0, 80));
  return dedupeStrings(seeds).slice(0, 6);
}

async function deriveNaicsAndKeywords(args: {
  icp_text: string;
  buyer: string;
  business_area: string;
  problem_solved: string;
  runLlm: (req: LLMRequest) => Promise<LLMResponse>;
}): Promise<{ naics_codes: string[]; psc_codes: string[]; keywords: string[]; cost_usd: number }> {
  const userPrompt = [
    `BUYER: ${args.buyer}`,
    `BUSINESS AREA: ${args.business_area}`,
    `PROBLEM SOLVED: ${args.problem_solved}`,
    '',
    'ICP TEXT:',
    args.icp_text.trim(),
    '',
    'Return the JSON.',
  ].join('\n');
  let res: LLMResponse;
  try {
    res = await withTimeout(
      args.runLlm({
        model: NAICS_MODEL,
        systemPrompt: NAICS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: NAICS_MAX_TOKENS,
        surface: 'architect',
        agentName: 'icp-search-naics',
      }),
      NAICS_TIMEOUT_MS,
      'naics-classifier',
    );
  } catch (err) {
    // Honest degrade: keep the architecture but mark the gap.
    return {
      naics_codes: [],
      psc_codes: [],
      keywords: fallbackKeywords(args.icp_text, {
        lead_type: args.buyer,
        business_area: args.business_area,
      }),
      cost_usd: 0,
    };
  }
  const parsed = safeParseJson(res.content);
  // NAICS lookups against SAM.gov primaryNaics + USAspending recipient_naics
  // need at least a subsector (4 digits). Drop sector-only codes (2-3 digits)
  // so the planner does not emit filters the procurement APIs reject.
  const naics = dedupeStrings(parsed?.naics_codes).filter((c) => /^[0-9]{4,6}$/.test(c)).slice(0, 6);
  const psc = dedupeStrings(parsed?.psc_codes).slice(0, 6);
  const keywordsLlm = dedupeStrings(parsed?.keywords).slice(0, 8);
  const keywords = keywordsLlm.length > 0
    ? keywordsLlm
    : fallbackKeywords(args.icp_text, { lead_type: args.buyer, business_area: args.business_area });
  return {
    naics_codes: naics,
    psc_codes: psc,
    keywords,
    cost_usd: res.usage?.costUsd ?? 0,
  };
}

/**
 * Interpret an operator-typed ICP description into a SearchArchitecture.
 * Wraps the Architect decomposition session and a NAICS/PSC classifier
 * follow-up. Returns the architecture plus telemetry the orchestration job
 * threads into search_runs.progress.
 */
export async function interpretIcp(
  icp_text: string,
  deps: InterpretDeps = {},
): Promise<InterpretResult> {
  const trimmed = (icp_text ?? '').trim();
  if (trimmed.length < MIN_ICP_LENGTH) {
    throw new Error(`interpretIcp: icp_text must be at least ${MIN_ICP_LENGTH} characters`);
  }
  const runDecomposition = deps.runDecomposition ?? runDecompositionLive;
  const llm = deps.runLlm ?? runLlm;
  const newId = deps.newId ?? (() => `icp-search-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  const overallTimeoutMs = deps.timeoutMs ?? DEFAULT_INTERPRET_TIMEOUT_MS;
  const startedAt = Date.now();
  const remaining = (): number => {
    const left = overallTimeoutMs - (Date.now() - startedAt);
    return left > 0 ? left : 1;
  };

  const verticalId = newId();
  const decomp = await withTimeout(
    runDecomposition({
      input: {
        buyer_pain_prompt: trimmed,
        vertical_id: verticalId,
        trigger: 'manual',
      },
    }),
    remaining(),
    'architect-decomposition',
  );

  const proposal = decomp.architecture;
  const business_summary = proposal.business_summary ?? {
    lead_type: proposal.buyer,
    business_area: proposal.buying_signal,
    problem_solved: '',
    what_they_get: '',
  };

  const naics = await withTimeout(
    deriveNaicsAndKeywords({
      icp_text: trimmed,
      buyer: business_summary.lead_type || proposal.buyer,
      business_area: business_summary.business_area || proposal.buying_signal,
      problem_solved: business_summary.problem_solved || '',
      runLlm: llm,
    }),
    remaining(),
    'naics-derivation',
  );

  const architecture: SearchArchitecture = {
    vertical: verticalId,
    lead_schema: inferLeadSchema(business_summary.lead_type || proposal.buyer),
    scoring_signals: scoringSignalsFromProposal(proposal),
    naics_codes: naics.naics_codes,
    psc_codes: naics.psc_codes,
    keywords: naics.keywords,
    business_summary,
  };

  return {
    architecture,
    architect_session_id: decomp.session_id,
    cost_usd: (decomp.cost_usd ?? 0) + naics.cost_usd,
  };
}
