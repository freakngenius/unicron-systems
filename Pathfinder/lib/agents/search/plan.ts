// lib/agents/search/plan.ts — planSources for ICP Saved Search.
//
// SPEC: docs/SPEC-ICP-Search.md (S2 slice).
//
// Builds a SourcePlan in three tiers:
//   tier1: deterministic auto-wire entries (sam.gov + USAspending filtered
//          by NAICS + place-of-performance, plus a news/RSS keyword+region
//          template). Always reachable; always tried.
//   tier2: state-keyed templates for known portals / licensing boards.
//          Limited to a small in-module catalog; absent states yield no
//          tier2 entry rather than fabricated ones.
//   tier3: Perplexity Sonar discoveries. The Sonar call returns a list of
//          candidate sources; each is flagged auto_attempt:true. Parse
//          failures degrade to an empty tier3 rather than throwing — the
//          run still completes on tier1/tier2.
//
// Reuses the existing Perplexity wrapper (`lib/chat/sonar.ts → completeSonar`)
// which delegates to the LLM gateway (`lib/llm/run.ts`). Dependencies are
// injected so unit tests pass deterministic stubs.

import {
  completeSonar as completeSonarLive,
  type SonarRequest,
  type SonarResponse,
} from '@/lib/chat/sonar';
import type {
  GeoExpansion,
  SearchArchitecture,
  SourcePlan,
  Tier1Source,
  Tier2Source,
  Tier3Source,
} from './types';

export interface PlanDeps {
  completeSonar?: (req: SonarRequest) => Promise<SonarResponse>;
  now?: () => Date;
}

export interface PlanSourcesInput {
  architecture: Pick<SearchArchitecture, 'vertical' | 'naics_codes' | 'keywords' | 'business_summary'>;
  geo: Pick<GeoExpansion, 'region' | 'states' | 'radius_mi'>;
}

// Static catalog of state-level licensing boards. Intentionally small — we
// would rather have honest gaps than fabricated URLs. Extend as we onboard
// per-state Tier-2 templates.
const STATE_LICENSING_TEMPLATES: Record<string, { template: string; needs: string[]; candidate_url?: string }> = {
  CA: {
    template: 'state-contractor-license-board',
    needs: ['license_lookup_endpoint', 'naics_to_license_class_map'],
    candidate_url: 'https://www.cslb.ca.gov/onlineservices/checklicenseii/',
  },
  TX: {
    template: 'state-license-portal',
    needs: ['license_lookup_endpoint'],
    candidate_url: 'https://www.tdlr.texas.gov/LicenseSearch/',
  },
  FL: {
    template: 'state-license-portal',
    needs: ['license_lookup_endpoint'],
    candidate_url: 'https://www.myfloridalicense.com/LicenseDetail.asp',
  },
  NY: {
    template: 'state-license-portal',
    needs: ['license_lookup_endpoint'],
    candidate_url: 'https://eservices.dos.ny.gov/publicinquiry/professions/',
  },
  WA: {
    template: 'state-contractor-license-board',
    needs: ['license_lookup_endpoint'],
    candidate_url: 'https://secure.lni.wa.gov/verify/',
  },
  IL: {
    template: 'state-license-portal',
    needs: ['license_lookup_endpoint'],
  },
};

const SONAR_SYSTEM_PROMPT = `You are a sourcing scout. Given a buyer profile + region, list public web sources that publish information about matching companies / signals. Prefer structured sources (registries, open-data portals, RSS feeds, licensing boards, industry trade press). Do NOT list paid-only databases. Do NOT list general-purpose search engines. If you cannot find sources, return an empty array.

Return ONLY a JSON array of objects:
[
  {"name": "short source name", "url": "https://...", "why": "one short sentence on why this surfaces leads"}
]
No prose, no markdown fences, no commentary.`;

const SONAR_MAX_TOKENS = 800;
const SONAR_RECENCY_DAYS = 365;
const TIER3_MAX = 8;

interface Tier3Json {
  name?: unknown;
  url?: unknown;
  why?: unknown;
}

function safeParseTier3(raw: string): Tier3Json[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((p): p is Tier3Json => p != null && typeof p === 'object');
}

function looksLikeUrl(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function buildTier1(input: PlanSourcesInput): Tier1Source[] {
  const out: Tier1Source[] = [];
  const naics = input.architecture.naics_codes;
  const states = input.geo.states;
  const keywords = input.architecture.keywords;

  if (naics.length > 0) {
    for (const code of naics) {
      out.push({
        source_id: `sam_gov_entity:naics_${code}`,
        kind: 'sam_gov_entity',
        params: {
          primaryNaics: code,
          stateOrProvinceCode: states,
        },
        jurisdiction: 'federal',
      });
      out.push({
        source_id: `usaspending_recipients:naics_${code}`,
        kind: 'usaspending_recipients',
        params: {
          recipient_naics: code,
          place_of_performance_state: states,
        },
        jurisdiction: 'federal',
      });
    }
  }

  if (keywords.length > 0) {
    // Google News RSS template — one entry per (keyword, region-aware query).
    // The actual RSS URL is built at wire time by the news adapter; here we
    // just package the search terms.
    const regionTerm = input.geo.region;
    for (const kw of keywords.slice(0, 4)) {
      out.push({
        source_id: `news_rss:${slug(kw)}:${slug(regionTerm)}`,
        kind: 'news_rss',
        params: {
          query: `${kw} ${regionTerm}`,
          keyword: kw,
          region: regionTerm,
          states,
        },
      });
    }
  }

  return out;
}

function buildTier2(input: PlanSourcesInput): Tier2Source[] {
  const out: Tier2Source[] = [];
  for (const state of input.geo.states) {
    const tpl = STATE_LICENSING_TEMPLATES[state];
    if (!tpl) continue;
    out.push({
      source_id: `state_license:${state}`,
      template: tpl.template,
      needs: tpl.needs,
      candidate_url: tpl.candidate_url,
    });
  }
  return out;
}

function summarizeBusiness(architecture: PlanSourcesInput['architecture']): string {
  const bs = architecture.business_summary;
  return [
    bs?.lead_type ? `Buyer: ${bs.lead_type}` : '',
    bs?.business_area ? `Area: ${bs.business_area}` : '',
    bs?.problem_solved ? `Problem: ${bs.problem_solved}` : '',
  ]
    .filter(Boolean)
    .join('. ');
}

async function buildTier3(
  input: PlanSourcesInput,
  deps: PlanDeps,
): Promise<Tier3Source[]> {
  const sonar = deps.completeSonar ?? completeSonarLive;
  const naics = input.architecture.naics_codes.slice(0, 3).join(', ') || 'n/a';
  const keywords = input.architecture.keywords.slice(0, 5).join(', ') || 'n/a';
  const states = input.geo.states.slice(0, 6).join(', ') || 'US';
  const query = [
    summarizeBusiness(input.architecture),
    `NAICS: ${naics}.`,
    `Keywords: ${keywords}.`,
    `Region: ${input.geo.region} (states: ${states}; radius ${input.geo.radius_mi} miles).`,
    '',
    'List up to 8 public web sources that publish information about matching companies or signals in this region. Return the JSON array only.',
  ].join('\n');
  let response: SonarResponse;
  try {
    response = await sonar({
      query,
      systemPrompt: SONAR_SYSTEM_PROMPT,
      maxTokens: SONAR_MAX_TOKENS,
      recencyDays: SONAR_RECENCY_DAYS,
      agentName: 'icp-search-tier3',
    });
  } catch {
    return [];
  }
  const raw = safeParseTier3(response.text ?? '');
  const seen = new Set<string>();
  const out: Tier3Source[] = [];
  for (const entry of raw) {
    const url = looksLikeUrl(entry.url) ? entry.url : null;
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const name = typeof entry.name === 'string' && entry.name.trim()
      ? entry.name.trim()
      : new URL(url).hostname;
    out.push({
      candidate: name,
      url,
      discovered_by: 'perplexity',
      auto_attempt: true,
      reason: typeof entry.why === 'string' && entry.why.trim() ? entry.why.trim() : undefined,
    });
    if (out.length >= TIER3_MAX) break;
  }
  return out;
}

/**
 * Plan the source set for a search. Returns three honest tiers; never
 * fabricates leads or URLs. Callers (S1's job + runSearchPlan below) wire
 * + scrape them in order.
 */
export async function planSources(
  input: PlanSourcesInput,
  deps: PlanDeps = {},
): Promise<SourcePlan> {
  const now = deps.now ?? (() => new Date());
  const tier1 = buildTier1(input);
  const tier2 = buildTier2(input);
  const tier3 = await buildTier3(input, deps);
  return {
    tier1,
    tier2,
    tier3,
    generated_at: now().toISOString(),
  };
}

function slug(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
