// lib/outreach/anthropic-drafter.ts — Demo Polish UX Gate 9C.
//
// Single-email outreach drafter for the v2 lead detail page's "Draft
// recommended outreach" button. Spec: SPEC - Lead Detail Page v2.md §
// "Outreach Drafter LLM contract".
//
// Returns one email draft (subject + body + suggested_recipient_email),
// not the full three-channel bundle the legacy lib/outreach.ts produces
// for the cron-driven Outreach Agent. The legacy drafter remains the
// source of truth for cron-driven multi-channel drafts; this lean v2
// path is invoked on-demand from the lead detail UI.
//
// Cost target: $0.005-0.01 per draft (Anthropic Sonnet 4.6, ~600 tokens
// out, ~800 tokens in). The wrapped `anthropic()` client records the
// call to pathfinder.llm_calls automatically.

import { anthropic, setAgentContext } from '@/lib/anthropic';

export const V2_DRAFTER_MODEL =
  process.env.PF_V2_OUTREACH_MODEL ?? 'claude-sonnet-4-6';

export const V2_DRAFTER_MAX_TOKENS = 800;

export const V2_DRAFTER_SYSTEM_PROMPT = `You are the Pathfinder v2 outreach drafter for Zedcor Security Systems. Compose a single rep-ready email for a verified construction or public-sector lead. The recipient is a busy buyer (project owner, GC, facilities VP, contracting officer).

Voice: technical operator. Plain spoken. No marketing fluff. No "exciting opportunity", no "circling back", no "I hope this finds you well". Reference one specific signal from the lead context (project value, jobsite location, RFP window, named contractor, warm-intro path through an existing customer).

Rules — strict, non-negotiable:

1. Subject line: action-oriented, under 80 characters. No emoji.
2. Body: under 300 words, 2 to 4 paragraphs, conversational. One specific reference up front. Why now. Soft call-to-action proposing a 20-minute call with two concrete time slots OR a single specific question.
3. No em-dashes (U+2014) or en-dashes (U+2013) anywhere. Use periods, commas, semicolons, hyphens.
4. No hallucinated facts. Only reference values, locations, customers, and contractors that appear in the context block. If the contact name is not provided, open with the project reference instead of "Hi [Name]". Never use "Dear there" or placeholder bracketing.
5. No emoji, no exclamation points outside the subject line.
6. Never claim Zedcor has prior work with this prospect unless the warm-intro context block explicitly confirms it.

Output: return ONLY a JSON object with exactly these keys, no surrounding prose, no markdown fences:

{
  "subject": "string under 80 characters",
  "body": "2-4 paragraphs under 300 words",
  "suggested_recipient_email": "best email from the context, or null"
}`;

export interface V2DraftContext {
  project: {
    id: string;
    title: string;
    rationale: string | null;
    project_value: number | null;
    distance_miles: number | null;
    posted_date: string | null;
  };
  branch: {
    name: string | null;
    state: string | null;
  } | null;
  contact: {
    name: string | null;
    role: string | null;
    email: string | null;
  } | null;
  /** Top warm-intro customer reference, if a cross-pollination match
   *  exists for this lead. Used to seed the opening line. */
  warmIntroCustomer: string | null;
}

export interface V2DraftResult {
  subject: string;
  body: string;
  suggested_recipient_email: string | null;
}

export function buildV2DrafterUserPrompt(ctx: V2DraftContext): string {
  const lines: string[] = [];
  lines.push(`PROJECT TITLE: ${ctx.project.title}`);
  lines.push(`PROJECT ID: ${ctx.project.id}`);
  if (ctx.project.project_value != null) {
    lines.push(`PROJECT VALUE: $${ctx.project.project_value.toLocaleString('en-US')}`);
  }
  if (ctx.project.distance_miles != null) {
    lines.push(`DISTANCE TO NEAREST ZEDCOR BRANCH: ${ctx.project.distance_miles.toFixed(1)} mi`);
  }
  if (ctx.branch?.name) {
    lines.push(
      `NEAREST ZEDCOR BRANCH: ${ctx.branch.name}${ctx.branch.state ? ` (${ctx.branch.state})` : ''}`,
    );
  }
  if (ctx.project.posted_date) {
    lines.push(`POSTED: ${ctx.project.posted_date}`);
  }
  if (ctx.warmIntroCustomer) {
    lines.push(`WARM-INTRO CUSTOMER: ${ctx.warmIntroCustomer}`);
  }
  if (ctx.contact?.name) {
    lines.push(
      `RECIPIENT: ${ctx.contact.name}${ctx.contact.role ? ` (${ctx.contact.role})` : ''}${ctx.contact.email ? ` <${ctx.contact.email}>` : ''}`,
    );
  } else {
    lines.push('RECIPIENT: not specified — write generically without a salutation name');
  }
  if (ctx.project.rationale) {
    lines.push('');
    lines.push('RATIONALE (Pathfinder Ranker):');
    lines.push(ctx.project.rationale.trim());
  }
  lines.push('');
  lines.push(
    'Draft a single email per the rules. Return JSON with keys subject, body, suggested_recipient_email.',
  );
  return lines.join('\n');
}

/**
 * Coerce an Anthropic JSON response into the V2DraftResult shape. Tolerates
 * minor formatting variance: leading whitespace, optional ```json fence,
 * trailing prose. Throws on missing required keys or > 80-char subject /
 * > 300-word body so the API surface returns a clean error and the UI can
 * fall back to Custom outreach.
 */
export function parseV2DraftResponse(raw: string): V2DraftResult {
  const trimmed = raw.trim();
  // Strip an optional ```json ... ``` fence.
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const jsonText = fenced ? fenced[1] : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    // Fallback: extract the first {...} blob (handles trailing prose).
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('drafter response was not JSON');
    parsed = JSON.parse(match[0]);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('drafter response was not an object');
  }
  const obj = parsed as Record<string, unknown>;
  const subject = typeof obj.subject === 'string' ? obj.subject.trim() : '';
  const body = typeof obj.body === 'string' ? obj.body.trim() : '';
  const recipientRaw = obj.suggested_recipient_email;
  const recipient =
    typeof recipientRaw === 'string' && recipientRaw.trim().length > 0
      ? recipientRaw.trim()
      : null;
  if (!subject) throw new Error('drafter returned empty subject');
  if (!body) throw new Error('drafter returned empty body');
  if (subject.length > 80) {
    throw new Error(`drafter subject exceeded 80 chars (${subject.length})`);
  }
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  if (wordCount > 300) {
    throw new Error(`drafter body exceeded 300 words (${wordCount})`);
  }
  return { subject, body, suggested_recipient_email: recipient };
}

/**
 * Drive the Anthropic Sonnet call and parse the result. The agent
 * context is set so the wrapped client records the call as
 * `outreach_drafter_v2` in pathfinder.llm_calls.
 */
export async function generateV2Draft(
  ctx: V2DraftContext,
): Promise<V2DraftResult> {
  const reset = setAgentContext({
    agentName: 'outreach_drafter_v2',
    surface: 'manual',
  });
  try {
    const client = anthropic();
    const userPrompt = buildV2DrafterUserPrompt(ctx);
    const response = await client.messages.create({
      model: V2_DRAFTER_MODEL,
      max_tokens: V2_DRAFTER_MAX_TOKENS,
      system: V2_DRAFTER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = response.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return parseV2DraftResponse(text);
  } finally {
    reset();
  }
}
