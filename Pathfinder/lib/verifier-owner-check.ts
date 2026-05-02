// lib/verifier-owner-check.ts — Z-D #8 owner / GC anchor grounding helper.
//
// The verifier's rationale-accuracy step (app/api/cron/verifier/route.ts)
// already grounds dollar / location / customer / operational anchors against
// raw_payload via Sonnet. This module adds a deterministic, LLM-free check
// for owner / prime-contractor / awarding-agency mentions. The "narratable
// rationale" guard (TUESDAY DEMO PLAN.md item 6, Risk Register #1) wraps
// this helper: when a load-bearing owner mention can't be resolved AND the
// verifier has already iterated once on the project, the rationale is
// rewritten to a safe placeholder rather than ship a possibly-hallucinated
// narrative.
//
// Lives in lib/ rather than the route file because Next.js's App Router
// restricts which symbols a `route.ts` may export (only `GET`, `POST`,
// other HTTP verbs, `dynamic`, `revalidate`, etc.). Importing from `lib/`
// is the canonical pattern.

export const SAFE_RATIONALE_PLACEHOLDER =
  'Owner not yet enriched — awaiting Perplexity research pass';

/** raw_payload keys we treat as ground truth for owner / GC / awardee /
 * awarding-agency identity. Sourced from the live SAM.gov + USAspending
 * payload shapes (Awarding Agency, Recipient Name) and the news-source
 * harness (awardee_name, gc_name, owner_name, prime_contractor). */
const OWNER_PAYLOAD_KEYS = [
  'owner_name',
  'gc_name',
  'awardee_name',
  'recipient_name',
  'prime_contractor',
  'contractor_listed',
  'agency',
  'awarding_agency_id',
  'agency_slug',
  'Recipient Name',
  'Awarding Agency',
];

/** Cue phrases preceding an owner / GC mention in a rationale. The pattern
 * captures the next 1-3 capitalized tokens after the cue as the candidate
 * name. Tuned against existing Pathfinder rationales — keep narrow so we
 * don't false-flag generic prose like "owners want better lighting".
 * Capture class deliberately excludes `.` so we stop at sentence boundaries
 * (otherwise "Owner is Acme Inc. Prime contractor is X" greedily merges). */
const OWNER_CUE_RE = new RegExp(
  String.raw`\b(?:owner|GC|general\s+contractor|prime\s+contractor|prime|awardee|awarding\s+agency|awarded\s+to|recipient|developer)\b\s*(?:is|was|:|—|-)?\s*((?:[A-Z][a-zA-Z&'\-]+(?:\s+[A-Z][a-zA-Z&'\-]+){0,3}))`,
  'gi',
);

const NORM_SUFFIXES_RE = /\b(inc|llc|l\.l\.c\.|corp|corporation|co|company|builders|group|partners|holdings|industries|construction|systems|defense)\b\.?/gi;
const NORM_NON_ALNUM_RE = /[^a-z0-9]+/g;

/** Lowercase + drop common corporate suffixes + collapse whitespace. Mirrors
 * `normalizeCustomerName` in the verifier route so suffix-insensitive
 * comparisons line up across both checks ("Acme, Inc." ≡ "Acme Inc"). */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(NORM_SUFFIXES_RE, ' ')
    .replace(NORM_NON_ALNUM_RE, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Pull every string-shaped value out of raw_payload at the OWNER_PAYLOAD_KEYS
 * positions (top-level + one nested level — USAspending wraps under .award).
 * Returned values are normalized so the comparison is suffix-insensitive. */
function collectOwnerCandidatesFromPayload(
  raw: Record<string, unknown> | null | undefined,
): Set<string> {
  const out = new Set<string>();
  if (!raw || typeof raw !== 'object') return out;

  const visit = (obj: Record<string, unknown>) => {
    for (const k of OWNER_PAYLOAD_KEYS) {
      const v = obj[k];
      if (typeof v === 'string' && v.trim()) {
        const norm = normalize(v);
        if (norm) out.add(norm);
      }
    }
  };

  visit(raw);
  // USAspending nests award details under .award.
  if (typeof raw.award === 'object' && raw.award !== null) {
    visit(raw.award as Record<string, unknown>);
  }
  return out;
}

/** Extract owner-shaped mentions from a rationale string. Each return is
 * the candidate name normalized for comparison. Single-word candidates are
 * dropped — too noisy ("owner is Smith" doesn't carry enough evidence). */
function extractOwnerMentions(rationale: string): string[] {
  if (!rationale) return [];
  const out = new Set<string>();
  for (const m of rationale.matchAll(OWNER_CUE_RE)) {
    const candidate = (m[1] ?? '').trim();
    if (!candidate) continue;
    if (!/\s/.test(candidate)) continue;
    const norm = normalize(candidate);
    if (norm && norm.length >= 4) out.add(norm);
  }
  return [...out];
}

export interface OwnerCheckResult {
  /** Distinct owner-shaped mentions extracted from the rationale. */
  mentioned: string[];
  /** Subset of `mentioned` that resolves to a value in raw_payload's
   * owner-shaped fields. */
  resolved: string[];
  /** Mentions that DON'T resolve — these are the hallucination candidates. */
  flagged: string[];
}

/** Compare rationale-mentioned owners against raw_payload's owner fields.
 * Returns the set of mentions that appear unfounded. Pure / synchronous
 * so it's trivially testable. */
export function checkOwnerAnchors(
  rationale: string,
  raw_payload: Record<string, unknown> | null | undefined,
): OwnerCheckResult {
  const mentioned = extractOwnerMentions(rationale);
  if (mentioned.length === 0) {
    return { mentioned: [], resolved: [], flagged: [] };
  }
  const groundTruth = collectOwnerCandidatesFromPayload(raw_payload);
  const resolved: string[] = [];
  const flagged: string[] = [];
  for (const m of mentioned) {
    // A mention resolves when ANY ground-truth value contains it OR vice
    // versa (handles short forms — "Acme" mention vs "Acme Builders Inc"
    // payload entry, and the reverse).
    let hit = false;
    for (const g of groundTruth) {
      if (g.includes(m) || m.includes(g)) {
        hit = true;
        break;
      }
    }
    if (hit) resolved.push(m);
    else flagged.push(m);
  }
  return { mentioned, resolved, flagged };
}
