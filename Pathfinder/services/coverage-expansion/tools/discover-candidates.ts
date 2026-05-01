// services/coverage-expansion/tools/discover-candidates.ts
//
// Discovers candidate sources for a coverage goal. Two paths:
//   1. Curated registry — known open-data portal hosts indexed by jurisdiction.
//      For "California permit coverage" we know which portals exist (data.ca.gov,
//      data.lacity.org, data.sfgov.org, etc.). Zero LLM cost.
//   2. Sonar live web search — for the long tail. Sonar returns candidate URLs
//      with citations; we filter to recognized adapter shapes.
//
// The agent calls discover() once per goal; output feeds rankCandidates →
// dispatch.

import { run } from '@/lib/llm/run';
import type { CoverageCandidate, CoverageScopeConstraints } from '../types';

// ----- Curated registry (Phase 2 starter). Expand over time. ---------------

interface RegistryEntry {
  jurisdiction: string;
  portal: string;
  source_types: string[];          // 'permits', 'rfp', 'liens', 'inspections', etc.
  catalog_url?: string;
  resources: { url: string; title: string; types: string[] }[];
}

const REGISTRY: RegistryEntry[] = [
  {
    jurisdiction: 'CA',
    portal: 'data.ca.gov',
    source_types: ['rfp', 'awards', 'permits'],
    catalog_url: 'https://data.ca.gov/api/3/action/package_search?q=permit&rows=20',
    resources: [],
  },
  {
    jurisdiction: 'CA-LA',
    portal: 'data.lacity.org',
    source_types: ['permits', 'inspections'],
    resources: [
      { url: 'https://data.lacity.org/resource/yv23-pmwf.json', title: 'LA Building Permits', types: ['permits'] },
      { url: 'https://data.lacity.org/resource/9w5z-rg2h.json', title: 'LA Construction Inspections', types: ['inspections'] },
    ],
  },
  {
    jurisdiction: 'CA-SF',
    portal: 'data.sfgov.org',
    source_types: ['permits'],
    resources: [
      { url: 'https://data.sfgov.org/resource/i98e-djp9.json', title: 'SF Building Permits', types: ['permits'] },
    ],
  },
  {
    jurisdiction: 'CA-SAC',
    portal: 'data.cityofsacramento.org',
    source_types: ['permits'],
    resources: [
      { url: 'https://data.cityofsacramento.org/resource/abcd-1234.json', title: 'Sacramento Permits', types: ['permits'] },
    ],
  },
  {
    jurisdiction: 'TX',
    portal: 'data.texas.gov',
    source_types: ['rfp', 'permits', 'awards'],
    resources: [],
  },
  {
    jurisdiction: 'TX-AUS',
    portal: 'data.austintexas.gov',
    source_types: ['permits'],
    resources: [
      { url: 'https://data.austintexas.gov/resource/3syk-w9eu.json', title: 'Austin Issued Construction Permits', types: ['permits'] },
    ],
  },
  {
    jurisdiction: 'NY-NYC',
    portal: 'data.cityofnewyork.us',
    source_types: ['permits', 'inspections'],
    resources: [
      { url: 'https://data.cityofnewyork.us/resource/ipu4-2q9a.json', title: 'NYC DOB Job Applications', types: ['permits'] },
    ],
  },
  {
    jurisdiction: 'IL-CHI',
    portal: 'data.cityofchicago.org',
    source_types: ['permits'],
    resources: [
      { url: 'https://data.cityofchicago.org/resource/ydr8-5enu.json', title: 'Chicago Building Permits', types: ['permits'] },
    ],
  },
  {
    jurisdiction: 'WA-SEA',
    portal: 'data.seattle.gov',
    source_types: ['permits'],
    resources: [
      { url: 'https://data.seattle.gov/resource/76t5-zqzr.json', title: 'Seattle Building Permits', types: ['permits'] },
    ],
  },
  {
    jurisdiction: 'federal',
    portal: 'sam.gov',
    source_types: ['rfp', 'awards'],
    resources: [
      { url: 'https://api.sam.gov/opportunities/v2/search', title: 'SAM.gov Opportunities', types: ['rfp'] },
      { url: 'https://api.usaspending.gov/api/v2/search/spending_by_award/', title: 'USAspending Awards', types: ['awards'] },
    ],
  },
];

function matchesGeo(entry: RegistryEntry, geo?: string[]): boolean {
  if (!geo || geo.length === 0) return true;
  return geo.some((g) => entry.jurisdiction === g || entry.jurisdiction.startsWith(`${g}-`) || entry.jurisdiction === 'federal');
}

function matchesType(entry: RegistryEntry, types?: string[]): boolean {
  if (!types || types.length === 0) return true;
  return entry.source_types.some((t) => types.includes(t));
}

export function discoverFromRegistry(constraints: CoverageScopeConstraints): CoverageCandidate[] {
  const out: CoverageCandidate[] = [];
  for (const entry of REGISTRY) {
    if (!matchesGeo(entry, constraints.geography)) continue;
    if (!matchesType(entry, constraints.source_types)) continue;
    for (const r of entry.resources) {
      if (constraints.source_types && !r.types.some((t) => constraints.source_types?.includes(t))) continue;
      out.push({
        candidate_url: r.url,
        candidate_type: 'socrata',
        estimated_impact: defaultImpact(entry.jurisdiction, r.types),
        estimated_tier: 1,
        jurisdiction: entry.jurisdiction,
        notes: r.title,
      });
    }
  }
  return out;
}

function defaultImpact(jurisdiction: string, types: string[]): number {
  // Rough heuristic: federal & top-3 metros = 5 leads/day, mid-metro = 2, smaller = 1.
  const big = ['federal', 'NY-NYC', 'CA-LA', 'IL-CHI', 'TX'];
  const mid = ['CA-SF', 'CA-SAC', 'TX-AUS', 'WA-SEA'];
  const base = big.includes(jurisdiction) ? 5 : mid.includes(jurisdiction) ? 2 : 1;
  // permits + rfp tend to be richer than awards-only or inspections-only.
  const richBoost = types.some((t) => t === 'permits' || t === 'rfp') ? 1.5 : 1;
  return Math.round(base * richBoost * 10) / 10;
}

// ----- Sonar discovery (long tail) ----------------------------------------

const SONAR_PROMPT = `You are helping a sales-intelligence platform discover public open-data sources.
Given a coverage goal, return a JSON array of candidate URLs that look fetchable
(API endpoints, Socrata datasets, RSS feeds, or static JSON dumps). Avoid HTML
landing pages and login walls.

Return ONLY a JSON array of objects:
[{ "url": "...", "type": "socrata|rest|rss|json-dump|unknown", "jurisdiction": "...", "title": "..." }]

Limit to 15 candidates. Do not include URLs you cannot vouch for.`;

export async function discoverViaSonar(goal: string, constraints: CoverageScopeConstraints, sessionId: string): Promise<CoverageCandidate[]> {
  const userPrompt = `Goal: ${goal}\nScope: ${JSON.stringify(constraints)}\n\nReturn candidate sources.`;
  let response;
  try {
    response = await run({
      model: 'sonar',
      systemPrompt: SONAR_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 1500,
      surface: 'architect',
      agentName: 'coverage-expansion',
      sessionId,
      returnCitations: true,
      recencyDays: 90,
    });
  } catch {
    return [];
  }
  const candidates = parseSonarResponse(response.content);
  return candidates;
}

function parseSonarResponse(text: string): CoverageCandidate[] {
  // Try to find a JSON array in the response.
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: CoverageCandidate[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (typeof o.url !== 'string') continue;
    const type = (typeof o.type === 'string' ? o.type : 'unknown') as CoverageCandidate['candidate_type'];
    out.push({
      candidate_url: o.url,
      candidate_type: type,
      estimated_impact: 1,
      estimated_tier: type === 'tier_2' ? 2 : type === 'tier_3' ? 3 : 1,
      jurisdiction: typeof o.jurisdiction === 'string' ? o.jurisdiction : undefined,
      notes: typeof o.title === 'string' ? o.title : undefined,
    });
  }
  return out;
}

// ----- Combined discover --------------------------------------------------

export async function discoverCandidates(args: {
  goal: string;
  constraints: CoverageScopeConstraints;
  sessionId: string;
  useSonar?: boolean;
}): Promise<CoverageCandidate[]> {
  const registry = discoverFromRegistry(args.constraints);
  let sonar: CoverageCandidate[] = [];
  if (args.useSonar !== false && process.env.PERPLEXITY_API_KEY) {
    sonar = await discoverViaSonar(args.goal, args.constraints, args.sessionId);
  }
  const seen = new Set<string>();
  const out: CoverageCandidate[] = [];
  for (const c of [...registry, ...sonar]) {
    if (seen.has(c.candidate_url)) continue;
    seen.add(c.candidate_url);
    out.push(c);
  }
  // Apply max_sources cap if set.
  if (args.constraints.max_sources && out.length > args.constraints.max_sources) {
    return out.slice(0, args.constraints.max_sources);
  }
  return out;
}
