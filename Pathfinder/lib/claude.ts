// lib/claude.ts — rationale-generation helper (cloud-only).
//
// Composes the user/system prompt for the Ranker's rationale + outreach hook
// and dispatches via Stream 4's `lib/anthropic.ts` wrapper. Stream 4 owns
// the Anthropic SDK init and the streaming API (used by the SSE endpoint at
// `app/api/rationale/[projectId]/route.ts`).
//
// NEVER import this from `lib/scoring.ts`. The scoring module is the
// Phase-2-on-Zedcor's-L4s transplant target and must stay pure.

import { completeRationale } from '@/lib/anthropic';
import type { Branch, Customer, Project } from '@/lib/types';

export const RANKER_SYSTEM_PROMPT = `You are the Pathfinder Ranker, a security-industry analyst writing for a multi-branch field-sales org (Zedcor-shaped: surveillance, perimeter, access control). You write concise, plausible rationale for why a public-data project is worth a salesperson's attention. Voice: technical operator, no filler, no marketing fluff. No anthropomorphic language, no "exciting opportunity"-style copy.

Output format (strict):

RATIONALE:
<paragraph 1: project context — what it is, who's running it, scope signals (size, value, stage)>

<paragraph 2: branch fit — distance to the nearest branch, why this falls in their coverage, what previous work in similar accounts suggests>

<paragraph 3: timing + warm intro — project stage, response window, and (if applicable) the warm-intro path through an existing customer in the area>

OUTREACH:
<one sentence outreach hook the salesperson can paste into a cold email or LinkedIn message>`;

export interface GenerateRationaleArgs {
  project: Pick<
    Project,
    'title' | 'summary' | 'source' | 'project_stage' | 'project_value' | 'distance_miles'
  >;
  branch: Pick<Branch, 'name' | 'code' | 'region'>;
  customer?: Pick<Customer, 'name'> | null;
}

export interface RationaleResult {
  rationale: string;
  outreach_hook: string;
}

/** Build the user-facing prompt block from a project + branch context. Pure
 * function — exposed so the streaming endpoint can reuse the exact same
 * formatting Stream 5's non-streaming helper uses. */
export function buildRationaleUserPrompt(args: GenerateRationaleArgs): string {
  const { project, branch, customer } = args;
  return [
    `PROJECT: ${project.title}`,
    project.summary ? `SUMMARY: ${project.summary}` : null,
    `SOURCE: ${project.source}`,
    `STAGE: ${project.project_stage ?? 'unknown'}`,
    project.project_value != null ? `VALUE: $${project.project_value.toLocaleString()}` : null,
    project.distance_miles != null
      ? `DISTANCE TO NEAREST BRANCH: ${project.distance_miles.toFixed(1)} miles`
      : null,
    `NEAREST BRANCH: ${branch.name} (${branch.code}${branch.region ? `, ${branch.region}` : ''})`,
    customer
      ? `WARM-INTRO PATH: existing customer "${customer.name}" sits in the area but is served by a different branch — surface this as a cross-pollination angle.`
      : null,
    '',
    'Write the rationale and outreach hook now, exactly per the output format.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Non-streaming rationale generation. Returns the parsed rationale + hook.
 * Throws on API failure. Used by the synthetic-projects backfill fallback
 * and by any non-SSE call site (the streaming endpoint Stream 4 owns reads
 * the cached rationale on subsequent opens). */
export async function generateRationale(args: GenerateRationaleArgs): Promise<RationaleResult> {
  const text = await completeRationale({
    systemPrompt: RANKER_SYSTEM_PROMPT,
    userPrompt: buildRationaleUserPrompt(args),
  });
  return parseRationaleOutput(text);
}

/** Split the model output into the rationale paragraphs and the outreach
 * hook. Exposed for testability. */
export function parseRationaleOutput(text: string): RationaleResult {
  const idx = text.search(/\bOUTREACH\s*:/i);
  if (idx < 0) {
    return { rationale: text.trim(), outreach_hook: '' };
  }
  const head = text.slice(0, idx);
  const tail = text.slice(idx);
  const rationale = head.replace(/^\s*RATIONALE\s*:\s*/i, '').trim();
  const outreach_hook = tail.replace(/^\s*OUTREACH\s*:\s*/i, '').trim();
  return { rationale, outreach_hook };
}
