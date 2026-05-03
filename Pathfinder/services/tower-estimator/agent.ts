// services/tower-estimator/agent.ts — Demo Polish UX Gate 11E.
//
// Estimates the number of Zedcor mobile surveillance towers required to
// cover a project. Single Anthropic Sonnet call per project; result lands
// in pathfinder.projects.estimated_towers_count + estimated_towers_rationale.
//
// Heuristics baked into the prompt:
//   - 1 tower per ~500 ft of perimeter or ~5 acres of open lot
//   - Linear infrastructure (highways, transit corridors, pipelines):
//     1 tower per 1500 ft of corridor
//   - Multi-site deployments: 1-2 towers per site for after-hours coverage
//   - Round up; return a range string ("25-35") when uncertain
//
// Cost target: ~$0.005-0.01 per call (Sonnet 4.6, ~600 token output).
// The instrumented `anthropic()` client records the call to
// pathfinder.llm_calls automatically (agent_name=tower_estimator).

import { anthropic, setAgentContext } from '@/lib/anthropic';

export const TOWER_ESTIMATOR_MODEL =
  process.env.PF_TOWER_ESTIMATOR_MODEL ?? 'claude-sonnet-4-6';

export const TOWER_ESTIMATOR_MAX_TOKENS = 600;

export const TOWER_ESTIMATOR_SYSTEM_PROMPT = `You are a security-coverage estimator for Zedcor Security Systems. Given a construction or public-sector project, estimate the number of mobile surveillance towers required to cover the site for after-hours perimeter security. Return a STRICT JSON object — no prose, no markdown, no code fences.

Coverage heuristics (apply in order — pick whichever yields the larger number for the project type):

1. Open-lot / single-site projects:
   - 1 tower per ~500 ft of perimeter
   - 1 tower per ~5 acres of open lot
   - Round up. A 12-acre site needs ~3 towers; a 30-acre site needs ~6.

2. Linear infrastructure (highway corridors, transit lines, pipelines, rail):
   - 1 tower per 1500 ft of corridor
   - Plus 1-2 towers per dedicated maintenance / staging yard
   - Example: 14 corridor segments + 6 yards → 14 corridor towers (covering primary segment lengths) + 12 yard towers (2 per yard) = ~26-30 total

3. Multi-site campuses (e.g. multi-building hospitals, university campuses):
   - 1-2 towers per distinct building or site
   - Add 1 tower per parking lot > 2 acres

4. When the project description, value, or scope is ambiguous, return a range string ("25-35") rather than a false-precision number. Range bounds should differ by 30-50% — wider ranges are fine when the upstream data is sparse.

5. NEVER fabricate site counts. If the input lacks a clear scope, weight your estimate toward the project value:
   - Under $1M: 1-3 towers
   - $1M-$10M: 3-10 towers
   - $10M-$50M: 8-25 towers
   - $50M-$200M: 20-60 towers
   - Over $200M: 50-150 towers

Output schema:

{
  "count": "integer or range string like \\"25-35\\"",
  "rationale": "1-2 sentences explaining the inputs you used (perimeter / acres / corridor length / site count / value tier) and the heuristic you applied"
}`;

export interface TowerEstimatorInput {
  project: {
    id: string;
    title: string;
    project_value: number | null;
    description_long?: string | null;
    summary?: string | null;
    naics_code?: string | null;
    naics_description?: string | null;
    lot_size_acres?: number | null;
    location_text?: string | null;
    /** Optional structured signals the caller may pass when known —
     *  bypasses the LLM's need to infer them from prose. */
    sites_count?: number | null;
    perimeter_feet?: number | null;
  };
}

export interface TowerEstimatorResult {
  count: number | string;
  rationale: string;
}

export function buildTowerEstimatorUserPrompt(
  input: TowerEstimatorInput,
): string {
  const { project } = input;
  const lines: string[] = [];
  lines.push(`PROJECT TITLE: ${project.title}`);
  lines.push(`PROJECT ID: ${project.id}`);
  if (project.project_value != null) {
    lines.push(`PROJECT VALUE: $${project.project_value.toLocaleString('en-US')}`);
  }
  if (project.naics_code) {
    lines.push(
      `NAICS: ${project.naics_code}${project.naics_description ? ` — ${project.naics_description}` : ''}`,
    );
  }
  if (project.lot_size_acres != null) {
    lines.push(`LOT SIZE: ${project.lot_size_acres} acres`);
  }
  if (project.location_text) {
    lines.push(`LOCATION: ${project.location_text}`);
  }
  if (project.sites_count != null) {
    lines.push(`SITE COUNT (caller-provided): ${project.sites_count}`);
  }
  if (project.perimeter_feet != null) {
    lines.push(`PERIMETER (caller-provided): ${project.perimeter_feet} ft`);
  }
  if (project.description_long) {
    lines.push('');
    lines.push('PROJECT DESCRIPTION:');
    lines.push(project.description_long.trim());
  } else if (project.summary) {
    lines.push('');
    lines.push('PROJECT SUMMARY:');
    lines.push(project.summary.trim());
  }
  lines.push('');
  lines.push(
    'Return JSON with keys count, rationale per the system prompt heuristics.',
  );
  return lines.join('\n');
}

/**
 * Tolerant JSON parser for the tower-estimator response. Strips an optional
 * ```json fence, then JSON.parse. Falls back to extracting the first
 * `{...}` blob if the LLM appended trailing prose. Throws on missing keys
 * or out-of-band shapes so the caller can degrade to "pending" rather
 * than persist garbage.
 */
export function parseTowerEstimatorResponse(
  raw: string,
): TowerEstimatorResult {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const jsonText = fenced ? fenced[1] : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('tower estimator response was not JSON');
    parsed = JSON.parse(match[0]);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('tower estimator response was not an object');
  }
  const obj = parsed as Record<string, unknown>;
  const rawCount = obj.count;
  const rationale = typeof obj.rationale === 'string' ? obj.rationale.trim() : '';
  if (!rationale) {
    throw new Error('tower estimator returned empty rationale');
  }
  let count: number | string;
  if (typeof rawCount === 'number' && Number.isFinite(rawCount) && rawCount >= 0) {
    count = Math.round(rawCount);
  } else if (typeof rawCount === 'string') {
    const t = rawCount.trim();
    if (!t) throw new Error('tower estimator returned empty count');
    // Accept numeric string ("32"), range ("25-35"), or range with spaces ("25 - 35").
    const numeric = t.match(/^\d+$/);
    if (numeric) {
      count = Number.parseInt(t, 10);
    } else if (/^\d+\s*-\s*\d+$/.test(t)) {
      count = t.replace(/\s/g, '');
    } else {
      throw new Error(`tower estimator returned malformed count: ${t}`);
    }
  } else {
    throw new Error('tower estimator returned non-numeric count');
  }
  return { count, rationale };
}

/**
 * Drive the Anthropic Sonnet call and parse the result. Sets the agent
 * context so `pathfinder.llm_calls` rows record `agent_name=tower_estimator`.
 */
export async function estimateTowers(
  input: TowerEstimatorInput,
): Promise<TowerEstimatorResult> {
  const reset = setAgentContext({
    agentName: 'tower_estimator',
    surface: 'manual',
  });
  try {
    const client = anthropic();
    const userPrompt = buildTowerEstimatorUserPrompt(input);
    const response = await client.messages.create({
      model: TOWER_ESTIMATOR_MODEL,
      max_tokens: TOWER_ESTIMATOR_MAX_TOKENS,
      system: TOWER_ESTIMATOR_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = response.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return parseTowerEstimatorResponse(text);
  } finally {
    reset();
  }
}
