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

import { promises as dns } from 'node:dns';

export interface PatternGuessResult {
  email: string | null;
  domain: string | null;
  pattern: string | null;
  confidence: number;
}

const PATTERN_CONFIDENCE = 0.3;

const GENERIC_FIRST_NAMES = ['contact', 'info', 'estimating', 'projects', 'office'];

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
 * Layer 3 entry point. Returns the first MX-validated email candidate
 * for the company, or a null result if no candidate domain has MX.
 */
export async function guessContactEmail(companyName: string): Promise<PatternGuessResult> {
  const domains = inferDomainCandidates(companyName);
  for (const domain of domains) {
    if (!(await hasMx(domain))) continue;
    const candidates = generateEmailCandidates(domain);
    // First candidate wins — we don't have a way to validate the local
    // part without sending mail. Spec accepts this as low-confidence.
    const email = candidates[0];
    return {
      email,
      domain,
      pattern: 'generic@domain',
      confidence: PATTERN_CONFIDENCE,
    };
  }
  return { email: null, domain: null, pattern: null, confidence: 0 };
}
