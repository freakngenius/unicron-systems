// lib/chat/outreach-drafter.ts — produces and iterates 3-channel outreach
// bundles for the Intelligence Chat panel.
//
// Spec rules (Pathfinder/Pathfinder-Feature-Specs.md § "Outreach drafting
// principle"):
//   - Email:    60-90 words, subject < 60 chars, one specific reference,
//               one soft CTA proposing a 20-min call
//   - LinkedIn: under 200 chars, conversational, references one signal
//   - Voicemail: ~70 words (25 sec spoken), natural pauses, one ask
//   - All channels: NO em-dashes (—), NO en-dashes (–)
//   - All channels: no claims of relationships not in pathfinder.* data
//   - Goal: book a 20-minute call before competitors are evaluated
//
// Pipeline:
//   1. Build a structured context block from project + branch + warm
//      customer (when present)
//   2. Single Sonnet 4.6 call requesting a JSON object with the 3 drafts
//   3. Run the verifier suite — regex checks, length checks, hallucination
//      check
//   4. On verifier failure: re-prompt with the specific failure reason,
//      max 2 retries
//   5. After 2 retries: return best-effort draft with verifierWarnings
//      populated; UI surfaces "Rules not all met — review before sending"
//   6. Final-pass dash purge on every channel as a safety net (replaces
//      em-dash with ", " and en-dash with " to ")
//
// This module is the chat-iteration surface. The peer's
// lib/outreach.ts (P0-02 branch) handles the agent-driven, post-Ranker
// surface. The two will share a rules module post-merge; for V1 they
// both implement the rules in-place.

import Anthropic from '@anthropic-ai/sdk';
import { anthropic } from '@/lib/anthropic';
import type { Branch, Customer, Project } from '@/lib/types';

export const DRAFTER_MODEL = process.env.PF_OUTREACH_MODEL ?? 'claude-sonnet-4-6';
const MAX_TOKENS = 1200;
const MAX_RETRIES = 2;

// ── Length / tone constraints (spec) ──────────────────────────────────────

export const EMAIL_WORD_MIN = 60;
export const EMAIL_WORD_MAX = 90;
export const EMAIL_SUBJECT_MAX = 60;
export const LINKEDIN_CHAR_MAX = 200;
export const VOICEMAIL_WORD_MIN = 60;
export const VOICEMAIL_WORD_MAX = 80; // ~70 words ±10

// Em-dash + en-dash + minus-sign-as-stylistic (rare but seen). The minus
// sign is included for completeness; LLMs occasionally substitute it.
const DASH_REGEX = /[—–−]/g;
const EM_DASH = '—';
const EN_DASH = '–';

// ── Public types ───────────────────────────────────────────────────────────

export type IterationIntent =
  | 'fresh'
  | 'tighten'
  | 'less_salesy'
  | 'add_warm_intro'
  | 'open_with_question'
  | 'add_time_slot'
  | 'audience_pivot';

export interface DraftInput {
  project: Project;
  branch: Branch | null;
  warmCustomer: Customer | null;
  intent: IterationIntent;
  // Free-form user instruction the chat captured. Fed verbatim to the model
  // as additional guidance after the structured intent.
  userInstruction?: string;
  // For audience_pivot: e.g., "VP of Facilities" instead of "project owner".
  audienceOverride?: string;
  // Previous draft for iteration paths (fresh leaves this null).
  previousDraft?: OutreachBundle;
}

export interface OutreachBundle {
  email: { subject: string; body: string; wordCount: number; charCount: number };
  linkedin: { body: string; charCount: number };
  voicemail: { body: string; wordCount: number };
  provenance: string[]; // table:id refs the model claims it used
  verifierWarnings: string[];
  modelUsed: string;
  retries: number;
  dashSubstituted: boolean;
}

// ── Verifier ───────────────────────────────────────────────────────────────

interface VerifierResult {
  ok: boolean;
  failures: string[];
}

export function wordCount(s: string): number {
  const trimmed = s.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function purgeDashes(s: string): { text: string; replaced: boolean } {
  if (!/[—–−]/.test(s)) return { text: s, replaced: false };
  // \s* on either side eats any whitespace adjacent to the dash so we
  // don't end up with "Hello ,  world". Em-dash → comma-space; en-dash →
  // " to "; minus-sign-as-stylistic → plain hyphen.
  const text = s
    .replace(/\s*—\s*/g, ', ')
    .replace(/\s*–\s*/g, ' to ')
    .replace(/\s*−\s*/g, '-');
  return { text, replaced: true };
}

export function verifyDraft(
  draft: { email: { subject: string; body: string }; linkedin: { body: string }; voicemail: { body: string } },
  ctx: { allowedNames: Set<string> },
): VerifierResult {
  const failures: string[] = [];

  const emailWords = wordCount(draft.email.body);
  if (emailWords < EMAIL_WORD_MIN || emailWords > EMAIL_WORD_MAX) {
    failures.push(`email_word_count_out_of_range:${emailWords}`);
  }
  if (draft.email.subject.length > EMAIL_SUBJECT_MAX) {
    failures.push(`email_subject_too_long:${draft.email.subject.length}`);
  }
  if (draft.email.subject.trim().length === 0) {
    failures.push('email_subject_empty');
  }

  if (draft.linkedin.body.length > LINKEDIN_CHAR_MAX) {
    failures.push(`linkedin_too_long:${draft.linkedin.body.length}`);
  }
  if (draft.linkedin.body.trim().length === 0) {
    failures.push('linkedin_empty');
  }

  const vmWords = wordCount(draft.voicemail.body);
  if (vmWords < VOICEMAIL_WORD_MIN || vmWords > VOICEMAIL_WORD_MAX) {
    failures.push(`voicemail_word_count_out_of_range:${vmWords}`);
  }

  // Dash regex check — flag, even though we'll purge as a safety net. The
  // model should not be producing dashes in the first place.
  const allText = [
    draft.email.subject,
    draft.email.body,
    draft.linkedin.body,
    draft.voicemail.body,
  ].join(' ');
  if (DASH_REGEX.test(allText)) {
    failures.push('dash_present');
  }

  // Hallucination check — if the model names any company / customer / branch
  // that wasn't in `ctx.allowedNames`, fail. We extract bare proper-noun
  // sequences (capitalized words) and check membership conservatively. This
  // is a heuristic — false positives are possible (e.g., "Houston" as a
  // place name). To keep it safe, we only flag when a sequence of 2+ TitleCase
  // words appears AND none of those words are in `allowedNames`.
  const properNouns = extractMultiWordCapitalized(allText);
  for (const phrase of properNouns) {
    const allWordsAllowed = phrase
      .split(/\s+/)
      .every((w) => ctx.allowedNames.has(w.toLowerCase()));
    if (!allWordsAllowed) {
      failures.push(`possible_hallucination:${phrase}`);
    }
  }

  return { ok: failures.length === 0, failures };
}

function extractMultiWordCapitalized(text: string): string[] {
  // Matches sequences like "Acme Corp", "VA Hospital", "Houston Texas".
  // Skips single capitalized words (too noisy) and sentence-start words by
  // requiring at least 2 tokens.
  const matches = text.match(/\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)\b/g);
  return matches ?? [];
}

// ── Prompt construction ────────────────────────────────────────────────────

function systemPrompt(): string {
  return `You are the Outreach Drafter for Pathfinder, an intelligence platform Zedcor Security Systems uses to surface pre-budget construction projects. You write short, specific, meeting-focused outreach drafts a sales rep can send today.

Hard rules — non-negotiable:
- Email body: 60 to 90 words. Email subject under 60 characters.
- LinkedIn DM body: under 200 characters total.
- Voicemail script body: 60 to 80 words (about 25 seconds spoken).
- Do NOT use em-dashes (—) or en-dashes (–) anywhere. Use commas, periods, or "to" instead.
- Do NOT claim relationships, customer references, or facts that are not present in the structured context provided.
- Do NOT use buzzwords like "synergy", "leverage", "best-in-class", "world-class", "cutting-edge".
- Voice: technically credible, restrained, never salesy.

Every email opens with a sentence that anchors a specific project detail OR names a warm-intro path from the context. The middle states why-now (timing, RFP window, pre-budget moment). The closing CTA proposes a 20-minute call with two specific time-slot options.

Goal of every draft: book a 20-minute call before competitors are evaluated.

You return STRICT JSON only — no preamble, no markdown fences. Schema:
{
  "email":     { "subject": string, "body": string },
  "linkedin":  { "body": string },
  "voicemail": { "body": string },
  "provenance": string[]    // entries like "projects:<id>" or "branches:<id>" or "customers:<id>" naming the rows you used
}`;
}

function intentInstructions(input: DraftInput): string {
  switch (input.intent) {
    case 'fresh':
      return 'Produce a fresh 3-channel outreach bundle from the project context.';
    case 'tighten':
      return 'Reduce the previous draft email body by approximately 30 percent while preserving the specific project reference and the call CTA. Voicemail should also tighten to ~60 words. Keep LinkedIn within the 200-char rule.';
    case 'less_salesy':
      return 'Rewrite previous draft in a less salesy tone. Strip any superlatives, vendor jargon, or product-pitch register. Stay technically credible. Keep all length rules.';
    case 'add_warm_intro':
      return `Inject the warm-intro path into the email opening sentence. The warm-intro reasoning must be grounded in the warm_customer block of the provided context. Do not invent the relationship if no warm_customer is present.`;
    case 'open_with_question':
      return 'Restructure the email so its opening sentence is a single direct question that references a specific project detail. Keep length rules.';
    case 'add_time_slot':
      return 'In the email closing CTA, propose two specific time-slot options (e.g., Tuesday 10am and Thursday 2pm of next week). Keep length rules.';
    case 'audience_pivot':
      return `Rewrite as if addressed to ${input.audienceOverride ?? 'the VP of Facilities'} rather than the project owner. Adjust framing accordingly. Keep all length and tone rules.`;
  }
}

function userPrompt(input: DraftInput, retryReasons: string[]): string {
  const ctx = {
    project: {
      id: input.project.id,
      title: input.project.title,
      summary: input.project.summary,
      source: input.project.source,
      project_value: input.project.project_value,
      project_stage: input.project.project_stage,
      posted_date: input.project.posted_date,
    },
    branch: input.branch
      ? {
          id: input.branch.id,
          code: input.branch.code,
          name: input.branch.name,
          distance_miles: input.project.distance_miles,
        }
      : null,
    warm_customer: input.warmCustomer
      ? {
          id: input.warmCustomer.id,
          name: input.warmCustomer.name,
        }
      : null,
    rationale: input.project.rationale,
    outreach_hook_seed: input.project.outreach_hook,
  };

  const blocks: string[] = [
    `INTENT: ${input.intent}`,
    intentInstructions(input),
  ];
  if (input.userInstruction) {
    blocks.push(`USER ADDITIONAL INSTRUCTION: ${input.userInstruction}`);
  }
  if (input.previousDraft && input.intent !== 'fresh') {
    blocks.push(
      `PREVIOUS DRAFT (you are iterating on this):\n${JSON.stringify(
        {
          email: input.previousDraft.email,
          linkedin: input.previousDraft.linkedin,
          voicemail: input.previousDraft.voicemail,
        },
        null,
        2,
      )}`,
    );
  }
  if (retryReasons.length > 0) {
    blocks.push(
      `PRIOR ATTEMPT FAILED VERIFICATION. Fix every reason listed below. Do NOT introduce new failures:\n- ${retryReasons.join('\n- ')}`,
    );
  }
  blocks.push(`PATHFINDER CONTEXT (json):\n${JSON.stringify(ctx, null, 2)}`);
  blocks.push('Return ONLY the JSON object. No markdown fences. No commentary.');
  return blocks.join('\n\n');
}

// ── Main entry point ───────────────────────────────────────────────────────

export async function draftOutreach(input: DraftInput, deps?: { client?: Anthropic }): Promise<OutreachBundle> {
  const client = deps?.client ?? anthropic();
  const allowedNames = buildAllowedNames(input);

  let lastDraft: OutreachBundle | null = null;
  let retryReasons: string[] = [];
  let dashSubstituted = false;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await client.messages.create({
      model: DRAFTER_MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt(),
      messages: [{ role: 'user', content: userPrompt(input, retryReasons) }],
    });

    const text = res.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();

    let parsed: {
      email: { subject: string; body: string };
      linkedin: { body: string };
      voicemail: { body: string };
      provenance?: string[];
    };
    try {
      parsed = JSON.parse(stripCodeFence(text));
    } catch {
      // Model returned malformed JSON — record failure and retry.
      retryReasons = ['previous_response_not_valid_json'];
      continue;
    }

    const v = verifyDraft(parsed, { allowedNames });
    if (v.ok) {
      // Final-pass dash purge as a safety net (verifier already passed,
      // but humans appreciate belt-and-suspenders).
      const purged = applyDashPurge(parsed);
      dashSubstituted = dashSubstituted || purged.replaced;
      return finalize(purged.draft, parsed.provenance ?? [], DRAFTER_MODEL, attempt, dashSubstituted, []);
    }

    // Failed — keep retrying up to MAX_RETRIES.
    retryReasons = v.failures;
    lastDraft = finalize(parsed, parsed.provenance ?? [], DRAFTER_MODEL, attempt, false, v.failures);
  }

  // Exhausted retries. Return best-effort with warnings.
  if (lastDraft) {
    const purged = applyDashPurge(lastDraft);
    return finalize(
      purged.draft,
      lastDraft.provenance,
      lastDraft.modelUsed,
      MAX_RETRIES,
      purged.replaced,
      retryReasons,
    );
  }

  // All attempts produced unparseable JSON. Synthesize a safe placeholder
  // bundle so the UI doesn't crash; flag the failure.
  return synthesizeEmptyBundle(retryReasons);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildAllowedNames(input: DraftInput): Set<string> {
  const names: string[] = [];
  if (input.project.title) names.push(...input.project.title.split(/\s+/));
  if (input.project.summary) names.push(...input.project.summary.split(/\s+/));
  if (input.branch?.name) names.push(...input.branch.name.split(/\s+/));
  if (input.warmCustomer?.name) names.push(...input.warmCustomer.name.split(/\s+/));
  // Common geographies and stage labels Zedcor mentions.
  const safelist = ['VA', 'USA', 'US', 'TX', 'FL', 'CA', 'AZ', 'GA', 'OK', 'CO', 'KS', 'NM', 'LA'];
  return new Set([...names, ...safelist].map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')));
}

function stripCodeFence(s: string): string {
  // Models occasionally wrap JSON in ```json fences despite instruction.
  return s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

interface RawDraft {
  email: { subject: string; body: string };
  linkedin: { body: string };
  voicemail: { body: string };
}

function applyDashPurge(d: RawDraft): { draft: RawDraft; replaced: boolean } {
  const subject = purgeDashes(d.email.subject);
  const emailBody = purgeDashes(d.email.body);
  const liBody = purgeDashes(d.linkedin.body);
  const vmBody = purgeDashes(d.voicemail.body);
  const replaced = subject.replaced || emailBody.replaced || liBody.replaced || vmBody.replaced;
  return {
    draft: {
      email: { subject: subject.text, body: emailBody.text },
      linkedin: { body: liBody.text },
      voicemail: { body: vmBody.text },
    },
    replaced,
  };
}

function finalize(
  draft: RawDraft,
  provenance: string[],
  modelUsed: string,
  retries: number,
  dashSubstituted: boolean,
  warnings: string[],
): OutreachBundle {
  return {
    email: {
      subject: draft.email.subject,
      body: draft.email.body,
      wordCount: wordCount(draft.email.body),
      charCount: draft.email.subject.length,
    },
    linkedin: {
      body: draft.linkedin.body,
      charCount: draft.linkedin.body.length,
    },
    voicemail: {
      body: draft.voicemail.body,
      wordCount: wordCount(draft.voicemail.body),
    },
    provenance,
    verifierWarnings: dashSubstituted ? [...warnings, 'dash_substituted'] : warnings,
    modelUsed,
    retries,
    dashSubstituted,
  };
}

function synthesizeEmptyBundle(reasons: string[]): OutreachBundle {
  return {
    email: { subject: '', body: '', wordCount: 0, charCount: 0 },
    linkedin: { body: '', charCount: 0 },
    voicemail: { body: '', wordCount: 0 },
    provenance: [],
    verifierWarnings: ['drafter_failed_all_retries', ...reasons],
    modelUsed: DRAFTER_MODEL,
    retries: MAX_RETRIES,
    dashSubstituted: false,
  };
}

// Re-export the dash characters and limits so the chat route + tests can
// reference them without duplicating the constants.
export const OUTREACH_LIMITS = {
  EMAIL_WORD_MIN,
  EMAIL_WORD_MAX,
  EMAIL_SUBJECT_MAX,
  LINKEDIN_CHAR_MAX,
  VOICEMAIL_WORD_MIN,
  VOICEMAIL_WORD_MAX,
  EM_DASH,
  EN_DASH,
} as const;
