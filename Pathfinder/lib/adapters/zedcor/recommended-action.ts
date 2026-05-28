// lib/adapters/zedcor/recommended-action.ts
//
// Sprint Z4 — assembles the rep-facing "what to do right now" string +
// computes action_by_date. Pure logic — no I/O.
//
// Spec: SPEC-zedcor-z4-cross-pollination-pitch.md §"Component 3".
//
// Action By Date precedence:
//   1. sub_bid_deadline - 14 days
//   2. else gc_award_date + 21 days
//   3. else posted_date + 30 days
//   4. clamp to today when the computed date is in the past

import type { PitchHooks } from './pitch-generator';

export interface RecommendedActionInput {
  title: string;
  gc_name: string | null;
  gc_contact_name: string | null;
  gc_contact_role: string | null;
  gc_contact_phone: string | null;
  cross_pollination: string | null;
  hooks: PitchHooks;
  sub_bid_deadline: string | null;   // YYYY-MM-DD
  gc_award_date: string | null;       // YYYY-MM-DD
  posted_date: string | null;         // YYYY-MM-DD
  today?: string;                     // override for testing (YYYY-MM-DD)
}

export interface RecommendedActionResult {
  recommended_action: string;
  action_by_date: string;             // YYYY-MM-DD — never null
}

function todayIso(override?: string): string {
  if (override) return override.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return isoDate;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isPast(isoDate: string, today: string): boolean {
  return isoDate < today;
}

export function computeActionByDate(input: {
  sub_bid_deadline: string | null;
  gc_award_date: string | null;
  posted_date: string | null;
  today?: string;
}): string {
  const today = todayIso(input.today);
  let candidate: string | null = null;

  if (input.sub_bid_deadline) {
    candidate = addDays(input.sub_bid_deadline.slice(0, 10), -14);
  } else if (input.gc_award_date) {
    candidate = addDays(input.gc_award_date.slice(0, 10), 21);
  } else if (input.posted_date) {
    candidate = addDays(input.posted_date.slice(0, 10), 30);
  } else {
    candidate = today;
  }

  if (!candidate || isPast(candidate, today)) return today;
  return candidate;
}

function shortenTitle(raw: string, maxLen = 60): string {
  const t = raw.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1).trimEnd()}…`;
}

function crossPollSnippet(crossPoll: string | null): string {
  if (!crossPoll) return 'no existing relationship on file';
  if (crossPoll.startsWith('No existing')) return 'no existing relationship on file';
  return crossPoll.replace(/\.$/, '').toLowerCase();
}

export function assembleRecommendedAction(input: RecommendedActionInput): RecommendedActionResult {
  const action_by_date = computeActionByDate({
    sub_bid_deadline: input.sub_bid_deadline,
    gc_award_date: input.gc_award_date,
    posted_date: input.posted_date,
    today: input.today,
  });

  const contactName = input.gc_contact_name?.trim();
  const contactRole = input.gc_contact_role?.trim();
  const contactPhone = input.gc_contact_phone?.trim();
  const gcLabel = input.gc_name?.trim() ?? 'the GC';

  const callLine = contactName && contactPhone
    ? `Call ${contactName}${contactRole ? ` (${contactRole})` : ''} at ${contactPhone}.`
    : contactName
      ? `Reach out to ${contactName}${contactRole ? ` (${contactRole})` : ''} at ${gcLabel}.`
      : `Identify the project owner at ${gcLabel} and call them directly.`;

  const subjectLine = `Subject: "${shortenTitle(input.title)} — surveillance for staging yards".`;
  const openLine = `Open with: ${input.hooks.hook_1}`;
  const refLine = `Reference: ${crossPollSnippet(input.cross_pollination)}.`;
  const followUpLine = `Follow up by ${action_by_date}.`;

  const recommended_action = [callLine, subjectLine, openLine, refLine, followUpLine].join(' ');

  return { recommended_action, action_by_date };
}
