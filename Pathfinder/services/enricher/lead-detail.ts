// services/enricher/lead-detail.ts — Demo Polish UX Gate 3C.
//
// Lead-detail enrichment service. For a given project, runs:
//   1. ONE Sonar call (cheap default `sonar` model) returning structured
//      JSON with: owner_type, prime_contractor_name (when null), key_subs,
//      lot_size_acres, permit info (when null), estimated_start/end_date
//      (when null).
//   2. ONE Anthropic Sonnet call returning structured JSON with: naics_code,
//      naics_description, description_long (only when those fields are
//      currently null).
//
// Skips the Sonar call when no Sonar-owned fields are null. Skips the
// Anthropic call when both NAICS and description_long are already filled.
//
// Cost capture: every call routes through `lib/llm/run.ts` which writes to
// `pathfinder.llm_calls`. The service also returns a per-project cost so
// the caller can enforce a hard halt.
//
// JSON parsing: tolerant. Strips code fences, then parses. On parse failure,
// the service returns errors[] — caller decides whether to halt.

import { run } from '@/lib/llm/run';
import {
  ANTHROPIC_SYSTEM,
  buildAnthropicUserPrompt,
  buildSonarUserPrompt,
  SONAR_SYSTEM,
} from './prompts';
import type {
  AnthropicEnrichmentResult,
  EnricherInput,
  EnricherRunResult,
  EnricherUpdate,
  KeySub,
  OwnerType,
  SonarEnrichmentResult,
} from './types';

const SONAR_MODEL = 'sonar';
const ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const SONAR_MAX_TOKENS = 1500;
const ANTHROPIC_MAX_TOKENS = 1000;

const VALID_OWNER_TYPES: OwnerType[] = [
  'federal_agency',
  'state_agency',
  'municipality',
  'private_developer',
  'pe_firm',
  'reit',
  'university',
  'nonprofit',
  'other',
];

function stripCodeFences(s: string): string {
  return s
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function tryParseJson<T>(content: string): T | null {
  try {
    return JSON.parse(stripCodeFences(content)) as T;
  } catch {
    // Best-effort fallback: extract the first {...} block.
    const m = /\{[\s\S]*\}/.exec(content);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}

function asValidOwnerType(v: unknown): OwnerType | null {
  if (typeof v !== 'string') return null;
  return (VALID_OWNER_TYPES as readonly string[]).includes(v)
    ? (v as OwnerType)
    : null;
}

function asValidDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  return m ? m[1]! : null;
}

function asPositiveNumber(v: unknown, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > max) {
    return null;
  }
  return v;
}

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function asKeySubs(v: unknown): KeySub[] | null {
  if (!Array.isArray(v)) return null;
  const out: KeySub[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const name = asNonEmptyString(obj.name);
    if (!name) continue;
    const role = asNonEmptyString(obj.role) ?? undefined;
    const source_url = asNonEmptyString(obj.source_url) ?? undefined;
    out.push({ name, ...(role ? { role } : {}), ...(source_url ? { source_url } : {}) });
    if (out.length >= 5) break;
  }
  return out;
}

function asNaicsCode(v: unknown): string | null {
  const s = asNonEmptyString(v);
  if (!s) return null;
  return /^\d{6}$/.test(s) ? s : null;
}

function sanitizeSonar(raw: unknown): SonarEnrichmentResult {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  return {
    owner_name: asNonEmptyString(r.owner_name),
    owner_type: asValidOwnerType(r.owner_type),
    prime_contractor_name: asNonEmptyString(r.prime_contractor_name),
    key_subs: asKeySubs(r.key_subs),
    estimated_start_date: asValidDate(r.estimated_start_date),
    estimated_end_date: asValidDate(r.estimated_end_date),
    permit_number: asNonEmptyString(r.permit_number),
    permit_jurisdiction: asNonEmptyString(r.permit_jurisdiction),
    permit_filing_date: asValidDate(r.permit_filing_date),
    permit_type: asNonEmptyString(r.permit_type),
    lot_size_acres: asPositiveNumber(r.lot_size_acres, 10000),
  };
}

function sanitizeAnthropic(raw: unknown): AnthropicEnrichmentResult {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  return {
    naics_code: asNaicsCode(r.naics_code),
    naics_description: asNonEmptyString(r.naics_description),
    description_long: asNonEmptyString(r.description_long),
  };
}

// True when the project has at least one Sonar-owned field that is null
// and could plausibly be filled. Skip Sonar when nothing's missing.
function needsSonar(p: EnricherInput): boolean {
  return (
    p.owner_type == null ||
    p.prime_contractor_name == null ||
    p.lot_size_acres == null ||
    p.estimated_start_date == null ||
    p.estimated_end_date == null ||
    (p.permit_type == null && p.source !== 'harris')
  );
}

function needsAnthropic(p: EnricherInput): boolean {
  return p.naics_code == null || p.description_long == null;
}

function applySonar(
  p: EnricherInput,
  sonar: SonarEnrichmentResult,
  upd: EnricherUpdate,
): number {
  let filled = 0;
  if (p.owner_name == null && sonar.owner_name) {
    upd.owner_name = sonar.owner_name;
    filled++;
  }
  if (p.owner_type == null && sonar.owner_type) {
    upd.owner_type = sonar.owner_type;
    filled++;
  }
  if (p.prime_contractor_name == null && sonar.prime_contractor_name) {
    upd.prime_contractor_name = sonar.prime_contractor_name;
    filled++;
  }
  if (sonar.key_subs && sonar.key_subs.length > 0) {
    // Always overwrite key_subs when Sonar returns a non-empty array (the
    // backfill never writes this column so this is safe).
    upd.key_subs = sonar.key_subs;
    filled++;
  } else if (sonar.key_subs && sonar.key_subs.length === 0) {
    // Empty array means "enriched, none found" — record that so the UI
    // can render "No key subs identified" instead of "Not yet enriched".
    upd.key_subs = [];
  }
  if (p.estimated_start_date == null && sonar.estimated_start_date) {
    upd.estimated_start_date = sonar.estimated_start_date;
    filled++;
  }
  if (p.estimated_end_date == null && sonar.estimated_end_date) {
    upd.estimated_end_date = sonar.estimated_end_date;
    filled++;
  }
  if (p.permit_number == null && sonar.permit_number) {
    upd.permit_number = sonar.permit_number;
    filled++;
  }
  if (p.permit_jurisdiction == null && sonar.permit_jurisdiction) {
    upd.permit_jurisdiction = sonar.permit_jurisdiction;
    filled++;
  }
  if (p.permit_filing_date == null && sonar.permit_filing_date) {
    upd.permit_filing_date = sonar.permit_filing_date;
    filled++;
  }
  if (p.permit_type == null && sonar.permit_type) {
    upd.permit_type = sonar.permit_type;
    filled++;
  }
  if (p.lot_size_acres == null && sonar.lot_size_acres != null) {
    upd.lot_size_acres = sonar.lot_size_acres;
    filled++;
  }
  return filled;
}

function applyAnthropic(
  p: EnricherInput,
  ant: AnthropicEnrichmentResult,
  upd: EnricherUpdate,
): number {
  let filled = 0;
  if (p.naics_code == null && ant.naics_code) {
    upd.naics_code = ant.naics_code;
    if (ant.naics_description) upd.naics_description = ant.naics_description;
    filled++;
  } else if (p.naics_description == null && ant.naics_description && p.naics_code) {
    upd.naics_description = ant.naics_description;
  }
  if (p.description_long == null && ant.description_long) {
    upd.description_long = ant.description_long;
    filled++;
  }
  return filled;
}

export async function enrichOneLead(
  p: EnricherInput,
): Promise<EnricherRunResult> {
  const upd: EnricherUpdate = {};
  const errors: string[] = [];
  let cost = 0;
  let sonarFieldsFilled = 0;
  let anthropicFieldsFilled = 0;

  if (needsSonar(p)) {
    try {
      const res = await run({
        model: SONAR_MODEL,
        systemPrompt: SONAR_SYSTEM,
        messages: [{ role: 'user', content: buildSonarUserPrompt(p) }],
        maxTokens: SONAR_MAX_TOKENS,
        surface: 'manual',
        agentName: 'lead_detail_enricher',
        recencyDays: 365,
        returnCitations: true,
      });
      cost += res.usage.costUsd;
      const parsed = tryParseJson<unknown>(res.content);
      if (parsed == null) {
        errors.push(`sonar: failed to parse JSON (${res.content.slice(0, 200)})`);
      } else {
        sonarFieldsFilled = applySonar(p, sanitizeSonar(parsed), upd);
      }
    } catch (err) {
      errors.push(`sonar: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (needsAnthropic(p)) {
    try {
      const res = await run({
        model: ANTHROPIC_MODEL,
        systemPrompt: ANTHROPIC_SYSTEM,
        messages: [{ role: 'user', content: buildAnthropicUserPrompt(p) }],
        maxTokens: ANTHROPIC_MAX_TOKENS,
        surface: 'manual',
        agentName: 'lead_detail_enricher',
      });
      cost += res.usage.costUsd;
      const parsed = tryParseJson<unknown>(res.content);
      if (parsed == null) {
        errors.push(`anthropic: failed to parse JSON (${res.content.slice(0, 200)})`);
      } else {
        anthropicFieldsFilled = applyAnthropic(p, sanitizeAnthropic(parsed), upd);
      }
    } catch (err) {
      errors.push(`anthropic: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Always stamp provenance — even when no fields were filled, we want to
  // record that the enrichment pass happened so the UI can distinguish
  // "never enriched" from "enriched but nothing found."
  if (Object.keys(upd).length > 0 || needsSonar(p) || needsAnthropic(p)) {
    upd.enriched_at = new Date().toISOString();
    upd.enrichment_cost_usd = (p.enrichment_cost_usd ?? 0) + cost;
    const triedSonar = needsSonar(p);
    const triedAnthropic = needsAnthropic(p);
    upd.enrichment_provider =
      triedSonar && triedAnthropic
        ? 'sonar+anthropic'
        : triedSonar
          ? 'sonar'
          : triedAnthropic
            ? 'anthropic'
            : (p.enrichment_provider ?? 'raw_payload_only');
  }

  return {
    projectId: p.id,
    costUsd: cost,
    sonarFieldsFilled,
    anthropicFieldsFilled,
    errors,
    update: upd,
  };
}

export const __test__ = {
  sanitizeSonar,
  sanitizeAnthropic,
  applySonar,
  applyAnthropic,
  needsSonar,
  needsAnthropic,
  tryParseJson,
};
