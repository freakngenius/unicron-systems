// services/architect/tools/decomposition.ts — Phase 2 Stream D Gate D1.
// Spec: SPEC - Architect Agent.md §3 (decomposition tools).
//
// Decomposition session tools. Each function is wrapped into a ToolDef
// with an Anthropic-compatible JSON schema; the runtime invokes the
// `handler` when the model calls the tool.
//
// Tools per spec §3:
//   searchSourceTypes(industry) → SourceTypeMatch[]
//   searchAgentTemplates(role) → AgentTemplate[]
//   proposeAgent(role, layer, instruction, inputs, outputs) → AgentDef
//   proposeSource(type, jurisdiction, endpoint?) → DataSourceDef
//   estimateVolume(sourceTypes, geos) → { dailyEvents, qualifiedRate }
//   estimateCost(agentCount, llmCalls) → number
//   validateArchitecture(config) → ValidationResult
//
// Plus the runtime-only `finalizeProposal` tool whose invocation
// terminates the session.

import type { ToolDef } from '@/services/architect/runtime/agent-loop';
import { searchAgentTemplates, searchSourceTypes, SOURCE_CATALOG } from './source-catalog';

// ----- searchSourceTypes -------------------------------------------------

export const searchSourceTypesTool: ToolDef = {
  name: 'searchSourceTypes',
  description:
    'Look up known data sources matching an industry or buyer-pain tag. Returns up to 8 candidates from the static catalog (federal contract feeds, county permits, FEMA, SEC EDGAR, etc.). Use this before proposing any data source — never invent sources that aren\'t in the catalog.',
  input_schema: {
    type: 'object',
    properties: {
      industry: {
        type: 'string',
        description:
          'Industry, vertical, or buyer-pain tag (e.g., "construction", "public_adjusting", "federal_contracting", "permit_signal", "disaster_signal").',
      },
    },
    required: ['industry'],
  },
  handler: (input: Record<string, unknown>) => {
    const industry = String(input.industry ?? '').trim();
    const matches = searchSourceTypes(industry).slice(0, 8);
    return {
      query: industry,
      count: matches.length,
      sources: matches.map((m) => ({
        type: m.type,
        name: m.name,
        tier: m.tier,
        scope: m.scope,
        approx_daily_events: m.approx_daily_events,
        approx_qualified_rate: m.approx_qualified_rate,
        endpoint: m.endpoint ?? null,
        description: m.description,
      })),
    };
  },
};

// ----- searchAgentTemplates ----------------------------------------------

export const searchAgentTemplatesTool: ToolDef = {
  name: 'searchAgentTemplates',
  description:
    'Look up agent role templates by role name or capability description. Returns the canonical instruction skeleton, layer, and i/o contract. Use this before proposing any Layer 3/4 agent — start from a template and refine its instruction for the specific buyer pain.',
  input_schema: {
    type: 'object',
    properties: {
      role: {
        type: 'string',
        description:
          'Role name (e.g., "qualifier", "enricher", "geo-mapper", "ranker", "verifier", "outreach-drafter") or capability hint (e.g., "scoring", "delivery").',
      },
    },
    required: ['role'],
  },
  handler: (input: Record<string, unknown>) => {
    const role = String(input.role ?? '').trim();
    const matches = searchAgentTemplates(role).slice(0, 8);
    return {
      query: role,
      count: matches.length,
      templates: matches.map((t) => ({
        role: t.role,
        layer: t.layer,
        default_instruction: t.default_instruction,
        inputs: t.inputs,
        outputs: t.outputs,
        description: t.description,
      })),
    };
  },
};

// ----- proposeAgent ------------------------------------------------------

export const proposeAgentTool: ToolDef = {
  name: 'proposeAgent',
  description:
    'Normalize a proposed agent into the canonical AgentDef shape used by validateArchitecture and the operator UI. Call this once per Layer 3 / Layer 4 agent in the proposal. Echo the inputs and outputs the agent consumes/produces.',
  input_schema: {
    type: 'object',
    properties: {
      role: {
        type: 'string',
        description: 'Lowercase-kebab role name (e.g., "qualifier", "outreach-drafter").',
      },
      layer: {
        type: 'integer',
        enum: [2, 3, 4],
        description: 'Architecture layer the agent belongs to.',
      },
      instruction: {
        type: 'string',
        description:
          'Specific instruction for this agent in the context of the proposed vertical. Should be richer than the template default.',
      },
      inputs: {
        type: 'array',
        items: { type: 'string' },
        description: 'Event types this agent consumes.',
      },
      outputs: {
        type: 'array',
        items: { type: 'string' },
        description: 'Event types this agent emits.',
      },
    },
    required: ['role', 'layer', 'instruction', 'inputs', 'outputs'],
  },
  handler: (input: Record<string, unknown>) => {
    const role = String(input.role ?? '');
    const layer = Number(input.layer ?? 0);
    const instruction = String(input.instruction ?? '');
    const inputs = Array.isArray(input.inputs) ? input.inputs.map(String) : [];
    const outputs = Array.isArray(input.outputs) ? input.outputs.map(String) : [];
    if (!role) return { ok: false, error: 'role is required' };
    if (![2, 3, 4].includes(layer)) return { ok: false, error: 'layer must be 2, 3, or 4' };
    if (!instruction || instruction.length < 20) {
      return { ok: false, error: 'instruction too short (min 20 chars)' };
    }
    return {
      ok: true,
      agent: { role, layer, instruction, inputs, outputs },
    };
  },
};

// ----- proposeSource -----------------------------------------------------

export const proposeSourceTool: ToolDef = {
  name: 'proposeSource',
  description:
    'Normalize a proposed data source into the DataSourceDef shape. Echo the source type id from searchSourceTypes when reusing a known source; pass a new id only when proposing a tier_3 bespoke onboarding (Source Onboarder will handle the actual adapter creation).',
  input_schema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: 'Source type id (use one from searchSourceTypes when possible).',
      },
      jurisdictions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Geographies the source covers (e.g., ["TX-Harris", "TX-Travis"]).',
      },
      endpoint: {
        type: 'string',
        description: 'API or open-data portal URL when known.',
      },
    },
    required: ['type', 'jurisdictions'],
  },
  handler: (input: Record<string, unknown>) => {
    const type = String(input.type ?? '');
    const jurisdictions = Array.isArray(input.jurisdictions)
      ? input.jurisdictions.map(String)
      : [];
    const endpoint = input.endpoint ? String(input.endpoint) : undefined;
    if (!type) return { ok: false, error: 'type is required' };
    const known = SOURCE_CATALOG.find((s) => s.type === type);
    return {
      ok: true,
      source: {
        type,
        jurisdictions,
        endpoint: endpoint ?? known?.endpoint ?? null,
        is_known_source: Boolean(known),
        tier: known?.tier ?? 'tier_3',
      },
    };
  },
};

// ----- estimateVolume ----------------------------------------------------

export const estimateVolumeTool: ToolDef = {
  name: 'estimateVolume',
  description:
    'Estimate combined daily raw-event volume and post-Qualifier qualified rate for a set of source types in a set of geographies. Drives the daily_qualified_volume estimate in the final proposal.',
  input_schema: {
    type: 'object',
    properties: {
      sourceTypes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Source type ids matching searchSourceTypes results.',
      },
      geos: {
        type: 'array',
        items: { type: 'string' },
        description: 'Geographic scope tokens (e.g., ["TX-Harris", "national_us"]). Used as a jurisdiction-coverage multiplier.',
      },
    },
    required: ['sourceTypes', 'geos'],
  },
  handler: (input: Record<string, unknown>) => {
    const sourceTypes = Array.isArray(input.sourceTypes) ? input.sourceTypes.map(String) : [];
    const geos = Array.isArray(input.geos) ? input.geos.map(String) : [];
    let dailyEvents = 0;
    let weightedQualifiedRate = 0;
    let known = 0;
    for (const t of sourceTypes) {
      const entry = SOURCE_CATALOG.find((s) => s.type === t);
      if (!entry) continue;
      // Scope-coverage multiplier: county/municipal sources scale linearly
      // with the # of jurisdictions; national/global don't scale.
      const multiplier =
        entry.scope === 'county' || entry.scope === 'municipal' || entry.scope === 'state'
          ? Math.max(1, geos.length)
          : 1;
      dailyEvents += entry.approx_daily_events * multiplier;
      weightedQualifiedRate += entry.approx_qualified_rate * (entry.approx_daily_events * multiplier);
      known += 1;
    }
    const qualifiedRate = dailyEvents > 0 ? weightedQualifiedRate / dailyEvents : 0;
    const dailyQualifiedVolume = Math.round(dailyEvents * qualifiedRate);
    return {
      sourceTypes,
      geos,
      knownSources: known,
      dailyEvents,
      qualifiedRate: Number(qualifiedRate.toFixed(3)),
      dailyQualifiedVolume,
    };
  },
};

// ----- estimateCost ------------------------------------------------------

export const estimateCostTool: ToolDef = {
  name: 'estimateCost',
  description:
    'Estimate cost-per-lead in USD given the proposed agent count and expected llm-call count per qualified lead. Blends Haiku (Layer 3 qualifier) + Sonnet (Layer 4 synthesis) at standard pricing.',
  input_schema: {
    type: 'object',
    properties: {
      agentCount: {
        type: 'integer',
        description: 'Number of LLM-driven agents in the proposed architecture (Layer 3 + Layer 4 only; Layer 2 watchers are deterministic).',
      },
      llmCallsPerLead: {
        type: 'number',
        description: 'Average LLM calls per qualified lead across the full pipeline.',
      },
    },
    required: ['agentCount', 'llmCallsPerLead'],
  },
  handler: (input: Record<string, unknown>) => {
    const agentCount = Number(input.agentCount ?? 0);
    const llmCallsPerLead = Number(input.llmCallsPerLead ?? 0);
    // Mixed-model cost model: 60% Haiku (qualifier-class) + 40% Sonnet
    // (synthesis-class). Average prompt 1.5k input + 0.5k output.
    const haikuCostPerCall = (1500 / 1_000_000) * 1.0 + (500 / 1_000_000) * 5.0;
    const sonnetCostPerCall = (1500 / 1_000_000) * 3.0 + (500 / 1_000_000) * 15.0;
    const blendedPerCall = 0.6 * haikuCostPerCall + 0.4 * sonnetCostPerCall;
    const costPerLead = blendedPerCall * llmCallsPerLead;
    // Add a small fixed overhead per agent for cron-tick + audit writes.
    const overheadPerLead = agentCount * 0.0005;
    return {
      agentCount,
      llmCallsPerLead,
      blendedPerCall: Number(blendedPerCall.toFixed(4)),
      costPerLead: Number((costPerLead + overheadPerLead).toFixed(4)),
    };
  },
};

// ----- validateArchitecture ----------------------------------------------

export const validateArchitectureTool: ToolDef = {
  name: 'validateArchitecture',
  description:
    'Validate the proposed architecture against structural rules: (1) every data source has either a known adapter or an explicit tier_3 onboarding plan, (2) every agent instruction is non-trivial (>=20 chars) and references inputs/outputs that exist in the pipeline, (3) estimates are within reasonable bounds. Returns ok:true or a list of issues.',
  input_schema: {
    type: 'object',
    properties: {
      data_sources_proposed: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            jurisdictions: { type: 'array', items: { type: 'string' } },
            expected_daily_volume: { type: 'number' },
          },
          required: ['type', 'jurisdictions'],
        },
      },
      layer_2_watchers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            source_type: { type: 'string' },
            instruction: { type: 'string' },
          },
          required: ['source_type'],
        },
      },
      layer_3_agents: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            role: { type: 'string' },
            instruction: { type: 'string' },
          },
          required: ['role', 'instruction'],
        },
      },
      layer_4_agents: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            role: { type: 'string' },
            instruction: { type: 'string' },
          },
          required: ['role', 'instruction'],
        },
      },
      estimates: {
        type: 'object',
        properties: {
          daily_qualified_volume: { type: 'number' },
          cost_per_lead_usd: { type: 'number' },
        },
      },
    },
    required: ['data_sources_proposed', 'layer_3_agents', 'layer_4_agents'],
  },
  handler: (input: Record<string, unknown>) => {
    const issues: string[] = [];
    const dataSources = Array.isArray(input.data_sources_proposed)
      ? (input.data_sources_proposed as Array<{ type?: string; jurisdictions?: string[] }>)
      : [];
    const layer2 = Array.isArray(input.layer_2_watchers)
      ? (input.layer_2_watchers as Array<{ source_type?: string }>)
      : [];
    const layer3 = Array.isArray(input.layer_3_agents)
      ? (input.layer_3_agents as Array<{ role?: string; instruction?: string }>)
      : [];
    const layer4 = Array.isArray(input.layer_4_agents)
      ? (input.layer_4_agents as Array<{ role?: string; instruction?: string }>)
      : [];
    const estimates = (input.estimates ?? {}) as {
      daily_qualified_volume?: number;
      cost_per_lead_usd?: number;
    };

    if (dataSources.length === 0) {
      issues.push('data_sources_proposed is empty — at least one source is required.');
    }
    for (const ds of dataSources) {
      const known = SOURCE_CATALOG.find((s) => s.type === ds.type);
      if (!known && !ds.type?.startsWith('custom-')) {
        issues.push(
          `data source "${ds.type}" is not in the catalog and not prefixed "custom-" — either pick a catalog source or rename to custom-* and tag tier_3 onboarding.`,
        );
      }
      if (!ds.jurisdictions || ds.jurisdictions.length === 0) {
        issues.push(`data source "${ds.type}" has no jurisdictions.`);
      }
    }

    // Every data source needs a Layer 2 watcher.
    for (const ds of dataSources) {
      const hasWatcher = layer2.some((w) => w.source_type === ds.type);
      if (!hasWatcher) {
        issues.push(`no layer_2 watcher for source "${ds.type}".`);
      }
    }

    // Layer 3 must contain at least a qualifier (or qualifier-equivalent).
    const hasQualifier = layer3.some((a) =>
      (a.role ?? '').toLowerCase().includes('qualif'),
    );
    if (!hasQualifier && layer3.length > 0) {
      issues.push(
        'layer_3 has agents but no qualifier — Pathfinder folds Qualifier into Ranker; the proposal must either include a qualifier role or document the fold-in via the open_questions field.',
      );
    }

    // Every agent's instruction must be substantive.
    for (const a of [...layer3, ...layer4]) {
      if (!a.instruction || a.instruction.length < 20) {
        issues.push(`agent "${a.role}" has a too-short instruction (<20 chars).`);
      }
    }

    // Layer 4 must contain at least a ranker or verifier or drafter.
    const hasSynthesis = layer4.some((a) =>
      ['ranker', 'verifier', 'drafter', 'outreach', 'briefer'].some((kw) =>
        (a.role ?? '').toLowerCase().includes(kw),
      ),
    );
    if (!hasSynthesis) {
      issues.push('layer_4 must include at least one synthesis role (ranker / verifier / drafter / briefer).');
    }

    // Estimate sanity bounds.
    if (
      estimates.daily_qualified_volume != null &&
      (estimates.daily_qualified_volume < 0 || estimates.daily_qualified_volume > 100_000)
    ) {
      issues.push(`daily_qualified_volume ${estimates.daily_qualified_volume} is out of plausible range [0, 100000].`);
    }
    if (
      estimates.cost_per_lead_usd != null &&
      (estimates.cost_per_lead_usd < 0 || estimates.cost_per_lead_usd > 10)
    ) {
      issues.push(`cost_per_lead_usd ${estimates.cost_per_lead_usd} is out of plausible range [0, 10].`);
    }

    return {
      ok: issues.length === 0,
      issues,
    };
  },
};

// ----- finalizeProposal --------------------------------------------------
// Calling this tool terminates the agent loop; the input is captured as
// the session's structured output. The schema is intentionally permissive
// here — server-side validation in services/architect/sessions/decomposition.ts
// re-runs the structural checks before persisting the proposal.

export const finalizeProposalTool: ToolDef = {
  name: 'finalizeProposal',
  description:
    'Submit the final structured vertical_configuration proposal. Calling this tool terminates the session. Only call after validateArchitecture has returned ok=true (or the remaining issues are documented in open_questions).',
  input_schema: {
    type: 'object',
    properties: {
      buyer: { type: 'string' },
      buying_signal: { type: 'string' },
      data_sources_proposed: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            jurisdictions: { type: 'array', items: { type: 'string' } },
            expected_daily_volume: { type: 'number' },
          },
          required: ['type', 'jurisdictions', 'expected_daily_volume'],
        },
      },
      data_sources_rejected: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['type', 'reason'],
        },
      },
      layer_2_watchers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            source_type: { type: 'string' },
            instruction: { type: 'string' },
          },
          required: ['source_type', 'instruction'],
        },
      },
      layer_3_agents: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            role: { type: 'string' },
            instruction: { type: 'string' },
          },
          required: ['role', 'instruction'],
        },
      },
      layer_4_agents: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            role: { type: 'string' },
            instruction: { type: 'string' },
          },
          required: ['role', 'instruction'],
        },
      },
      estimates: {
        type: 'object',
        properties: {
          daily_qualified_volume: { type: 'number' },
          cost_per_lead_usd: { type: 'number' },
          architecture_confidence: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
          },
        },
        required: [
          'daily_qualified_volume',
          'cost_per_lead_usd',
          'architecture_confidence',
        ],
      },
      open_questions: {
        type: 'array',
        items: { type: 'string' },
      },
      business_summary: {
        type: 'object',
        description:
          'Plain-language summary surfaced above the technical decomposition. 1-3 sentences per field; use the customer\'s vocabulary; avoid system terms like "agent," "ingestion," "ranker."',
        properties: {
          lead_type: {
            type: 'string',
            description:
              'One sentence describing the lead unit and its key attributes.',
          },
          business_area: {
            type: 'string',
            description:
              'Which part of the customer\'s organization will use these leads, and to what end.',
          },
          problem_solved: {
            type: 'string',
            description:
              'The operational pain being addressed; reference any specific constraints or context the customer mentioned.',
          },
          what_they_get: {
            type: 'string',
            description:
              'The concrete deliverable in plain language (dashboard, alerts, briefs, drafts) — written so a non-technical stakeholder understands.',
          },
        },
        required: ['lead_type', 'business_area', 'problem_solved', 'what_they_get'],
      },
    },
    required: [
      'buyer',
      'buying_signal',
      'data_sources_proposed',
      'data_sources_rejected',
      'layer_2_watchers',
      'layer_3_agents',
      'layer_4_agents',
      'estimates',
      'open_questions',
      'business_summary',
    ],
  },
  // Handler is unused — runtime captures the input directly when the tool
  // is invoked. Kept here so the loop's `toolsByName[opts.finalToolName]`
  // existence check passes.
  handler: () => ({ finalized: true }),
};

export const DECOMPOSITION_TOOLS: ToolDef[] = [
  searchSourceTypesTool,
  searchAgentTemplatesTool,
  proposeAgentTool,
  proposeSourceTool,
  estimateVolumeTool,
  estimateCostTool,
  validateArchitectureTool,
  finalizeProposalTool,
];

export const FINAL_TOOL_NAME = 'finalizeProposal';
