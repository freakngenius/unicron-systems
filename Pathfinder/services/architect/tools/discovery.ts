// services/architect/tools/discovery.ts — Phase 2 Stream D Gate D3.
// Spec: SPEC - Architect Agent.md §5.
//
// Tools per spec §5:
//   queryRecentSignals(vertical_id, since)   → Signal[]
//   analyzeSourceMentions(signals)           → SourceMentionAnalysis[]
//   searchOpenDataPortals(jurisdiction)      → { url, type, name }[]
//   estimateImpact(sourceCandidate, signals) → { qualifiedLift, confidence }
//   createProposal(...)                      → Proposal (here: createSourceProposal)
//
// Plus runtime-only `finalizeDiscoveryRun` which terminates the session.
//
// All tools are deterministic + cheap. Heavy lifting (the model-side
// reasoning over which jurisdictions matter) happens in the agent
// loop's natural-language thinking.

import type { ToolDef } from '@/services/architect/runtime/agent-loop';
import {
  getSignalStore,
  isKnownSourceType,
  searchPortals,
  type QualifiedSignal,
} from './signal-store';

// ----- queryRecentSignals -----------------------------------------------

export const queryRecentSignalsTool: ToolDef = {
  name: 'queryRecentSignals',
  description:
    'Load qualified signals from the last N days for a vertical. Returns up to 500 most-recent verified projects. Each signal includes title, summary, raw_payload (truncated), source, and ingested_at — the model mines these for jurisdiction / source mentions.',
  input_schema: {
    type: 'object',
    properties: {
      vertical_id: { type: 'string' },
      window_days: { type: 'integer', description: 'Lookback in days; default 30.' },
    },
    required: [],
  },
  handler: async (input: Record<string, unknown>) => {
    const verticalId = String(input.vertical_id ?? 'pathfinder-default');
    const windowDays = Number(input.window_days ?? 30);
    const sinceIso = new Date(Date.now() - windowDays * 86_400_000).toISOString();
    const store = getSignalStore();
    const signals = await store.loadQualifiedSignals(verticalId, sinceIso);
    const watched = await store.loadCurrentlyWatchedSourceTypes(verticalId);
    // Truncate raw_payload to keep tool result size sane for the model.
    const trimmed = signals.map((s) => ({
      project_id: s.project_id,
      source: s.source,
      title: s.title.slice(0, 200),
      summary: s.summary?.slice(0, 400) ?? null,
      raw_payload_keys: s.raw_payload ? Object.keys(s.raw_payload).slice(0, 16) : [],
      lat: s.lat,
      lon: s.lon,
      score: s.score,
      ingested_at: s.ingested_at,
    }));
    return {
      vertical_id: verticalId,
      since: sinceIso,
      total: signals.length,
      currently_watched_source_types: watched,
      signals: trimmed.slice(0, 200),
    };
  },
};

// ----- analyzeSourceMentions --------------------------------------------

interface SourceMentionAnalysis {
  candidate_jurisdiction: string;
  reference_count: number;
  reference_rate: number;       // count / total signals
  meets_15pct_gate: boolean;
  example_titles: string[];
  is_currently_watched: boolean;
}

// Tokens the agent should treat as candidate jurisdictions (kept generic;
// the agent reasons over which ones matter). Implementation passes a
// regex match per candidate-bag entry; returns counts.
const JURISDICTION_HINTS: { token: string; pattern: RegExp }[] = [
  { token: 'TX-Travis', pattern: /\b(travis\s*county|austin,\s*tx|austin tx)\b/i },
  { token: 'TX-Harris', pattern: /\b(harris\s*county|houston,\s*tx)\b/i },
  { token: 'TX-Dallas', pattern: /\b(dallas\s*county|dallas,\s*tx)\b/i },
  { token: 'TX-Bexar', pattern: /\b(bexar\s*county|san\s*antonio)\b/i },
  { token: 'TX-Tarrant', pattern: /\b(tarrant\s*county|fort\s*worth)\b/i },
  { token: 'CA-LA', pattern: /\b(los\s*angeles|la\s*county)\b/i },
  { token: 'CA-Orange', pattern: /\b(orange\s*county,?\s*ca)\b/i },
  { token: 'FL-Miami-Dade', pattern: /\b(miami(-dade)?|miami,?\s*fl)\b/i },
  { token: 'FL-Broward', pattern: /\b(broward\s*county|fort\s*lauderdale)\b/i },
  { token: 'AZ-Maricopa', pattern: /\b(maricopa|phoenix,?\s*az)\b/i },
  { token: 'NY-NYC', pattern: /\b(new\s*york\s*city|nyc|manhattan|brooklyn)\b/i },
  { token: 'IL-Cook', pattern: /\b(cook\s*county|chicago,?\s*il)\b/i },
  { token: 'GA-Fulton', pattern: /\b(fulton\s*county|atlanta,?\s*ga)\b/i },
];

export const analyzeSourceMentionsTool: ToolDef = {
  name: 'analyzeSourceMentions',
  description:
    'Scan signal titles + summaries for jurisdiction mentions and compute reference rates. Flags candidates that meet the 15%+ rate gate (per spec §5). Returns one row per detected jurisdiction with reference_count, reference_rate, currently-watched flag, and example titles.',
  input_schema: {
    type: 'object',
    properties: {
      signals: { type: 'array', description: 'Signals as returned by queryRecentSignals.' },
      currently_watched_source_types: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Source types already onboarded. Used to flag whether a candidate jurisdiction is already covered.',
      },
    },
    required: ['signals'],
  },
  handler: (input: Record<string, unknown>) => {
    const signals = (Array.isArray(input.signals) ? input.signals : []) as QualifiedSignal[];
    const watched = new Set(
      Array.isArray(input.currently_watched_source_types)
        ? input.currently_watched_source_types.map((s) => String(s).toLowerCase())
        : [],
    );
    const total = signals.length;
    const out: SourceMentionAnalysis[] = [];
    for (const hint of JURISDICTION_HINTS) {
      let count = 0;
      const examples: string[] = [];
      for (const s of signals) {
        const blob = `${s.title} ${s.summary ?? ''}`;
        if (hint.pattern.test(blob)) {
          count += 1;
          if (examples.length < 3) examples.push(s.title.slice(0, 120));
        }
      }
      if (count === 0) continue;
      const rate = total === 0 ? 0 : count / total;
      // A jurisdiction is "watched" if any of the watched source types
      // semantically covers it. Match by extracting the geo segment from
      // the source type id (e.g., "harris-county-permits" → "harris")
      // against the jurisdiction token's lowercase segments
      // (e.g., "TX-Harris" → "harris").
      const tokenSegments = hint.token
        .toLowerCase()
        .split(/[-_\s]+/)
        .filter((s) => s.length >= 3);
      const watchedDirect = [...watched].some((w) => {
        const wSegments = w
          .replace(/-county-?permits?$/, '-county')
          .replace(/-permits?$/, '')
          .split(/[-_\s]+/)
          .filter((s) => s.length >= 3);
        return tokenSegments.some((ts) => wSegments.includes(ts));
      });
      out.push({
        candidate_jurisdiction: hint.token,
        reference_count: count,
        reference_rate: Number(rate.toFixed(3)),
        meets_15pct_gate: rate >= 0.15,
        example_titles: examples,
        is_currently_watched: watchedDirect,
      });
    }
    out.sort((a, b) => b.reference_count - a.reference_count);
    return {
      total_signals: total,
      candidate_count: out.length,
      candidates: out,
      candidates_above_gate: out.filter((c) => c.meets_15pct_gate && !c.is_currently_watched),
    };
  },
};

// ----- searchOpenDataPortals --------------------------------------------

export const searchOpenDataPortalsTool: ToolDef = {
  name: 'searchOpenDataPortals',
  description:
    'Look up known open-data portals for a jurisdiction token. Returns concrete URLs and source-type ids. Empty result means no portal is known for that token — the candidate must be skipped (spec §5: "Be specific. Do not invent data sources").',
  input_schema: {
    type: 'object',
    properties: {
      jurisdiction: {
        type: 'string',
        description:
          'Jurisdiction token (e.g., "TX-Travis", "Austin", "CA-LA", "Miami-Dade"). Pattern-matched.',
      },
    },
    required: ['jurisdiction'],
  },
  handler: (input: Record<string, unknown>) => {
    const j = String(input.jurisdiction ?? '');
    const hits = searchPortals(j);
    return {
      query: j,
      count: hits.length,
      portals: hits.map((h) => ({
        url: h.url,
        type: h.type,
        name: h.name,
        tier: h.tier,
        is_known_source: isKnownSourceType(h.type),
      })),
    };
  },
};

// ----- estimateImpact ---------------------------------------------------

export const estimateImpactTool: ToolDef = {
  name: 'estimateImpact',
  description:
    'Estimate daily qualified-lead lift if a candidate source is onboarded. Inputs: reference_rate from analyzeSourceMentions, current vertical daily qualified-volume baseline, and the source\'s expected qualified-rate (typically from the catalog). Returns lift_per_day and confidence (low/medium/high based on sample sufficiency).',
  input_schema: {
    type: 'object',
    properties: {
      candidate_jurisdiction: { type: 'string' },
      reference_rate: {
        type: 'number',
        description: '0..1 — fraction of recent signals that referenced this jurisdiction.',
      },
      current_daily_qualified: {
        type: 'number',
        description: 'Current daily qualified volume across watched sources (ground truth from /api/stats).',
      },
      sample_size: {
        type: 'integer',
        description: 'How many recent signals the reference_rate was computed from.',
      },
      candidate_qualified_rate: {
        type: 'number',
        description: 'Source-catalog qualified_rate for the proposed source type (e.g., 0.15 for permit feeds).',
      },
      candidate_daily_events: {
        type: 'number',
        description: 'Source-catalog approx_daily_events for the proposed source type.',
      },
    },
    required: [
      'candidate_jurisdiction',
      'reference_rate',
      'current_daily_qualified',
      'sample_size',
      'candidate_qualified_rate',
      'candidate_daily_events',
    ],
  },
  handler: (input: Record<string, unknown>) => {
    const referenceRate = Math.max(0, Math.min(1, Number(input.reference_rate ?? 0)));
    const currentDailyQualified = Math.max(0, Number(input.current_daily_qualified ?? 0));
    const sampleSize = Math.max(0, Number(input.sample_size ?? 0));
    const candidateQualifiedRate = Math.max(0, Math.min(1, Number(input.candidate_qualified_rate ?? 0)));
    const candidateDailyEvents = Math.max(0, Number(input.candidate_daily_events ?? 0));

    // Two estimation methods, take the smaller (conservative).
    // (a) reference-rate model: if X% of currently-qualified signals reference
    //     this jurisdiction, an upper-bound on lift is referenceRate ×
    //     currentDailyQualified — events that would surface in this jurisdiction
    //     directly are roughly proportional to that rate.
    const liftA = referenceRate * currentDailyQualified;
    // (b) catalog-volume model: candidateDailyEvents × candidateQualifiedRate.
    const liftB = candidateDailyEvents * candidateQualifiedRate;
    const liftPerDay = Math.max(0, Math.min(liftA, liftB));

    let confidence: 'low' | 'medium' | 'high';
    if (sampleSize >= 100 && referenceRate >= 0.15 && liftPerDay >= 5) confidence = 'high';
    else if (sampleSize >= 30 && referenceRate >= 0.1 && liftPerDay >= 2) confidence = 'medium';
    else confidence = 'low';

    return {
      candidate_jurisdiction: String(input.candidate_jurisdiction),
      lift_per_day: Number(liftPerDay.toFixed(2)),
      lift_method: 'min(reference_rate × current_qualified, catalog_volume × catalog_rate)',
      reference_lift: Number(liftA.toFixed(2)),
      catalog_lift: Number(liftB.toFixed(2)),
      confidence,
      meets_2_per_day_gate: liftPerDay >= 2,
    };
  },
};

// ----- createSourceProposal ---------------------------------------------

export const createSourceProposalTool: ToolDef = {
  name: 'createSourceProposal',
  description:
    'Stage one source_discovery proposal for the Architect Inbox. The orchestrator persists this to architect_proposals after the session finalizes. Conservatism gates re-applied server-side: reference_rate >= 0.15, lift_per_day >= 2, real portal URL present.',
  input_schema: {
    type: 'object',
    properties: {
      headline: { type: 'string' },
      body: { type: 'string' },
      candidate_jurisdiction: { type: 'string' },
      source_type: { type: 'string' },
      source_url: { type: 'string', description: 'Real portal URL — must come from searchOpenDataPortals.' },
      source_name: { type: 'string' },
      tier: { type: 'string', enum: ['tier_1', 'tier_2', 'tier_3'] },
      reference_count: { type: 'integer' },
      reference_rate: { type: 'number' },
      lift_per_day: { type: 'number' },
      confidence: { type: 'number', description: '0..1' },
      reasoning: { type: 'string', description: 'One paragraph justifying the proposal.' },
    },
    required: [
      'headline',
      'candidate_jurisdiction',
      'source_type',
      'source_url',
      'source_name',
      'tier',
      'reference_rate',
      'lift_per_day',
      'confidence',
      'reasoning',
    ],
  },
  handler: (input: Record<string, unknown>) => ({ ok: true, staged: input }),
};

// ----- finalizeDiscoveryRun ---------------------------------------------

export const finalizeDiscoveryRunTool: ToolDef = {
  name: 'finalizeDiscoveryRun',
  description:
    'Submit the final discovery-session summary. Calling this terminates the session.',
  input_schema: {
    type: 'object',
    properties: {
      proposed_count: { type: 'integer' },
      rejected_candidates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            candidate: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['candidate', 'reason'],
        },
      },
      summary: { type: 'string' },
    },
    required: ['proposed_count', 'summary'],
  },
  handler: () => ({ finalized: true }),
};

export const DISCOVERY_TOOLS: ToolDef[] = [
  queryRecentSignalsTool,
  analyzeSourceMentionsTool,
  searchOpenDataPortalsTool,
  estimateImpactTool,
  createSourceProposalTool,
  finalizeDiscoveryRunTool,
];

export const DISCOVERY_FINAL_TOOL_NAME = 'finalizeDiscoveryRun';
export const DISCOVERY_PROPOSAL_TOOL_NAME = 'createSourceProposal';
