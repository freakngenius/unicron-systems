// lib/adapters/zedcor/pitch-generator.ts
//
// Sprint Z4 — generates three pitch hooks per project via Anthropic Sonnet.
//
// Spec: SPEC-zedcor-z4-cross-pollination-pitch.md §"Component 2".
//
// Each hook = one sentence (max 25 words) tying a Zedcor capability to a
// concrete project attribute. Degrades gracefully:
//   - gc_name present  → GC-focused hooks
//   - gc_name absent   → agency + title-only fallback (still 3 hooks)
//
// Cloud-only. Uses the instrumented anthropic() client so calls land in
// pathfinder.llm_calls with agent_name='zedcor-z4-pitch-generator'.

import { anthropic, setAgentContext } from '@/lib/anthropic';
import type { ZedcorTypeTag } from './type-tag-inferrer';

export interface PitchHooks {
  hook_1: string;
  hook_2: string;
  hook_3: string;
}

export interface PitchGeneratorInput {
  title: string;
  agency: string | null;
  summary?: string | null;
  project_value?: number | null;
  city?: string | null;
  county?: string | null;
  state?: string | null;
  project_stage?: string | null;
  posted_date?: string | null;
  gc_name?: string | null;
  inferred_type_tags: ZedcorTypeTag[];
}

const PITCH_MODEL = process.env.ZEDCOR_PITCH_MODEL ?? 'claude-sonnet-4-6';
const PITCH_TEMPERATURE = 0.7;
const PITCH_MAX_TOKENS = 600;

const ZEDCOR_CATALOG = `Zedcor's catalog:
- Mobile surveillance towers with solar panels (no grid power needed)
- 24/7 remote monitoring service
- Multi-tower deployment across multi-acre or multi-mile sites
- Rapid deployment (24-48 hours from order to on-site)
- Best fit: construction laydown yards, equipment staging, remote sites, linear infrastructure (highways, levees, pipelines), perimeter coverage during overnight/weekend shifts
- Reference projects: NHHIP corridor (11 towers across 4 staging yards), Bayport Terminal expansion (perimeter), Imperial Park demo phase`;

const SYSTEM_PROMPT = `You are a sales-enablement copywriter for Zedcor, a Houston-based mobile surveillance tower company serving construction job sites.

Given a project, write exactly 3 pitch hooks for a Zedcor sales rep to use when contacting the project's GC. Each hook must:
- Be one sentence (max 25 words)
- Reference a specific Zedcor capability (mobile surveillance towers, solar-powered deployment, multi-tower coverage for linear infrastructure, monitoring service, anti-theft for laydown yards)
- Reference a specific project attribute (scope, scale, duration, geography, asset type)
- Be specific enough to feel tailored (not generic "we can help with security")

${ZEDCOR_CATALOG}

Return ONLY valid JSON in this exact shape (no prose around it):
{ "hook_1": "string", "hook_2": "string", "hook_3": "string" }`;

function buildUserPrompt(input: PitchGeneratorInput): string {
  const parts: string[] = [
    `Title: ${input.title}`,
    `Agency: ${input.agency ?? '(unknown)'}`,
  ];
  if (input.summary) parts.push(`Scope summary: ${input.summary}`);
  if (input.project_value != null) parts.push(`Project value: $${Math.round(input.project_value).toLocaleString()}`);
  const loc = [input.city, input.county, input.state].filter(Boolean).join(', ');
  if (loc) parts.push(`Location: ${loc}`);
  if (input.project_stage) parts.push(`Project stage: ${input.project_stage}`);
  if (input.posted_date) parts.push(`Posted: ${input.posted_date}`);
  if (input.gc_name) parts.push(`GC: ${input.gc_name}`);
  else parts.push(`GC: (not yet identified — write hooks against the agency + project type only)`);
  if (input.inferred_type_tags.length > 0) {
    parts.push(`Project type tags: ${input.inferred_type_tags.join(', ')}`);
  }
  parts.push('');
  parts.push('Write the 3 hooks. JSON only.');
  return parts.join('\n');
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  // Fast path: model returned pure JSON.
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through
    }
  }
  // Slow path: extract first {...} block.
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in model output');
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

function validateHooks(parsed: unknown): PitchHooks {
  if (!parsed || typeof parsed !== 'object') throw new Error('Model output is not an object');
  const obj = parsed as Record<string, unknown>;
  const h1 = obj.hook_1;
  const h2 = obj.hook_2;
  const h3 = obj.hook_3;
  if (typeof h1 !== 'string' || typeof h2 !== 'string' || typeof h3 !== 'string') {
    throw new Error('Model output missing hook_1/2/3 string fields');
  }
  const cleaned = (s: string) => s.trim().replace(/\s+/g, ' ');
  return { hook_1: cleaned(h1), hook_2: cleaned(h2), hook_3: cleaned(h3) };
}

export interface GeneratePitchHooksResult {
  hooks: PitchHooks;
  degraded: boolean;        // true when gc_name was missing
  model: string;
  generated_at: string;
}

export async function generatePitchHooks(
  input: PitchGeneratorInput,
  opts?: { agentRunId?: number | null },
): Promise<GeneratePitchHooksResult> {
  const restoreCtx = setAgentContext({
    agentName: 'zedcor-z4-pitch-generator',
    agentRunId: opts?.agentRunId ?? null,
    surface: 'cron',
  });
  try {
    const client = anthropic();
    const userPrompt = buildUserPrompt(input);
    const response = await client.messages.create({
      model: PITCH_MODEL,
      max_tokens: PITCH_MAX_TOKENS,
      temperature: PITCH_TEMPERATURE,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content = response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const parsed = extractJsonObject(content);
    const hooks = validateHooks(parsed);

    return {
      hooks,
      degraded: !input.gc_name,
      model: PITCH_MODEL,
      generated_at: new Date().toISOString(),
    };
  } finally {
    restoreCtx();
  }
}
