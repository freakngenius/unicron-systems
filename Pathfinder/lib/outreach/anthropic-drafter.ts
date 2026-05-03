// lib/outreach/anthropic-drafter.ts — Demo Polish UX Gate 9C, rewritten
// in Gate 12D.
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
// Gate 12D rewrite — diagnosis: the prior prompt told the model to
// "compose a single rep-ready email" and then handed it the lead's
// internal Pathfinder rationale block, with no FROM/TO framing. The
// model defaulted to summarising the rationale in third person, often
// referencing Zedcor as a vendor in the body — the operator perceived
// this as a rationale dump rather than a sales email. The new prompt
// hard-codes the FROM/TO framing (FROM a Zedcor account executive TO
// the named decision-maker), pulls the sender's first name through
// from the connected email account so the sign-off is real, expands
// the ban list to include wellness openers and dashes, and tightens
// the output structure to a 4-paragraph plain-prose ask for a
// 15-minute call.
//
// Cost target: $0.005-0.01 per draft (Anthropic Sonnet 4.6, ~600 tokens
// out, ~800 tokens in). The wrapped `anthropic()` client records the
// call to pathfinder.llm_calls automatically.

import { anthropic, setAgentContext } from '@/lib/anthropic';

export const V2_DRAFTER_MODEL =
  process.env.PF_V2_OUTREACH_MODEL ?? 'claude-sonnet-4-6';

export const V2_DRAFTER_MAX_TOKENS = 800;

export const V2_DRAFTER_SYSTEM_PROMPT = `You are drafting a cold-outreach email FROM a Zedcor account executive TO the named decision-maker at a project owner organization. The goal is to schedule a 15-30 minute call before the project's procurement window closes.

Voice: professional, concise, action-oriented.

NEVER use:
- "I hope this finds you well" or any wellness opener
- Em-dashes (use hyphens or rephrase)
- "Synergy", "leverage", "circle back", "touch base"
- Buzzword salad
- More than 4 paragraphs
- More than 250 words
- Bulleted lists
- Structured "Re: scope" headers (write plain prose)

Required structure:
1. Subject: 6-10 words, action-oriented, references the specific project.
   Example: "TxDOT I-45 perimeter scope - 15-min call?"
2. Greeting: by first name if known, otherwise "Director" or role.
3. Opening (1-2 sentences): identify the project by name + reference
   the procurement timing (RFP deadline, award window, etc.)
4. Middle (1-2 sentences): connect Zedcor's product to the specific
   need on this project. Mobile surveillance towers, perimeter security,
   1/5 the cost of boots-on-ground, multi-site coverage. Reference the
   actual project scope, not generic capabilities.
5. Ask (1 sentence): propose a specific 15-minute conversation. Offer
   2 specific time options or "this week / next week."
6. Sign-off: "Best, <Sender first name>" - derive sender first name from
   their connected email account.

Output JSON: { "subject": string, "body": string, "suggested_recipient_email": string }
- subject <=80 chars
- body <=250 words
- body is plain prose, NOT bulleted lists, NOT structured headers
- suggested_recipient_email = contact.email if provided, else best inference`;

export interface V2DraftSender {
  /** First name parsed from the sender's connected email local-part. */
  firstName: string;
  /** Full email of the connected account (Gmail or Outlook). */
  email: string;
  provider: 'gmail' | 'outlook';
}

export interface V2DraftContext {
  project: {
    id: string;
    title: string;
    rationale: string | null;
    project_value: number | null;
    distance_miles: number | null;
    posted_date: string | null;
    /** Optional procurement deadline (RFP response date, award window). */
    deadline: string | null;
    /** Optional NAICS classification surfaced for the model's framing. */
    naics: string | null;
  };
  branch: {
    name: string | null;
    state: string | null;
  } | null;
  contact: {
    name: string | null;
    role: string | null;
    organization: string | null;
    email: string | null;
  } | null;
  /** Top warm-intro customer reference, if a cross-pollination match
   *  exists for this lead. Used to seed the opening line. */
  warmIntroCustomer: string | null;
  /** Sender identity. When null, the model falls back to "Best,". */
  sender: V2DraftSender | null;
}

export interface V2DraftResult {
  subject: string;
  body: string;
  suggested_recipient_email: string | null;
}

/**
 * Derive a presentable first name from an email local-part. Splits on
 * common separators ("." "_" "-" "+") and capitalises the first token.
 * Returns the input local-part capitalised when no separators are
 * present. Returns "" when the input is empty / not an email.
 */
export function senderFirstNameFromEmail(email: string | null | undefined): string {
  if (!email) return '';
  const local = email.split('@')[0] ?? '';
  if (!local) return '';
  const first = local.split(/[._\-+]/)[0] ?? '';
  if (!first) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function buildV2DrafterUserPrompt(ctx: V2DraftContext): string {
  const lines: string[] = [];

  // Sender identity block — drives the sign-off and the FROM framing.
  lines.push('SENDER (Zedcor account executive — write FROM this person):');
  if (ctx.sender) {
    lines.push(`  First name: ${ctx.sender.firstName}`);
    lines.push(`  Email: ${ctx.sender.email}`);
    lines.push(`  Provider: ${ctx.sender.provider}`);
  } else {
    lines.push('  Not connected — sign off with "Best,"');
  }
  lines.push('');

  // Recipient block — drives the greeting and the TO framing.
  lines.push('RECIPIENT (decision-maker at the project owner — write TO this person):');
  if (ctx.contact?.name) {
    lines.push(`  Full name: ${ctx.contact.name}`);
    if (ctx.contact.role) lines.push(`  Role: ${ctx.contact.role}`);
    if (ctx.contact.organization)
      lines.push(`  Organization: ${ctx.contact.organization}`);
    if (ctx.contact.email) lines.push(`  Email: ${ctx.contact.email}`);
  } else {
    if (ctx.contact?.role) lines.push(`  Role: ${ctx.contact.role}`);
    if (ctx.contact?.organization)
      lines.push(`  Organization: ${ctx.contact.organization}`);
    lines.push('  Name not specified — greet by role (e.g., "Director")');
  }
  lines.push('');

  // Project block — the substance the model should reference.
  lines.push('PROJECT:');
  lines.push(`  Title: ${ctx.project.title}`);
  lines.push(`  ID: ${ctx.project.id}`);
  if (ctx.project.project_value != null) {
    lines.push(
      `  Value: $${ctx.project.project_value.toLocaleString('en-US')}`,
    );
  }
  if (ctx.project.distance_miles != null) {
    lines.push(
      `  Distance to nearest Zedcor branch: ${ctx.project.distance_miles.toFixed(1)} mi`,
    );
  }
  if (ctx.branch?.name) {
    lines.push(
      `  Nearest Zedcor branch: ${ctx.branch.name}${ctx.branch.state ? ` (${ctx.branch.state})` : ''}`,
    );
  }
  if (ctx.project.posted_date) {
    lines.push(`  Posted: ${ctx.project.posted_date}`);
  }
  if (ctx.project.deadline) {
    lines.push(`  Procurement deadline: ${ctx.project.deadline}`);
  }
  if (ctx.project.naics) {
    lines.push(`  NAICS: ${ctx.project.naics}`);
  }
  if (ctx.warmIntroCustomer) {
    lines.push(`  Warm-intro customer reference: ${ctx.warmIntroCustomer}`);
  }
  if (ctx.project.rationale) {
    lines.push('');
    lines.push(
      'INTERNAL RATIONALE (Pathfinder Ranker — for your context only, do NOT quote or paraphrase into the email body):',
    );
    lines.push(ctx.project.rationale.trim());
  }

  lines.push('');
  lines.push(
    'Draft the email per the system prompt. The body must be a real cold-outreach email FROM the sender TO the recipient, not a summary of the internal rationale. Return JSON with keys subject, body, suggested_recipient_email.',
  );
  return lines.join('\n');
}

/**
 * Coerce an Anthropic JSON response into the V2DraftResult shape. Tolerates
 * minor formatting variance: leading whitespace, optional ```json fence,
 * trailing prose. Throws on missing required keys, > 80-char subject,
 * > 250-word body, or em-dash / en-dash characters in the body so the
 * API surface returns a clean error and the UI can fall back to Custom
 * outreach.
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
  if (wordCount > 250) {
    throw new Error(`drafter body exceeded 250 words (${wordCount})`);
  }
  // Gate 12D — ban em-dash / en-dash characters explicitly. The system
  // prompt instructs the model to avoid them, but Sonnet still emits one
  // every ~10 calls; reject so the UI gets a clear error rather than a
  // dash leaking into outreach.
  if (/[–—]/.test(body)) {
    throw new Error('drafter body contained an em-dash or en-dash');
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
