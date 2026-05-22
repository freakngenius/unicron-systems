// lib/agents/ranker/genericRationale.ts
//
// Funder onboarding Stage 5 — closes the generic-org Sonnet rationale gap.
//
// Until this module shipped, non-Zedcor projects routed by
// app/api/cron/ranker/route.ts:768-845 received a hand-built debug
// string ("Scored by <display_name> weights ... no extractable features")
// in place of the Sonnet rationale + first-step prose Zedcor projects
// got. This closed-gap also serves Realberry (the other non-Zedcor org
// persisted today) — the rationale change for Realberry is *expected*
// and *not* a regression per Build-Spec §3 existing-customer notes;
// flag in REPORT-funder-onboarding.md.
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 5.

import Anthropic from '@anthropic-ai/sdk';
import type { OrgArchitecture } from '@/lib/types/architecture';
import type { Project } from '@/lib/types';

const SONNET_MODEL = 'claude-sonnet-4-5';
const SONNET_MAX_TOKENS = 800;
const BACKOFF_MS = [5_000, 15_000];

export interface GenericRationaleArgs {
  project: Pick<Project, 'id' | 'title' | 'summary' | 'source' | 'raw_payload' | 'project_value' | 'project_stage' | 'posted_date'>;
  architecture: OrgArchitecture;
  scoreComponents: Record<string, number>;
  scoreComposite: number; // 0..100
}

export interface GenericRationaleResult {
  rationale: string;
  first_step: string;
  latency_ms: number;
  reason?: 'rate_limited' | 'parse_failed' | 'sonnet_error' | 'no_api_key';
}

function buildSystemPrompt(arch: OrgArchitecture): string {
  const display = arch.branding.display_name || 'the organization';
  const leadUnit = arch.lead_unit.name; // e.g. "opportunity"
  const business = arch.business_summary;
  const lead_type = business?.lead_type ?? `a fit ${leadUnit}`;
  const what_they_get = business?.what_they_get ?? '';
  const persona = arch.outreach.persona ?? 'business development representative';
  const tone = arch.outreach.tone ?? 'professional';

  return `You are the Pathfinder Ranker rationale-and-hook step for ${display}.

What ${display} is looking for:
${lead_type}

Their internal deliverable that consumes your rationale:
${what_they_get}

Tone you write in: ${tone}. Persona behind first-step recommendations: ${persona}.

You receive ONE candidate ${leadUnit} and the structured feature components the scorer used. Your job is to produce:

1. A 3-sentence rationale grounded in those components. Quote specific values when present. No filler, no hedging, no marketing copy.
2. A single concrete first-step recommendation the ${persona} can take in the next 48 hours. Specific (a person to reach, a public artifact to read, an event to attend). No "research further" or "evaluate fit" boilerplate.

Output format, strict:
RATIONALE: <three sentences>
FIRST_STEP: <one sentence>

No code fence. No prose outside those two lines. No em-dashes.`;
}

function buildUserPayload(args: GenericRationaleArgs): string {
  const payload = (args.project.raw_payload ?? {}) as Record<string, unknown>;
  const compactPayload = Object.fromEntries(
    Object.entries(payload).filter(([k]) =>
      // Surface the qualifier-set context and any first-class enrichment.
      [
        'funder_inferred_thesis',
        'funder_compliance_flag',
        'funder_geo_hub',
        'funder_qualifier_reason',
        'thesis_match',
        'founder_affiliation',
        'city',
        'state',
        'ntee_code',
        'fundraising_stage',
        'raise_target',
        // Internal onboarding Stage 6 — surface Internal context.
        'internal_qualifier_reason',
        'internal_inferred_service_category',
        'internal_sales_motion_signal',
        'internal_federal_registration',
        'internal_association_hint',
        'internal_enrichment',
        'internal_geo',
        'internal_adjacency',
      ].includes(k),
    ),
  );
  return JSON.stringify({
    project: {
      id: args.project.id,
      title: args.project.title,
      summary: args.project.summary,
      source: args.project.source,
      project_value: args.project.project_value,
      project_stage: args.project.project_stage,
      posted_date: args.project.posted_date,
      raw_payload_excerpt: compactPayload,
    },
    score: {
      composite_0_100: args.scoreComposite,
      components_0_1: args.scoreComponents,
      weights_0_1: args.architecture.scoring.weights,
      thresholds_0_1: args.architecture.scoring.thresholds,
    },
  });
}

function parseSonnetOutput(text: string): { rationale: string; first_step: string } {
  const lower = text.toLowerCase();
  const rIdx = lower.search(/rationale\s*:/);
  const fIdx = lower.search(/first[_-]?step\s*:/);
  if (rIdx < 0 || fIdx < 0 || fIdx <= rIdx) {
    return { rationale: stripEmDashes(text.trim()), first_step: '' };
  }
  const rationaleRaw = text.slice(rIdx, fIdx);
  const firstStepRaw = text.slice(fIdx);
  const rationale = stripEmDashes(rationaleRaw.replace(/^\s*[rR]ATIONALE\s*:\s*/, '').trim());
  const first_step = stripEmDashes(firstStepRaw.replace(/^\s*[fF][iI][rR][sS][tT][_-]?[sS][tT][eE][pP]\s*:\s*/, '').trim());
  return { rationale, first_step };
}

function stripEmDashes(s: string): string {
  return s.replace(/—/g, ' ').replace(/\s+/g, ' ').trim();
}

function fallbackRationale(args: GenericRationaleArgs): GenericRationaleResult {
  // Used when ANTHROPIC_API_KEY isn't set (CI / local-only) or Sonnet
  // hard-fails. Strictly better than the original debug string: still
  // surfaces the score + top components in the rationale.
  const components = Object.entries(args.scoreComponents)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([k, v]) => `${k}=${v.toFixed(2)}`);
  const display = args.architecture.branding.display_name || 'the organization';
  const rationale = `Scored ${args.scoreComposite}/100 against ${display}'s weights. Top features: ${components.join(', ') || 'no extractable features'}.`;
  return {
    rationale,
    first_step: '',
    latency_ms: 0,
    reason: 'no_api_key',
  };
}

export async function generateGenericRationale(
  args: GenericRationaleArgs,
): Promise<GenericRationaleResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return fallbackRationale(args);
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const system = buildSystemPrompt(args.architecture);
  const user = buildUserPayload(args);

  for (let attempt = 0; attempt < BACKOFF_MS.length + 1; attempt++) {
    const t0 = Date.now();
    try {
      const res = await client.messages.create({
        model: SONNET_MODEL,
        max_tokens: SONNET_MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: user }],
      });
      const latency_ms = Date.now() - t0;
      const text = res.content
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('')
        .trim();
      const parsed = parseSonnetOutput(text);
      if (!parsed.rationale) {
        return { ...fallbackRationale(args), reason: 'parse_failed', latency_ms };
      }
      return { rationale: parsed.rationale, first_step: parsed.first_step, latency_ms };
    } catch (err: unknown) {
      const status =
        (err as { status?: number }).status ?? (err as { statusCode?: number }).statusCode;
      if (status === 429 && attempt < BACKOFF_MS.length) {
        await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
        continue;
      }
      if (status === 429) {
        return { ...fallbackRationale(args), reason: 'rate_limited' };
      }
      return { ...fallbackRationale(args), reason: 'sonnet_error' };
    }
  }
  return { ...fallbackRationale(args), reason: 'rate_limited' };
}

// Exported for tests.
export { buildSystemPrompt, buildUserPayload, parseSonnetOutput };
