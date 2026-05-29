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

import { promises as dns } from 'node:dns';

export interface PatternSkip {
  candidate: string;
  reason: 'stop_word_domain' | 'short_domain' | 'contact_with_short_domain';
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

// Z14.1 stop-word set. Lowercase, alphanumeric only.
const STOP_WORD_DOMAIN_ROOTS: ReadonlySet<string> = new Set([
  'the', 'and', 'of', 'inc', 'llc', 'co',
]);

// Z14.1 thresholds.
const MIN_DOMAIN_ROOT_ALPHA_CHARS = 3;
const SHORT_DOMAIN_ROOT_THRESHOLD = 6; // used in combination with local='contact'

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
 * Z14.1 — final email check. Rejects the contact@<short-root> case
 * even when the domain itself passes rejectLowQualityDomain (e.g.
 * `contact@kfc.com` — 3-letter root, real domain, but the generic
 * `contact@` local is not high-enough signal to ship without human
 * review).
 */
export function rejectLowQualityEmail(email: string): PatternSkip['reason'] | null {
  const at = email.indexOf('@');
  if (at < 0) return null;
  const local = email.slice(0, at).toLowerCase();
  const domain = email.slice(at + 1);
  const root = domainRoot(domain);
  if (local === 'contact' && root.length < SHORT_DOMAIN_ROOT_THRESHOLD) {
    return 'contact_with_short_domain';
  }
  return null;
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
    // Find the first candidate that passes the email-level quality
    // filter. If none pass, fall through to the next domain.
    let chosen: string | null = null;
    for (const candidate of candidates) {
      const emailSkip = rejectLowQualityEmail(candidate);
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
