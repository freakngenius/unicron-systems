// lib/leads/parse-rationale.ts — Demo Polish UX Gate 7B (full impl).
//
// Splits a project's free-form `rationale` string into structured buckets the
// redesigned lead detail page renders into Recommended Action (Section 5) +
// Project Story → "Why this lead" (Section 6 — fit / market / geography).
//
// Approach: heuristic regex extraction. No LLM call — keeps it cheap,
// deterministic, and unit-testable. The Ranker can later upgrade rationale
// generation to emit structured fields directly; until then this parser
// extracts what's available from existing free-form text.
//
// Contract: parseRationale never throws. If extraction fails, it returns
// `fallback: true` with `monolithic` populated; callers render the
// monolithic block as a de-emphasized fallback per spec § 6.

export interface ParsedRationale {
  /** True when extraction failed; render `monolithic` instead of structured. */
  fallback: boolean;
  /** Original rationale text (or null if input was null). */
  monolithic: string | null;
  /** Recommended-action sentence(s). Cap 2 sentences. */
  action: string | null;
  /** Buying contact (name + role + organization). */
  buyingContact: string | null;
  /** Timing pressure phrase (deadline, response window, etc). */
  timingPressure: string | null;
  /** Fit-with-product-mix sentence. */
  fitWithProductMix: string | null;
  /** Market-signal-strength sentence. */
  marketSignalStrength: string | null;
  /** Geographic-fit sentence (references nearest branch + distance). */
  geographicFit: string | null;
}

// Sentence-level extraction patterns. Order matters in places — first-match
// wins for `action`, so high-signal patterns sit higher.

const ACTION_VERB_RE =
  /^\s*(call|reach\s+out|schedule|propose|send|coordinate|connect|walk|open|email|approach|introduce|book)\b/i;

const ACTION_PHRASE_RE =
  /\b(natural\s+warm\s+intro|recommended\s+action|recommended\s+next\s+step|the\s+right\s+move|worth\s+a\s+(?:15|20|30|45|60)[\s-]?minute|first\s+move)\b/i;

const ROLE_RE =
  /\b(VP|vice\s+president|director|head|manager|officer|principal|partner|chief|lead|administrator|superintendent|commissioner)\b/i;

const TIMING_RE =
  /\b(\d+\s*(?:-?day|days?)\s+(?:response\s+)?(?:window|deadline)|by\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d+|before\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d+|RFP\s+(?:closes|deadline|window)|response\s+window|bid\s+window|pre-?budget|pre-?bid|posted\s+\d{4}-\d{2}-\d{2})\b/i;

const FIT_RE =
  /\b(wedge|outpriced|won|fit\s+for|exact\s+wedge|product\s+mix|capability|capabilities)\b/i;

const MARKET_SIGNAL_RE =
  /\b(RFP|permit|announcement|corridor|bundles?|scope|solicitation|right-of-way|maintenance\s+yards?)\b/i;

const GEOGRAPHIC_RE =
  /\b(\d+\s*miles?|coverage\s+radius|nearest\s+branch|HOU\s+branch|Houston\s+branch|inside\s+the\s+\d+-mile|tracks?\s+with)\b/i;

/**
 * Split rationale into sentences. Conservative: respects paragraph breaks +
 * splits on `.`/`?`/`!` followed by whitespace + uppercase letter. Avoids
 * breaking on abbreviations (`Mr.`, `Inc.`) by requiring 2+ chars before the
 * period.
 */
function splitSentences(text: string): string[] {
  const flat = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!flat) return [];
  const parts = flat.split(/(?<=[a-z0-9)\]"][.?!])\s+(?=[A-Z"'])/g);
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

function findFirst(sentences: string[], re: RegExp): string | null {
  for (const s of sentences) {
    if (re.test(s)) return s;
  }
  return null;
}

/**
 * Extract a buying-contact phrase. Looks for `the <role> <preposition> <Org>`
 * patterns in any sentence; captures the role-bearing fragment plus enough
 * surrounding context to identify which org / person.
 */
function extractBuyingContact(sentences: string[]): string | null {
  for (const s of sentences) {
    if (!ROLE_RE.test(s)) continue;

    const possessive = s.match(
      /([A-Z][A-Za-z&.'-]+(?:\s+[A-Z][A-Za-z&.'-]+)*)['']s\s+([a-z][a-z\s-]{0,40}\s+(?:VP|vice president|director|head|manager|officer|principal|partner|chief|lead|administrator|superintendent|commissioner))/i,
    );
    if (possessive) return `${possessive[2].trim()} at ${possessive[1].trim()}`;

    const at = s.match(
      /(the\s+[a-z][a-z\s-]{0,40}\s+(?:VP|vice president|director|head|manager|officer|principal|partner|chief|lead|administrator|superintendent|commissioner)(?:\s+(?:at|of|for)\s+[A-Z][A-Za-z\s&.'-]+)?)/i,
    );
    if (at) return at[1].trim().replace(/\s+/g, ' ');

    const noun = s.match(
      /\b([A-Za-z][\w\s'&.-]{0,80}\b(?:VP|vice president|director|head|manager|officer|principal|partner|chief|lead|administrator|superintendent|commissioner))\b/i,
    );
    if (noun) {
      // Trim leading filler ("the ", "a ", etc.) for cleaner display.
      return noun[1].trim().replace(/\s+/g, ' ');
    }
  }
  return null;
}

/**
 * Extract a timing-pressure phrase (deadline, response window, etc.). Returns
 * a tight fragment, not the whole sentence, so the UI renders compactly.
 */
function extractTimingPressure(sentences: string[]): string | null {
  for (const s of sentences) {
    const m = s.match(TIMING_RE);
    if (m) {
      const idx = s.indexOf(m[0]);
      const before = s.slice(0, idx).split(/[,—–]/).pop() ?? '';
      const after = s.slice(idx + m[0].length).split(/[,—–.]/)[0] ?? '';
      const phrase = `${before}${m[0]}${after}`.trim();
      return phrase.length > 80 ? m[0] : phrase;
    }
  }
  return null;
}

function clampSentences(text: string, maxSentences: number): string {
  const parts = splitSentences(text);
  return parts.slice(0, maxSentences).join(' ').trim();
}

/**
 * Parse a project rationale string into structured action / fit / timing
 * buckets. See module-level doc for behavior. Never throws.
 */
export function parseRationale(rationale: string | null | undefined): ParsedRationale {
  if (rationale == null) return emptyResult(null);
  if (rationale.trim().length === 0) return emptyResult(rationale);

  const sentences = splitSentences(rationale);
  if (sentences.length === 0) return emptyResult(rationale);

  // Action: prefer imperative-verb-led sentences, then phrase matches. Pull
  // the following sentence too, so we capture the "what to propose"
  // follow-up — clamped to 2 sentences total per spec § 5.
  let actionSeed: string | null =
    findFirst(sentences, ACTION_VERB_RE) ?? findFirst(sentences, ACTION_PHRASE_RE);

  if (actionSeed) {
    const idx = sentences.indexOf(actionSeed);
    const next = sentences[idx + 1] ?? '';
    const combined = next ? `${actionSeed} ${next}` : actionSeed;
    actionSeed = clampSentences(combined, 2);
  }

  const buyingContact = extractBuyingContact(sentences);
  const timingPressure = extractTimingPressure(sentences);
  const fitWithProductMix = findFirst(sentences, FIT_RE);
  const marketSignalStrength = findFirst(sentences, MARKET_SIGNAL_RE);
  const geographicFit = findFirst(sentences, GEOGRAPHIC_RE);

  // Fallback decision: if no action could be extracted, signal fallback so
  // RecommendedAction null-renders and ProjectStory shows the monolithic
  // block. Other structured fields are best-effort and may be null without
  // triggering fallback.
  if (!actionSeed) {
    return {
      fallback: true,
      monolithic: rationale,
      action: null,
      buyingContact,
      timingPressure,
      fitWithProductMix,
      marketSignalStrength,
      geographicFit,
    };
  }

  return {
    fallback: false,
    monolithic: rationale,
    action: actionSeed,
    buyingContact,
    timingPressure,
    fitWithProductMix,
    marketSignalStrength,
    geographicFit,
  };
}

function emptyResult(monolithic: string | null): ParsedRationale {
  return {
    fallback: true,
    monolithic,
    action: null,
    buyingContact: null,
    timingPressure: null,
    fitWithProductMix: null,
    marketSignalStrength: null,
    geographicFit: null,
  };
}
