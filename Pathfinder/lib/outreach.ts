// lib/outreach.ts — Outreach Drafter library (P0-02).
//
// Purpose: take a verified high-priority project plus its branch / warm-
// intro customer / raw_payload context, and produce a three-channel
// outreach bundle (email + LinkedIn DM + voicemail) that obeys the spec's
// length, tone, and structure rules. Generation is a single Anthropic
// call returning a JSON object; verification runs a deterministic loop
// of pure checks, with up to two re-prompts on failure.
//
// Spec:
//   Pathfinder/Pathfinder-Feature-Specs.md § "P0 Feature 2 — Outreach
//   Drafter" (length / tone / structure rules)
//   Pathfinder/agent-specs/03-computer-outreach.md (behavior, reads, writes)
//
// Module shape mirrors lib/claude.ts (rationale generator):
//   - SYSTEM_PROMPT constant
//   - pure prompt-builder (testable without an Anthropic key)
//   - pure parser (testable)
//   - pure validators (testable, the bulk of the test suite)
//   - one async generator that wires it all together via lib/anthropic.ts
//
// Cloud-only. Never import from lib/scoring.ts (which must stay pure of
// SDK side effects).

import { completeRationale } from '@/lib/anthropic';
import type { Branch, Customer, OutreachChannel, Project } from '@/lib/types';

// ────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────

export const OUTREACH_DRAFTER_MODEL =
  process.env.PF_OUTREACH_MODEL ?? 'claude-sonnet-4-6';

// Output token budget. A full bundle (subject + email body + linkedin +
// voicemail + provenance) is comfortably under 600 tokens; 1200 buys
// headroom for retries that include the prior draft in the prompt.
export const OUTREACH_MAX_TOKENS = 1200;

// Length bands — verbatim from the spec. `email` body 60-90 words,
// linkedin under 200 chars, voicemail 60-80 words (about 25 seconds
// spoken at the conversational rate of ~165 wpm).
export const EMAIL_WORDS_MIN = 60;
export const EMAIL_WORDS_MAX = 90;
export const EMAIL_SUBJECT_CHARS_MAX = 60;
export const LINKEDIN_CHARS_MAX = 200;
export const VOICEMAIL_WORDS_MIN = 60;
export const VOICEMAIL_WORDS_MAX = 80;

// Verifier loop cap. Spec § acceptance: "drafts pass the length and
// tone rules in 90 percent of generations on first try" — two retries
// is the budget before we accept the draft with warnings attached.
export const OUTREACH_MAX_RETRIES = 2;

// System prompt — kept verbatim alongside prompts/outreach-drafter.md.
// If you edit one, edit both.
export const OUTREACH_DRAFTER_SYSTEM_PROMPT = `You are the Pathfinder Outreach Drafter, a security-industry sales operator drafting outreach for Zedcor Security Systems. Your job is to take a verified high-priority public-sector or private construction project and produce three rep-ready outreach assets across email, LinkedIn DM, and voicemail. The reader is a busy buyer (project owner, GC, VP of Facilities). The goal of every draft is to book a twenty minute call before competitors finish their evaluation.

Voice: technical operator. No marketing fluff. No buzzwords. No "exciting opportunity" or "circling back" copy. References a specific project detail or a warm-intro path through an existing customer.

Rules — strict, non-negotiable:

1. Email body 60 to 90 words. Subject under 60 characters. Open with a sentence that references a specific project detail (project value, named contractor, jobsite location, RFP window) OR a warm intro path through an existing customer. Middle one or two sentences explain why now: RFP window, pre-budget timing, recent public signal. Close with a soft call-to-action proposing a twenty minute call with two specific time slot options.
2. LinkedIn DM under 200 characters. Conversational tone. One specific signal. One light ask.
3. Voicemail script 60 to 80 words (about 25 seconds spoken). One clear ask. Natural pauses indicated by sentence breaks. No reading off bullet points.
4. No em-dashes (U+2014) and no en-dashes (U+2013) in any channel copy. Use periods, commas, semicolons, or parentheses for breaks. Hyphens are fine for ranges like 60-90 days.
5. No hallucinated facts. Only reference companies, customers, contractors, project values, and locations that appear in the provided context block. If the warm-intro customer is null in the context, do not mention any existing Zedcor relationship.
6. Never claim Zedcor has worked with the prospect unless the provided customers list confirms a prior engagement.
7. No salutation that requires a name placeholder. If the recipient name is provided, you may use it. If not, open with the project reference instead, never "Hi [Name]" or "Dear there".
8. No emoji, no exclamation points outside the subject line.

Output — return ONLY a JSON object, no surrounding prose, no markdown fences. Shape:

{
  "email": { "subject": "string under 60 characters", "body": "60 to 90 words" },
  "linkedin": { "body": "string under 200 characters" },
  "voicemail": { "body": "60 to 80 words spoken-language script" },
  "provenance": ["projects:<id>", "branches:<id>", "customers:<id-or-omit>"]
}

If the user message includes an "iteration" block (a prior draft plus a specific instruction like "make it tighter" or "open with a question"), treat that draft as the starting point and apply only the requested change. Preserve everything else: the specific reference, the warm intro path, the call-to-action structure.`;

// ────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────

export interface OutreachContact {
  name: string | null;
  title: string | null;
  contact: string | null; // email address, phone, or LinkedIn handle
}

export interface OutreachBundle {
  email: { subject: string; body: string };
  linkedin: { body: string };
  voicemail: { body: string };
  provenance: string[];
}

export interface DraftOutreachArgs {
  project: Pick<
    Project,
    'id' | 'title' | 'summary' | 'project_value' | 'project_stage' | 'distance_miles'
      | 'rationale' | 'outreach_hook' | 'lat' | 'lon' | 'raw_payload'
      | 'warm_for_customer_id' | 'nearest_branch_id'
  >;
  branch: Pick<Branch, 'id' | 'name' | 'code' | 'region'> | null;
  warmCustomer: Pick<Customer, 'id' | 'name'> | null;
  contact: OutreachContact;
  /** Optional iteration instruction. Used by the chat panel to refine
   *  an existing draft via "make it tighter", "open with a question",
   *  etc. Cron-driven first-time drafting passes null. */
  iteration?: { priorBundle: OutreachBundle; instruction: string } | null;
}

/** Outcome of one draftOutreachWithRetry call. `warnings` is empty on a
 *  clean pass; populated when verifier could not get to a fully-clean
 *  bundle in OUTREACH_MAX_RETRIES tries — the bundle is still returned
 *  so the chat panel / cron route can persist it with the warning tags
 *  attached. */
export interface DraftOutreachResult {
  bundle: OutreachBundle;
  warnings: string[];
  attempts: number;
  modelUsed: string;
}

// ────────────────────────────────────────────────────────────────────────
// Pure helpers — exported for testability
// ────────────────────────────────────────────────────────────────────────

const EM_DASH = '—';
const EN_DASH = '–';

/** Count whitespace-separated tokens. Empty string returns 0. */
export function countWords(s: string): number {
  if (!s) return 0;
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Count characters as the model sees them (no normalisation). */
export function countChars(s: string): number {
  return s ? s.length : 0;
}

/** Returns true if the string contains any em-dash or en-dash. */
export function containsDashes(s: string): boolean {
  return s.includes(EM_DASH) || s.includes(EN_DASH);
}

/** Substitute em-dash and en-dash with safer punctuation. Used as a last-
 *  resort safety net after the verifier fails its retries — preferable
 *  to shipping a draft that violates the brand-voice rule. Returns the
 *  cleaned string and a flag indicating whether anything was substituted. */
export function substituteDashes(s: string): { text: string; substituted: boolean } {
  if (!containsDashes(s)) return { text: s, substituted: false };
  const text = s
    .replace(new RegExp(EM_DASH, 'g'), ', ')
    .replace(new RegExp(EN_DASH, 'g'), ' to ');
  return { text, substituted: true };
}

/** Apply substituteDashes across every channel of a bundle. Mutates a
 *  shallow copy and returns it; original is not changed. */
export function substituteDashesInBundle(
  bundle: OutreachBundle,
): { bundle: OutreachBundle; substituted: boolean } {
  const subj = substituteDashes(bundle.email.subject);
  const eb = substituteDashes(bundle.email.body);
  const li = substituteDashes(bundle.linkedin.body);
  const vm = substituteDashes(bundle.voicemail.body);
  const substituted = subj.substituted || eb.substituted || li.substituted || vm.substituted;
  if (!substituted) return { bundle, substituted: false };
  return {
    bundle: {
      email: { subject: subj.text, body: eb.text },
      linkedin: { body: li.text },
      voicemail: { body: vm.text },
      provenance: [...bundle.provenance],
    },
    substituted: true,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Channel validators — return tag arrays. Empty array == passed.
// ────────────────────────────────────────────────────────────────────────

export function validateEmail(subject: string, body: string): string[] {
  const out: string[] = [];
  const subjLen = countChars(subject);
  if (subjLen === 0) out.push('email_subject_empty');
  if (subjLen > EMAIL_SUBJECT_CHARS_MAX) out.push('email_subject_too_long');

  const words = countWords(body);
  if (words < EMAIL_WORDS_MIN) out.push('email_body_too_short');
  if (words > EMAIL_WORDS_MAX) out.push('email_body_too_long');

  if (containsDashes(subject) || containsDashes(body)) out.push('email_contains_dash');

  // Structure check — soft, regex-based heuristic. The spec wants a
  // closing CTA that proposes a 20-minute call with two specific time
  // slots. We look for "20 minute" / "twenty minute" / "20 min" anywhere
  // in the body. Missing this is a warning, not a hard fail — the
  // re-prompt will explicitly nudge the model.
  if (!/(?:\b20\b|\btwenty\b)\s*(?:-?\s*)?(?:minute|min)\b/i.test(body)) {
    out.push('email_missing_20min_cta');
  }

  // Surface name-placeholder leakage. If the model wrote "[Name]" or
  // "Dear there" we want to catch it before persistence.
  if (/\[(?:name|recipient|first[-_ ]?name)\]/i.test(body)) {
    out.push('email_name_placeholder_leak');
  }
  if (/\bdear there\b/i.test(body)) {
    out.push('email_generic_salutation');
  }

  return out;
}

export function validateLinkedIn(body: string): string[] {
  const out: string[] = [];
  const len = countChars(body);
  if (len === 0) out.push('linkedin_empty');
  if (len > LINKEDIN_CHARS_MAX) out.push('linkedin_too_long');
  if (containsDashes(body)) out.push('linkedin_contains_dash');
  if (/\[(?:name|recipient|first[-_ ]?name)\]/i.test(body)) {
    out.push('linkedin_name_placeholder_leak');
  }
  return out;
}

export function validateVoicemail(body: string): string[] {
  const out: string[] = [];
  const words = countWords(body);
  if (words === 0) out.push('voicemail_empty');
  if (words < VOICEMAIL_WORDS_MIN) out.push('voicemail_too_short');
  if (words > VOICEMAIL_WORDS_MAX) out.push('voicemail_too_long');
  if (containsDashes(body)) out.push('voicemail_contains_dash');
  if (/\[(?:name|recipient|first[-_ ]?name)\]/i.test(body)) {
    out.push('voicemail_name_placeholder_leak');
  }
  return out;
}

/** Hallucination check: flag if the bundle mentions a customer name that
 *  is not in `allowedCustomerNames`. Mirrors the verifier route's
 *  customer-reference check, but applied to the outreach copy. Empty
 *  result == clean. */
export function validateNoHallucinatedCustomers(
  bundle: OutreachBundle,
  allowedCustomerNames: string[],
): string[] {
  const allowed = new Set(allowedCustomerNames.map((n) => n.toLowerCase()));
  const text = [
    bundle.email.subject,
    bundle.email.body,
    bundle.linkedin.body,
    bundle.voicemail.body,
  ].join('\n');

  const out: string[] = [];
  // Match capitalized multi-word spans ending in a corporate suffix —
  // the same pattern the verifier route uses.
  const customerRe =
    /\b((?:[A-Z][a-zA-Z&'\-]+(?:\s+[A-Z][a-zA-Z&'\-]+){0,3})\s+(?:Inc|LLC|L\.L\.C\.|Corp|Corporation|Co|Company|Builders|Group|Partners|Holdings|Industries|Construction)\b\.?)/g;

  for (const m of text.matchAll(customerRe)) {
    const name = m[1].trim().toLowerCase();
    if (!allowed.has(name) && !out.includes('outreach_unknown_customer_reference')) {
      out.push('outreach_unknown_customer_reference');
    }
  }
  return out;
}

/** Single entrypoint for the verifier — runs every channel check and the
 *  hallucination check, returns the aggregate warning tag list. The cron
 *  route persists this list verbatim into outreach_drafts.verifier_warnings. */
export function validateBundle(
  bundle: OutreachBundle,
  args: { allowedCustomerNames: string[] },
): string[] {
  return [
    ...validateEmail(bundle.email.subject, bundle.email.body),
    ...validateLinkedIn(bundle.linkedin.body),
    ...validateVoicemail(bundle.voicemail.body),
    ...validateNoHallucinatedCustomers(bundle, args.allowedCustomerNames),
  ];
}

// ────────────────────────────────────────────────────────────────────────
// Recipient extraction (from raw_payload)
// ────────────────────────────────────────────────────────────────────────

/** Pull recipient_name / title / contact from raw_payload, falling back
 *  to nulls. USAspending and SAM.gov use different shapes; we try the
 *  common keys for each and otherwise return nulls. The drafter never
 *  fabricates a name — null cleanly tells the prompt to open with the
 *  project reference instead. */
export function extractContactFromRawPayload(
  raw: Record<string, unknown> | null,
): OutreachContact {
  if (!raw || typeof raw !== 'object') return { name: null, title: null, contact: null };

  // USAspending v2: top-level recipient_name, recipient_unique_id,
  // primary_place_of_performance.* (location, not contact).
  const recipientName = stringOrNull(raw.recipient_name);

  // SAM.gov: pointOfContact is an array of objects with fullName/title/email.
  let pocName: string | null = null;
  let pocTitle: string | null = null;
  let pocContact: string | null = null;
  const poc = (raw as { pointOfContact?: unknown }).pointOfContact;
  if (Array.isArray(poc) && poc.length > 0 && poc[0] && typeof poc[0] === 'object') {
    const p = poc[0] as Record<string, unknown>;
    pocName = stringOrNull(p.fullName) ?? stringOrNull(p.name);
    pocTitle = stringOrNull(p.title);
    pocContact = stringOrNull(p.email) ?? stringOrNull(p.phone);
  }

  return {
    name: pocName ?? recipientName ?? null,
    title: pocTitle,
    contact: pocContact,
  };
}

function stringOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

// ────────────────────────────────────────────────────────────────────────
// Prompt builder & parser — pure functions, exposed for tests
// ────────────────────────────────────────────────────────────────────────

export function buildOutreachUserPrompt(args: DraftOutreachArgs): string {
  const { project, branch, warmCustomer, contact, iteration } = args;

  const lines: string[] = [];
  lines.push('PROJECT CONTEXT');
  lines.push(`id: ${project.id}`);
  lines.push(`title: ${project.title}`);
  if (project.summary) lines.push(`summary: ${project.summary}`);
  if (project.project_value != null) {
    lines.push(`value: $${project.project_value.toLocaleString()}`);
  }
  if (project.project_stage) lines.push(`stage: ${project.project_stage}`);
  if (project.distance_miles != null) {
    lines.push(`distance to nearest branch: ${project.distance_miles.toFixed(1)} miles`);
  }
  if (project.rationale) lines.push(`rationale: ${project.rationale}`);
  if (project.outreach_hook) lines.push(`existing hook: ${project.outreach_hook}`);

  lines.push('');
  lines.push('BRANCH');
  if (branch) {
    lines.push(`name: ${branch.name} (${branch.code}${branch.region ? `, ${branch.region}` : ''})`);
  } else {
    lines.push('none — project has no nearest branch resolved');
  }

  lines.push('');
  lines.push('WARM-INTRO PATH');
  if (warmCustomer) {
    lines.push(`existing customer: ${warmCustomer.name} (id: ${warmCustomer.id})`);
    lines.push('Use this as the warm-intro path in the email opening if it lands cleanly.');
  } else {
    lines.push('none — do not claim any prior Zedcor relationship in any channel');
  }

  lines.push('');
  lines.push('RECIPIENT');
  lines.push(`name: ${contact.name ?? 'unknown — open with project reference instead'}`);
  if (contact.title) lines.push(`title: ${contact.title}`);
  if (contact.contact) lines.push(`contact: ${contact.contact}`);

  if (iteration) {
    lines.push('');
    lines.push('ITERATION');
    lines.push('Prior bundle (apply the instruction below to this draft):');
    lines.push(JSON.stringify(iteration.priorBundle));
    lines.push(`Instruction: ${iteration.instruction}`);
  }

  lines.push('');
  lines.push('Write the JSON object now, exactly per the output schema in the system prompt.');
  return lines.join('\n');
}

/** Parse the model output into a typed OutreachBundle. Tolerates ```json
 *  code fences. Throws a descriptive error if required fields are
 *  missing — the caller treats a parse failure as a retryable verifier
 *  fault. */
export function parseOutreachOutput(text: string): OutreachBundle {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`outreach JSON parse failed: ${(err as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('outreach JSON parse: not an object');
  }
  const obj = parsed as Record<string, unknown>;
  const email = obj.email as Record<string, unknown> | undefined;
  const linkedin = obj.linkedin as Record<string, unknown> | undefined;
  const voicemail = obj.voicemail as Record<string, unknown> | undefined;
  const provenanceRaw = obj.provenance;

  const subject = typeof email?.subject === 'string' ? email.subject.trim() : '';
  const emailBody = typeof email?.body === 'string' ? email.body.trim() : '';
  const linkedinBody = typeof linkedin?.body === 'string' ? linkedin.body.trim() : '';
  const voicemailBody = typeof voicemail?.body === 'string' ? voicemail.body.trim() : '';

  if (!subject || !emailBody || !linkedinBody || !voicemailBody) {
    throw new Error('outreach JSON parse: missing required channel fields');
  }
  const provenance = Array.isArray(provenanceRaw)
    ? provenanceRaw.filter((p): p is string => typeof p === 'string')
    : [];

  return {
    email: { subject, body: emailBody },
    linkedin: { body: linkedinBody },
    voicemail: { body: voicemailBody },
    provenance,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Pipeline — generation + verifier-loop
// ────────────────────────────────────────────────────────────────────────

/** One Anthropic call. Returns the parsed bundle, or throws on parse/SDK
 *  failure. Pure I/O — does not run validators. */
export async function generateOutreachBundle(
  args: DraftOutreachArgs,
  opts: { model?: string; maxTokens?: number } = {},
): Promise<OutreachBundle> {
  const text = await completeRationale({
    systemPrompt: OUTREACH_DRAFTER_SYSTEM_PROMPT,
    userPrompt: buildOutreachUserPrompt(args),
    model: opts.model ?? OUTREACH_DRAFTER_MODEL,
    maxTokens: opts.maxTokens ?? OUTREACH_MAX_TOKENS,
  });
  return parseOutreachOutput(text);
}

/** Generate-and-verify with up to OUTREACH_MAX_RETRIES re-prompts. On
 *  retry, the prior bundle and the failure tags are passed back in so
 *  the model has explicit context for what to fix.
 *
 *  Final-pass safety net: if the bundle still has dashes after retries,
 *  we substitute them and append "dash_substituted" to warnings. The
 *  spec prefers a clean draft over a strict reject; reps see warnings
 *  in the UI either way. */
export async function draftOutreachWithRetry(
  args: DraftOutreachArgs,
  opts: { allowedCustomerNames: string[]; model?: string } = { allowedCustomerNames: [] },
): Promise<DraftOutreachResult> {
  const model = opts.model ?? OUTREACH_DRAFTER_MODEL;
  let attempts = 0;
  let bundle: OutreachBundle | null = null;
  let warnings: string[] = [];
  let lastError: string | null = null;

  let working = args;
  for (let attempt = 0; attempt <= OUTREACH_MAX_RETRIES; attempt++) {
    attempts = attempt + 1;
    try {
      bundle = await generateOutreachBundle(working, { model });
    } catch (err) {
      lastError = (err as Error).message;
      // Treat parse failures as a retryable verifier fault.
      if (attempt === OUTREACH_MAX_RETRIES) {
        throw new Error(`outreach generation failed after ${attempts} attempts: ${lastError}`);
      }
      continue;
    }
    warnings = validateBundle(bundle, { allowedCustomerNames: opts.allowedCustomerNames });
    if (warnings.length === 0) {
      return { bundle, warnings: [], attempts, modelUsed: model };
    }
    if (attempt === OUTREACH_MAX_RETRIES) break;
    // Retry — feed the failing bundle and tag list back in.
    working = {
      ...args,
      iteration: {
        priorBundle: bundle,
        instruction: `The prior draft failed verifier checks: ${warnings.join(', ')}. Fix only those issues. Preserve the specific reference, the warm-intro path if one exists, and the CTA structure.`,
      },
    };
  }

  // Final pass: best-of bundle, run dash substitution as a safety net.
  if (!bundle) {
    throw new Error(`outreach generation failed after ${attempts} attempts: ${lastError ?? 'unknown'}`);
  }
  const sub = substituteDashesInBundle(bundle);
  if (sub.substituted) {
    warnings = warnings
      .filter((w) => !w.endsWith('_contains_dash'))
      .concat('dash_substituted');
    bundle = sub.bundle;
  }
  return { bundle, warnings, attempts, modelUsed: model };
}

// ────────────────────────────────────────────────────────────────────────
// Persistence helpers — emit one row per channel
// ────────────────────────────────────────────────────────────────────────

export interface OutreachDraftInsertRow {
  project_id: string;
  channel: OutreachChannel;
  recipient_name: string | null;
  recipient_title: string | null;
  recipient_contact: string | null;
  draft_subject: string | null;
  draft_body: string;
  warm_intro_via: string | null;
  word_count: number;
  char_count: number;
  verifier_warnings: string[];
  model_used: string;
}

/** Build the three insert rows from a verified bundle. Pure function —
 *  the cron route hands the rows to the supabase client.
 *
 *  The same `warnings` array is attached to every channel row so the chat
 *  UI can surface a single banner per draft set. Per-channel filtering of
 *  irrelevant warnings (e.g., "linkedin_too_long" never lands on the
 *  email row) keeps the audit trail tight without pretending the email
 *  copy passed when its sibling channel didn't. */
export function buildInsertRows(
  args: {
    project: Pick<Project, 'id' | 'warm_for_customer_id'>;
    contact: OutreachContact;
    bundle: OutreachBundle;
    warnings: string[];
    modelUsed: string;
  },
): OutreachDraftInsertRow[] {
  const { project, contact, bundle, warnings, modelUsed } = args;
  const warmId = project.warm_for_customer_id ?? null;
  const filterWarnings = (channel: OutreachChannel) =>
    warnings.filter((w) => {
      if (w === 'dash_substituted') return true;
      if (w === 'outreach_unknown_customer_reference') return true;
      return w.startsWith(`${channel}_`);
    });

  return [
    {
      project_id: project.id,
      channel: 'email',
      recipient_name: contact.name,
      recipient_title: contact.title,
      recipient_contact: contact.contact,
      draft_subject: bundle.email.subject,
      draft_body: bundle.email.body,
      warm_intro_via: warmId,
      word_count: countWords(bundle.email.body),
      char_count: countChars(bundle.email.body),
      verifier_warnings: filterWarnings('email'),
      model_used: modelUsed,
    },
    {
      project_id: project.id,
      channel: 'linkedin',
      recipient_name: contact.name,
      recipient_title: contact.title,
      recipient_contact: contact.contact,
      draft_subject: null,
      draft_body: bundle.linkedin.body,
      warm_intro_via: warmId,
      word_count: countWords(bundle.linkedin.body),
      char_count: countChars(bundle.linkedin.body),
      verifier_warnings: filterWarnings('linkedin'),
      model_used: modelUsed,
    },
    {
      project_id: project.id,
      channel: 'voicemail',
      recipient_name: contact.name,
      recipient_title: contact.title,
      recipient_contact: contact.contact,
      draft_subject: null,
      draft_body: bundle.voicemail.body,
      warm_intro_via: warmId,
      word_count: countWords(bundle.voicemail.body),
      char_count: countChars(bundle.voicemail.body),
      verifier_warnings: filterWarnings('voicemail'),
      model_used: modelUsed,
    },
  ];
}
