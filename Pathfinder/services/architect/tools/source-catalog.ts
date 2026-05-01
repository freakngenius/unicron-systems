// services/architect/tools/source-catalog.ts — Phase 2 Stream D Gate D1.
// Spec: SPEC - Architect Agent.md §3 (searchSourceTypes tool),
//       SPEC - Source Onboarder Agent.md (Tier 1/2/3 categorization).
//
// Static catalog of known source types with discovery hints. The Architect
// uses this to ground its data_sources_proposed list in real sources rather
// than hallucinating "the construction industry permit registry" etc.
//
// This is a Phase 2 stopgap; the Source Onboarder (Stream E) will eventually
// own a richer catalog backed by the source_adapters table. The Architect
// reads from whichever surface is canonical at any given time.

export interface SourceTypeEntry {
  // Stable canonical id (e.g., 'usaspending', 'sam.gov', 'county-permits').
  type: string;
  // Human-readable name.
  name: string;
  // Industries this source surfaces signals for.
  industries: string[];
  // Buyer pains it's relevant to (free-text tags).
  pain_tags: string[];
  // Tier per Source Onboarder spec. tier_1 = auto-onboardable adapter,
  // tier_2 = templated adapter, tier_3 = bespoke human-assist needed.
  tier: 'tier_1' | 'tier_2' | 'tier_3';
  // Geographic scope.
  scope: 'national_us' | 'state' | 'county' | 'municipal' | 'global';
  // Approximate daily volume of raw events emitted by the source.
  approx_daily_events: number;
  // Approximate qualified-rate (% of raw events that survive Qualifier).
  approx_qualified_rate: number;
  // Open-data portal URL when available; null when none.
  endpoint?: string;
  // One-line description for the Architect's reasoning trace.
  description: string;
}

export const SOURCE_CATALOG: SourceTypeEntry[] = [
  // --- Federal contracting -----------------------------------------------
  {
    type: 'usaspending',
    name: 'USAspending.gov federal contract awards',
    industries: ['federal_contracting', 'construction', 'security', 'logistics', 'staffing'],
    pain_tags: ['federal_award', 'government_spend', 'contract_signal'],
    tier: 'tier_1',
    scope: 'national_us',
    approx_daily_events: 500,
    approx_qualified_rate: 0.04,
    endpoint: 'https://api.usaspending.gov',
    description: 'Federal contract award announcements with recipient + amount + place-of-performance.',
  },
  {
    type: 'sam.gov',
    name: 'SAM.gov contract opportunities',
    industries: ['federal_contracting', 'construction', 'security', 'IT'],
    pain_tags: ['rfp_signal', 'pre_award_pipeline'],
    tier: 'tier_1',
    scope: 'national_us',
    approx_daily_events: 800,
    approx_qualified_rate: 0.03,
    endpoint: 'https://api.sam.gov/opportunities/v2/search',
    description: 'Pre-award solicitations and contract opportunities posted by federal agencies.',
  },
  // --- Construction permits ----------------------------------------------
  {
    type: 'harris-county-permits',
    name: 'Harris County (TX) building permits',
    industries: ['construction', 'security', 'restoration'],
    pain_tags: ['construction_start', 'permit_signal', 'site_security'],
    tier: 'tier_1',
    scope: 'county',
    approx_daily_events: 80,
    approx_qualified_rate: 0.15,
    endpoint: 'https://www.eng.hctx.net/Permits',
    description: 'Building/construction permit issues for Harris County, Texas.',
  },
  {
    type: 'austin-tx-permits',
    name: 'City of Austin building permits',
    industries: ['construction', 'security'],
    pain_tags: ['construction_start', 'permit_signal'],
    tier: 'tier_1',
    scope: 'municipal',
    approx_daily_events: 40,
    approx_qualified_rate: 0.12,
    endpoint: 'https://data.austintexas.gov/dataset/Permits-Issued/3syk-w9eu',
    description: 'Austin, TX building permit issues (Socrata open-data portal).',
  },
  {
    type: 'la-county-permits',
    name: 'Los Angeles County building permits',
    industries: ['construction', 'security', 'restoration'],
    pain_tags: ['construction_start', 'permit_signal'],
    tier: 'tier_2',
    scope: 'county',
    approx_daily_events: 200,
    approx_qualified_rate: 0.1,
    description: 'LA County permits — multiple issuing departments; tier_2 templated adapter needed.',
  },
  // --- Property / public records -----------------------------------------
  {
    type: 'public-property-records',
    name: 'County recorder property transfers',
    industries: ['real_estate', 'restoration', 'insurance', 'public_adjusting'],
    pain_tags: ['ownership_change', 'transaction_signal'],
    tier: 'tier_2',
    scope: 'county',
    approx_daily_events: 300,
    approx_qualified_rate: 0.05,
    description: 'County recorder office property deed and transfer filings.',
  },
  {
    type: 'fema-disaster-declarations',
    name: 'FEMA disaster declarations',
    industries: ['restoration', 'insurance', 'public_adjusting', 'mold_remediation'],
    pain_tags: ['disaster_signal', 'claim_opportunity', 'water_damage'],
    tier: 'tier_1',
    scope: 'national_us',
    approx_daily_events: 5,
    approx_qualified_rate: 0.8,
    endpoint: 'https://www.fema.gov/api/open',
    description: 'Federal disaster declarations triggering insurance claims and restoration demand.',
  },
  // --- Court / legal -----------------------------------------------------
  {
    type: 'pacer-bankruptcy',
    name: 'PACER bankruptcy filings',
    industries: ['credit', 'collections', 'restructuring'],
    pain_tags: ['bankruptcy_signal', 'distress_signal'],
    tier: 'tier_3',
    scope: 'national_us',
    approx_daily_events: 2000,
    approx_qualified_rate: 0.02,
    description: 'PACER federal bankruptcy filings — paywalled API; tier_3 bespoke adapter.',
  },
  {
    type: 'state-court-civil-filings',
    name: 'State civil court filings',
    industries: ['legal', 'collections', 'compliance'],
    pain_tags: ['litigation_signal', 'compliance_signal'],
    tier: 'tier_3',
    scope: 'state',
    approx_daily_events: 500,
    approx_qualified_rate: 0.05,
    description: 'State-level civil court filing aggregators — varies by jurisdiction.',
  },
  // --- Hiring / business signals -----------------------------------------
  {
    type: 'job-postings-aggregated',
    name: 'Aggregated job postings (LinkedIn / Indeed scrape)',
    industries: ['B2B_sales', 'recruiting', 'real_estate'],
    pain_tags: ['hiring_signal', 'expansion_signal', 'role_specific'],
    tier: 'tier_2',
    scope: 'global',
    approx_daily_events: 5000,
    approx_qualified_rate: 0.01,
    description: 'Job posting aggregators — proxy for company growth, hiring intent, role gaps.',
  },
  {
    type: 'business-license-issuances',
    name: 'New business license / DBA filings',
    industries: ['B2B_sales', 'banking', 'insurance'],
    pain_tags: ['new_business_signal', 'startup_signal'],
    tier: 'tier_2',
    scope: 'state',
    approx_daily_events: 300,
    approx_qualified_rate: 0.06,
    description: 'State-level new business filings — proxy for nascent customers.',
  },
  // --- News / web --------------------------------------------------------
  {
    type: 'news-google',
    name: 'Google News (Perplexity Sonar surfaced)',
    industries: ['B2B_sales', 'PR', 'competitive_intel'],
    pain_tags: ['news_signal', 'announcement', 'launch'],
    tier: 'tier_1',
    scope: 'global',
    approx_daily_events: 10000,
    approx_qualified_rate: 0.005,
    description: 'Open-web news; reach via Perplexity Sonar adapter (already in Pathfinder).',
  },
  {
    type: 'sec-edgar',
    name: 'SEC EDGAR filings',
    industries: ['finance', 'M&A', 'PE_back_office', 'compliance'],
    pain_tags: ['acquisition_signal', 'financial_disclosure', 'IPO_signal'],
    tier: 'tier_1',
    scope: 'national_us',
    approx_daily_events: 1500,
    approx_qualified_rate: 0.03,
    endpoint: 'https://data.sec.gov',
    description: 'SEC filings — 10-K, 10-Q, 8-K, S-1 — for finance / M&A / compliance buyers.',
  },
  // --- Industry-specific -------------------------------------------------
  {
    type: 'public-adjuster-licensee-list',
    name: 'State-published public adjuster licensee lists',
    industries: ['public_adjusting', 'insurance'],
    pain_tags: ['licensee_signal', 'practitioner_directory'],
    tier: 'tier_2',
    scope: 'state',
    approx_daily_events: 5,
    approx_qualified_rate: 0.5,
    description: 'State insurance department licensee lists — slow-changing directory of practicing adjusters.',
  },
  {
    type: 'mold-remediation-permits',
    name: 'State environmental permits for mold remediation',
    industries: ['mold_remediation', 'restoration'],
    pain_tags: ['remediation_signal', 'environmental_filing'],
    tier: 'tier_2',
    scope: 'state',
    approx_daily_events: 30,
    approx_qualified_rate: 0.4,
    description: 'State environmental department mold remediation permits and site assessments.',
  },
];

export function searchSourceTypes(industryOrPain: string): SourceTypeEntry[] {
  const q = industryOrPain.toLowerCase().trim();
  if (!q) return [];
  return SOURCE_CATALOG.filter(
    (s) =>
      s.industries.some((i) => q.includes(i) || i.includes(q)) ||
      s.pain_tags.some((p) => q.includes(p) || p.includes(q)) ||
      q.includes(s.type) ||
      s.type.includes(q),
  );
}

export interface AgentTemplate {
  role: string;
  layer: 2 | 3 | 4 | 'center';
  default_instruction: string;
  inputs: string[];
  outputs: string[];
  description: string;
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    role: 'qualifier',
    layer: 3,
    default_instruction:
      'Score the raw event for relevance to the buyer pain. Return {qualified: bool, confidence: 0..1, reason: string}.',
    inputs: ['raw_event.payload'],
    outputs: ['signal.qualified', 'signal.rejected'],
    description:
      'Layer 3 — first-pass relevance gate. Cheap LLM call (Haiku). Filters noise from raw_events.',
  },
  {
    role: 'enricher',
    layer: 3,
    default_instruction:
      'Add structured context to the qualified signal: identify entity, location, transaction value, key actors. Return enriched signal.',
    inputs: ['signal.qualified'],
    outputs: ['signal.enriched'],
    description:
      'Layer 3 — adds structured fields to a qualified signal. Sonnet for entity disambiguation.',
  },
  {
    role: 'geo-mapper',
    layer: 3,
    default_instruction:
      'Map the signal to its geographic context: lat/lon, county, state, nearest customer branch.',
    inputs: ['signal.enriched'],
    outputs: ['signal.geocoded'],
    description: 'Layer 3 — deterministic geocoding + branch-distance computation.',
  },
  {
    role: 'adjacency-mapper',
    layer: 3,
    default_instruction:
      'Identify adjacent entities (sub-contractors, suppliers, neighbors) related to the signal subject.',
    inputs: ['signal.enriched'],
    outputs: ['signal.adjacents'],
    description: 'Layer 3 — surfaces ecosystem context via Sonar web research.',
  },
  {
    role: 'competitive-intel',
    layer: 3,
    default_instruction:
      'Identify which competitors of the buyer are also pursuing this signal subject.',
    inputs: ['signal.enriched'],
    outputs: ['signal.competitive_context'],
    description: 'Layer 3 — Sonar-driven competitor mention scan.',
  },
  {
    role: 'ranker',
    layer: 4,
    default_instruction:
      'Score the synthesized signal 0-100 for prioritization, combining qualification confidence, project value, and proximity.',
    inputs: ['signal.enriched', 'signal.geocoded'],
    outputs: ['decision.scored'],
    description:
      'Layer 4 — produces a score and rationale. Sonnet for explainability.',
  },
  {
    role: 'verifier',
    layer: 4,
    default_instruction:
      'Run independent web research to verify high-priority signals; demote stale or contradicted signals.',
    inputs: ['decision.scored'],
    outputs: ['decision.verified', 'decision.demoted'],
    description: 'Layer 4 — Sonar-driven 2-3 check fact-check pass for top decisions.',
  },
  {
    role: 'outreach-drafter',
    layer: 4,
    default_instruction:
      'Draft 3-channel outreach (email subject + body, Slack one-liner, HubSpot note) for the verified decision.',
    inputs: ['decision.verified'],
    outputs: ['decision.outreach'],
    description: 'Layer 4 — Sonnet for personalized drafting.',
  },
  {
    role: 'briefer',
    layer: 4,
    default_instruction:
      'Aggregate the week\'s verified decisions into a one-page briefing PDF/email for the customer.',
    inputs: ['decision.verified[]'],
    outputs: ['delivery.briefing'],
    description:
      'Layer 4 — weekly briefing synthesis. Reads many; emits one delivery.',
  },
  {
    role: 'personalizer',
    layer: 4,
    default_instruction:
      'Tailor outreach copy to the recipient based on prior interaction history and stated preferences.',
    inputs: ['decision.outreach', 'feedback.customer'],
    outputs: ['decision.personalized_outreach'],
    description: 'Layer 4 — final-mile personalization layer.',
  },
  {
    role: 'delivery-dispatcher',
    layer: 'center',
    default_instruction:
      'Route the synthesized decision to the configured delivery channels (dashboard / email / Slack / HubSpot).',
    inputs: ['decision.outreach'],
    outputs: ['delivery.email', 'delivery.slack', 'delivery.hubspot', 'delivery.dashboard'],
    description: 'Center — channel fan-out per the customer\'s configured delivery surfaces.',
  },
  {
    role: 'watcher',
    layer: 2,
    default_instruction:
      'Poll the data source on schedule, dedupe against raw_events, insert new rows.',
    inputs: ['source.endpoint'],
    outputs: ['raw_events'],
    description:
      'Layer 2 — one watcher per data source. Cheap, deterministic, no LLM.',
  },
];

export function searchAgentTemplates(role: string): AgentTemplate[] {
  const q = role.toLowerCase().trim();
  if (!q) return AGENT_TEMPLATES;
  return AGENT_TEMPLATES.filter(
    (a) => a.role.includes(q) || a.description.toLowerCase().includes(q),
  );
}
