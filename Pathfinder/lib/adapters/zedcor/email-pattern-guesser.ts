// lib/adapters/zedcor/email-pattern-guesser.ts
//
// Sprint Z7 — Layer 3 of the contact resolver: free, DNS-only.
//
// Given a GC name, infer plausible domains, generate common email
// patterns (firstname.lastname@, first.last@, first@, ...), and verify
// each candidate's domain has live MX records. The first candidate
// that survives MX validation wins.
//
// Spec: Specs/SPEC-zedcor-z7-contact-resolver.md §"Layer 3".
//
// Sprint Z14.1 — added quality filter. Z14 backfill surfaced
// low-signal outputs like contact@the.com, contact@ma.com,
// contact@of.com because the suffix-stripper left the bare token
// "the" / "of" / two-letter initials as the domain root. Those
// domains do exist + have MX records (registered as defensive /
// parked), so the MX gate alone wasn't enough. The filter rejects:
//   • local-part='contact' AND domain root <6 chars
//   • domain root in stop-word set {the, and, of, inc, llc, co}
//   • domain root <3 alpha chars
// PatternGuessResult now carries a `skipped` list so callers can
// aggregate skip counts + reasons across a backfill run.
//
// Contact Cleanup (post-Z14.1) — the Z14.1 filter only screened
// local='contact'. The resolver's fallthrough to info@/estimating@/
// projects@/office@ produced a second class of garbage (info@walsh.net,
// info@cdm.com, info@bccga.com) that re-populated rows we had just
// cleared. The parked-domain problem also extends to wrong-TLD
// guesses (american.net, record.co, healtheon.co), digit-prefix
// acronym roots (a3technology.com), and joint-venture entity names
// (HURLEY JV, LLP → hurley.com — owned by a different company).
// The filter is extended via rejectLowQualityCatchall, which both
// this module's guesser and the contact-cleanup script import:
//   • generic-catchall local (contact/info/estimating/projects/office)
//     AND domain root <6 chars (was: only 'contact')
//   • generic-catchall local AND TLD ∉ {com} — every Class-B legit
//     corporate catchall in the observed Zedcor set is .com; .net/.co
//     correlates with a parked-domain miss
//   • generic-catchall local AND domain root contains a digit — legit
//     roots are pure alpha; digits indicate acronym/serial guesses
//   • generic-catchall local AND companyName carries a JV marker —
//     joint ventures rarely own a standalone domain, so the firstWord
//     fallback lands on a different company

import { promises as dns } from 'node:dns';

export interface PatternSkip {
  candidate: string;
  reason:
    | 'stop_word_domain'
    | 'short_domain'
    | 'contact_with_short_domain'
    | 'generic_local_with_short_domain'
    | 'generic_local_with_noncom_tld'
    | 'generic_local_with_digit_in_domain'
    | 'generic_local_for_joint_venture';
}

export interface PatternGuessResult {
  email: string | null;
  domain: string | null;
  pattern: string | null;
  confidence: number;
  /** Candidates rejected by the quality filter before / during MX check. */
  skipped: PatternSkip[];
}

const PATTERN_CONFIDENCE = 0.3;

const GENERIC_FIRST_NAMES = ['contact', 'info', 'estimating', 'projects', 'office'];
const GENERIC_FIRST_NAMES_SET: ReadonlySet<string> = new Set(GENERIC_FIRST_NAMES);

// Z14.1 stop-word set. Lowercase, alphanumeric only.
const STOP_WORD_DOMAIN_ROOTS: ReadonlySet<string> = new Set([
  'the', 'and', 'of', 'inc', 'llc', 'co',
]);

// Z14.1 thresholds.
const MIN_DOMAIN_ROOT_ALPHA_CHARS = 3;
const SHORT_DOMAIN_ROOT_THRESHOLD = 6; // used in combination with generic local

// Allowed TLDs for generic-catchall emails. Observed Class-B legit
// corporate catchalls in the Zedcor dataset are 100% .com; .net/.co
// guesses correlate with the resolver landing on a parked-domain miss.
const ALLOWED_CATCHALL_TLDS: ReadonlySet<string> = new Set(['com']);

// Joint-venture / partnership entity markers in the company name.
const JOINT_VENTURE_TOKENS: ReadonlySet<string> = new Set(['jv']);
const JOINT_VENTURE_PHRASES: readonly string[] = ['joint venture'];

/**
 * Extract the part of a domain before the TLD. `the.com` → `the`,
 * `acme-construction.net` → `acme-construction`.
 */
export function domainRoot(domain: string): string {
  const i = domain.lastIndexOf('.');
  return i > 0 ? domain.slice(0, i) : domain;
}

/**
 * Z14.1 — sanity check on a domain. Returns the rejection reason or null
 * when the domain is acceptable. We apply this before the MX check so
 * we don't waste DNS lookups (and don't accidentally accept registered
 * parked domains like the.com).
 */
export function rejectLowQualityDomain(domain: string): PatternSkip['reason'] | null {
  const root = domainRoot(domain).toLowerCase();
  if (STOP_WORD_DOMAIN_ROOTS.has(root)) return 'stop_word_domain';
  const alphaCount = (root.match(/[a-z]/g) ?? []).length;
  if (alphaCount < MIN_DOMAIN_ROOT_ALPHA_CHARS) return 'short_domain';
  return null;
}

/**
 * Z14.1 — final email check. Rejects generic-catchall locals (the
 * full GENERIC_FIRST_NAMES set: contact/info/estimating/projects/office)
 * paired with a short domain root. Originally only screened
 * local==='contact', which let the resolver's info@/estimating@ fallback
 * re-populate cleared rows with the same parked-domain miss
 * (info@cdm.com after contact@cdm.com was cleared).
 *
 * Still emits `contact_with_short_domain` when local==='contact' so the
 * pre-extension reason string stays comparable in skip-count telemetry;
 * other generic locals emit `generic_local_with_short_domain`.
 */
export function rejectLowQualityEmail(email: string): PatternSkip['reason'] | null {
  const at = email.indexOf('@');
  if (at < 0) return null;
  const local = email.slice(0, at).toLowerCase();
  const domain = email.slice(at + 1);
  const root = domainRoot(domain);
  if (!GENERIC_FIRST_NAMES_SET.has(local)) return null;
  if (root.length < SHORT_DOMAIN_ROOT_THRESHOLD) {
    return local === 'contact' ? 'contact_with_short_domain' : 'generic_local_with_short_domain';
  }
  return null;
}

/**
 * Contact Cleanup predicate — the single source of truth for whether a
 * pattern-guessed catchall email should ship. Composes rejectLowQualityDomain
 * and rejectLowQualityEmail with three additional gates that only matter
 * for generic-catchall locals:
 *
 *   • TLD must be .com — every Class-B legit corporate catchall observed
 *     in the Zedcor set is .com; .net/.co correlates with parked-domain
 *     misses (info@walsh.net, contact@american.net, contact@record.co).
 *   • Domain root must be pure alpha — digits in the root indicate the
 *     resolver landed on an acronym/serial guess (contact@a3technology.com).
 *   • When the companyName carries a joint-venture marker (JV, "joint
 *     venture"), no catchall is acceptable — JV entities rarely own a
 *     standalone domain, so the firstWord fallback ("HURLEY JV, LLP" →
 *     hurley.com) lands on a different company entirely.
 *
 * Importers MUST be this function (not a parallel copy) — guarantees the
 * cleanup script and the live resolver share one definition of "bad."
 */
export function rejectLowQualityCatchall(
  email: string,
  options: { companyName?: string } = {},
): PatternSkip['reason'] | null {
  const at = email.indexOf('@');
  if (at < 0) return null;
  const local = email.slice(0, at).toLowerCase();
  const domain = email.slice(at + 1).toLowerCase();

  // Existing Z14.1 gates first — keeps reason-string parity for the
  // rows that were already cleared.
  const domainReason = rejectLowQualityDomain(domain);
  if (domainReason) return domainReason;
  const emailReason = rejectLowQualityEmail(email);
  if (emailReason) return emailReason;

  // Beyond this point the extensions only fire for generic locals.
  if (!GENERIC_FIRST_NAMES_SET.has(local)) return null;

  const root = domainRoot(domain);
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  if (!ALLOWED_CATCHALL_TLDS.has(tld)) return 'generic_local_with_noncom_tld';
  if (/[0-9]/.test(root)) return 'generic_local_with_digit_in_domain';

  if (options.companyName && isJointVenture(options.companyName)) {
    return 'generic_local_for_joint_venture';
  }
  return null;
}

/**
 * True when the GC name's tokens or phrasing indicate a joint-venture
 * entity. Matches "X JV, LLP" (token-level "jv") and "BCCG A JOINT
 * VENTURE" (phrase-level). Case-insensitive.
 */
export function isJointVenture(companyName: string): boolean {
  const lower = companyName.toLowerCase();
  for (const phrase of JOINT_VENTURE_PHRASES) {
    if (lower.includes(phrase)) return true;
  }
  const tokens = lower.replace(/[.,'"`]/g, '').split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (JOINT_VENTURE_TOKENS.has(token)) return true;
  }
  return false;
}

/**
 * Domain candidates derived from the GC name. We try increasingly
 * desperate variants — the caller stops at the first one with a valid
 * MX record. Strips punctuation and corporate suffixes the way Layer
 * 1/2 wouldn't.
 */
export function inferDomainCandidates(companyName: string): string[] {
  const cleaned = companyName
    .toLowerCase()
    .replace(/[.,'"`]/g, '')
    .replace(/\s+(inc|llc|llp|ltd|corp|co|company|holdings|group|construction|builders|building)\.?$/i, '')
    .trim();
  if (!cleaned) return [];

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const joined = tokens.join('');
  const hyphenated = tokens.join('-');
  const firstTwo = tokens.slice(0, 2).join('');
  const firstWord = tokens[0];

  // Deduplicate while preserving order. Limit to a small handful — each
  // candidate triggers a DNS lookup so we cannot explode this list.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const stem of [joined, hyphenated, firstTwo, firstWord]) {
    if (!stem) continue;
    for (const tld of ['com', 'net', 'co']) {
      const candidate = `${stem}.${tld}`;
      if (!seen.has(candidate)) {
        seen.add(candidate);
        out.push(candidate);
      }
    }
  }
  return out;
}

/**
 * Email-local candidates ordered from most to least likely real.
 * The "Project Manager" persona is a generic placeholder — Layer 3
 * confidence is intentionally low to reflect that we don't know the
 * real person.
 */
export function generateEmailCandidates(domain: string): string[] {
  return GENERIC_FIRST_NAMES.map((local) => `${local}@${domain}`);
}

const dnsCache = new Map<string, boolean>();

async function hasMx(domain: string): Promise<boolean> {
  if (dnsCache.has(domain)) return dnsCache.get(domain) as boolean;
  try {
    const records = await dns.resolveMx(domain);
    const ok = Array.isArray(records) && records.length > 0;
    dnsCache.set(domain, ok);
    return ok;
  } catch {
    dnsCache.set(domain, false);
    return false;
  }
}

export function __resetMxCacheForTests(): void {
  dnsCache.clear();
}

/**
 * Layer 3 entry point. Returns the first MX-validated, quality-filtered
 * email candidate for the company, or a null result if no candidate
 * domain passes both gates.
 */
export async function guessContactEmail(companyName: string): Promise<PatternGuessResult> {
  const skipped: PatternSkip[] = [];
  const domains = inferDomainCandidates(companyName);
  for (const domain of domains) {
    const domainSkip = rejectLowQualityDomain(domain);
    if (domainSkip) {
      skipped.push({ candidate: domain, reason: domainSkip });
      continue;
    }
    if (!(await hasMx(domain))) continue;
    const candidates = generateEmailCandidates(domain);
    // Find the first candidate that passes the extended catchall filter.
    // If none pass, fall through to the next domain.
    let chosen: string | null = null;
    for (const candidate of candidates) {
      const emailSkip = rejectLowQualityCatchall(candidate, { companyName });
      if (emailSkip) {
        skipped.push({ candidate, reason: emailSkip });
        continue;
      }
      chosen = candidate;
      break;
    }
    if (!chosen) continue;
    return {
      email: chosen,
      domain,
      pattern: 'generic@domain',
      confidence: PATTERN_CONFIDENCE,
      skipped,
    };
  }
  return { email: null, domain: null, pattern: null, confidence: 0, skipped };
}
