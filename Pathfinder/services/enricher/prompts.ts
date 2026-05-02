// services/enricher/prompts.ts — Demo Polish UX Gate 3C.
//
// System prompts and structured-JSON instructions for the Sonar + Anthropic
// enrichment passes. Each prompt enforces strict JSON-only output with
// explicit "do not hallucinate" / "null when not found" rules.

import type { EnricherInput } from './types';

export const SONAR_SYSTEM = `You are a construction-project research assistant for Pathfinder.
You will be given a public construction or government project and asked to
identify a fixed list of facts using public web sources. Your job is to
return a STRICT JSON object with the requested fields. Rules:

- ONLY output a single JSON object. No prose, no markdown, no code fences.
- Use null when you cannot find a confident answer in the cited sources.
  Never guess. Never fabricate.
- Cite real, public sources. If the only available source is the project
  name itself, return null.
- For dates: ISO-8601 (YYYY-MM-DD). If only year known, use Jan 1 of that year.
- For owner_type, choose ONE of:
    federal_agency | state_agency | municipality | private_developer |
    pe_firm | reit | university | nonprofit | other
- For lot_size_acres: positive numeric, ≤ 10000. Convert sqft to acres
  if the source reports sqft (1 acre = 43,560 sqft). null if not found.
- For key_subs: up to 5 confirmed subcontractors (security / electrical /
  civil / mechanical). Empty array if no subs are publicly named.
- For permit_*: only fill when a permit record is publicly available
  (city or county building permit). Otherwise null.

Output schema (every field required, use null for unknowns):
{
  "owner_name": string | null,
  "owner_type": OwnerType | null,
  "prime_contractor_name": string | null,
  "key_subs": Array<{ "name": string, "role": string | null, "source_url": string | null }>,
  "estimated_start_date": string | null,
  "estimated_end_date": string | null,
  "permit_number": string | null,
  "permit_jurisdiction": string | null,
  "permit_filing_date": string | null,
  "permit_type": string | null,
  "lot_size_acres": number | null
}`;

export function buildSonarUserPrompt(p: EnricherInput): string {
  const knownLines: string[] = [];
  if (p.owner_name) knownLines.push(`- known owner_name: ${p.owner_name}`);
  if (p.prime_contractor_name)
    knownLines.push(`- known prime_contractor_name: ${p.prime_contractor_name}`);
  if (p.location_text) knownLines.push(`- known location: ${p.location_text}`);
  if (p.project_value)
    knownLines.push(`- known project value: $${p.project_value.toLocaleString()}`);
  if (p.estimated_start_date)
    knownLines.push(`- known estimated_start_date: ${p.estimated_start_date}`);
  if (p.naics_code) knownLines.push(`- known naics_code: ${p.naics_code}`);

  const knownBlock = knownLines.length
    ? `\n\nFacts already known (do NOT contradict, only return values for missing fields):\n${knownLines.join('\n')}`
    : '';

  return [
    `Project title: ${p.title}`,
    p.summary ? `Project summary: ${p.summary}` : '',
    p.location_text ? `Place of performance: ${p.location_text}` : '',
    knownBlock,
    '',
    'Task: research this project on the public web and return the JSON object',
    'with every field populated or null. Do NOT include markdown, code fences,',
    'commentary, or anything outside the JSON object.',
  ]
    .filter(Boolean)
    .join('\n');
}

export const ANTHROPIC_SYSTEM = `You are a construction-project taxonomy assistant for Pathfinder.
You will be given a project's title, summary, and any known fields. Your
job is to:

1. Classify the project into the closest 6-digit NAICS code.
2. Produce a 2-3 sentence project description focused on scope, scale,
   and duration.

Rules:
- ONLY output a single JSON object. No prose, no markdown, no code fences.
- naics_code: 6-digit string. If the title is too generic (e.g. just a
  contract number) and confidence < 0.7, return null.
- naics_description: human-readable sector name matching the 6-digit code.
- description_long: 2-3 complete sentences. If input is too thin, return
  the literal string "Insufficient detail in source." Never invent
  facts not present in the input.

Output schema:
{
  "naics_code": string | null,
  "naics_description": string | null,
  "description_long": string | null
}`;

export function buildAnthropicUserPrompt(p: EnricherInput): string {
  const lines: string[] = [
    `Project title: ${p.title}`,
    p.summary ? `Project summary: ${p.summary}` : '',
    p.location_text ? `Place of performance: ${p.location_text}` : '',
    p.owner_name ? `Owner / awarding entity: ${p.owner_name}` : '',
    p.prime_contractor_name ? `Prime contractor: ${p.prime_contractor_name}` : '',
    p.project_value ? `Project value: $${p.project_value.toLocaleString()}` : '',
  ].filter(Boolean);

  const tasks: string[] = [];
  if (p.naics_code == null) tasks.push('Classify into the closest 6-digit NAICS code.');
  if (p.description_long == null) tasks.push('Produce a 2-3 sentence project description.');
  // If both are already populated this path won't be hit (caller checks);
  // include both to keep the schema stable.
  if (tasks.length === 0) {
    tasks.push('Return null for both fields (caller filtered).');
  }

  return [
    ...lines,
    '',
    'Tasks:',
    ...tasks.map((t) => `- ${t}`),
    '',
    'Return ONLY the JSON object.',
  ].join('\n');
}
