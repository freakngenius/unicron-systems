// lib/zedcor/country-detect.ts — country detection for ingestor + backfill.
//
// Demo Polish P1 (Layer A — ingest country filter). Inspects an ingestor
// raw_payload blob and returns the canonical 3-letter ISO country code
// when one can be determined from structured fields. Returns `null` when
// the payload exposes no country information and a downstream caller (the
// Haiku coord-extractor) needs to take over.
//
// Scope notes:
//   - sam.gov v2 API:    raw_payload.placeOfPerformance.country.{code,name}
//   - USAspending:       raw_payload.recipient.location.country_code OR
//                        raw_payload['Place of Performance State Code'] (US only)
//   - Harris County:     synthetic seed rows — always 'USA'
//   - news:              raw_payload.country_hint (when present) OR null
//
// Country aliases: SAM.gov sometimes returns full English names ('UNITED
// STATES', 'CANADA', 'ROMANIA'). USAspending uses 3-letter ISO codes
// directly. We normalize everything to USA/CAN/<ISO-3> for storage.

const COUNTRY_NAME_TO_ISO3: Record<string, string> = {
  'united states': 'USA',
  'united states of america': 'USA',
  'usa': 'USA',
  'us': 'USA',
  'u.s.': 'USA',
  'u.s.a.': 'USA',
  'america': 'USA',
  'canada': 'CAN',
  'ca': 'CAN',
};

/** Normalize a country string into an ISO-3 code. Returns null when the
 *  input is empty / whitespace; returns the trimmed-uppercased input when
 *  no alias matches (so e.g. 'GBR' passes through, 'ROU' for Romania too). */
export function normalizeCountry(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const alias = COUNTRY_NAME_TO_ISO3[lower];
  if (alias) return alias;
  // Already an ISO-3? Use upper-case verbatim.
  if (/^[A-Za-z]{3}$/.test(trimmed)) return trimmed.toUpperCase();
  // 2-letter (rare in payloads but defensive).
  if (trimmed.length === 2) return trimmed.toUpperCase();
  // Unknown free-form name — pass through uppercased so the filter can
  // decide. (e.g. 'ROMANIA' -> 'ROMANIA', will fail allow-list check.)
  return trimmed.toUpperCase();
}

/** Best-effort country extraction from an ingestor raw_payload blob.
 *  Returns the canonical 3-letter code when found, or null when the
 *  payload is silent. The caller decides what to do with `null` (the
 *  ingestor leaves the row's country NULL; the backfill calls Haiku). */
export function detectCountryFromPayload(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  if (!payload) return null;

  // Shape 1 — SAM.gov v2 nested object: placeOfPerformance.country.{code,name}.
  const sgPop = payload['placeOfPerformance'];
  if (sgPop && typeof sgPop === 'object') {
    const country = (sgPop as { country?: unknown }).country;
    if (country && typeof country === 'object') {
      const code = (country as { code?: unknown }).code;
      if (typeof code === 'string') {
        const norm = normalizeCountry(code);
        if (norm) return norm;
      }
      const name = (country as { name?: unknown }).name;
      if (typeof name === 'string') {
        const norm = normalizeCountry(name);
        if (norm) return norm;
      }
    } else if (typeof country === 'string') {
      const norm = normalizeCountry(country);
      if (norm) return norm;
    }
  }

  // Shape 2 — USAspending recipient.location.country_code.
  const recipient = payload['recipient'];
  if (recipient && typeof recipient === 'object') {
    const location = (recipient as { location?: unknown }).location;
    if (location && typeof location === 'object') {
      const code = (location as { country_code?: unknown }).country_code;
      if (typeof code === 'string') {
        const norm = normalizeCountry(code);
        if (norm) return norm;
      }
    }
  }

  // Shape 3 — USAspending top-level recipient_country_code (older shape).
  const usCC = payload['recipient_country_code'];
  if (typeof usCC === 'string') {
    const norm = normalizeCountry(usCC);
    if (norm) return norm;
  }

  // Shape 4 — USAspending: a state code in 'Place of Performance State Code'
  // is implicitly USA. SAM.gov likewise: a state.code at placeOfPerformance
  // is USA-only (their international postings populate country, not state).
  const usState = payload['Place of Performance State Code'];
  if (typeof usState === 'string' && usState.trim().length === 2) {
    return 'USA';
  }
  if (sgPop && typeof sgPop === 'object') {
    const state = (sgPop as { state?: unknown }).state;
    if (state && typeof state === 'object') {
      const code = (state as { code?: unknown }).code;
      if (typeof code === 'string' && code.trim().length === 2) {
        return 'USA';
      }
    }
  }

  // Shape 5 — Harris seed rows always expose an `address` ending with a US
  // state abbreviation; we treat them as USA.
  const address = payload['address'];
  if (typeof address === 'string') {
    const tail = address.trim().split(/\s+/).slice(-2);
    if (tail.length >= 1 && /^[A-Z]{2}$/.test(tail[tail.length - 1])) {
      return 'USA';
    }
  }

  // Shape 6 — news adapter: raw_payload.country_hint (when seeded by the
  // news fetcher). Free-form; normalize the same way.
  const hint = payload['country_hint'];
  if (typeof hint === 'string') {
    const norm = normalizeCountry(hint);
    if (norm) return norm;
  }

  return null;
}

/** Country mention scan for free-form news bodies. Counts mentions of a
 *  small allow-list of foreign country names; if any single foreign country
 *  is mentioned more often than US/Canada combined, we consider the body
 *  out-of-country. Lightweight heuristic — replace with NER later. */
export function detectCountryFromNewsBody(
  body: string | null | undefined,
): { country: string; confidence: number } | null {
  if (!body || typeof body !== 'string') return null;
  const text = body.toLowerCase();
  const usCount =
    (text.match(/\b(?:united states|u\.s\.|usa|america)\b/g)?.length ?? 0) +
    (text.match(/\b(?:texas|california|new york|florida|illinois|tennessee|pennsylvania|nevada|arizona|virginia|washington|oregon|colorado|minnesota|massachusetts|georgia|michigan|ohio|north carolina|south carolina|missouri|kansas|kentucky|alabama|louisiana|oklahoma|new mexico|utah|wisconsin)\b/g)?.length ?? 0);
  const canCount = text.match(/\b(?:canada|alberta|ontario|british columbia|quebec|manitoba)\b/g)?.length ?? 0;
  const naCount = usCount + canCount;

  const FOREIGN_COUNTRIES: Array<[string, RegExp]> = [
    ['ROU', /\bromania\b/g],
    ['DEU', /\bgermany\b/g],
    ['POL', /\bpoland\b/g],
    ['GBR', /\b(?:united kingdom|britain|england)\b/g],
    ['FRA', /\bfrance\b/g],
    ['JPN', /\bjapan\b/g],
    ['KOR', /\b(?:south korea|republic of korea)\b/g],
    ['ITA', /\bitaly\b/g],
    ['ESP', /\bspain\b/g],
    ['IRQ', /\biraq\b/g],
    ['SAU', /\bsaudi arabia\b/g],
    ['AUS', /\baustralia\b/g],
    ['MEX', /\bmexico\b/g],
    ['BRA', /\bbrazil\b/g],
    ['CHN', /\bchina\b/g],
    ['IND', /\bindia\b/g],
    ['UKR', /\bukraine\b/g],
  ];

  let topForeign: { iso: string; count: number } | null = null;
  for (const [iso, re] of FOREIGN_COUNTRIES) {
    const c = text.match(re)?.length ?? 0;
    if (c > 0 && (!topForeign || c > topForeign.count)) {
      topForeign = { iso, count: c };
    }
  }

  if (topForeign && topForeign.count > naCount) {
    // Confidence scales with how dominant the foreign mention is.
    const confidence = Math.min(0.95, 0.6 + topForeign.count * 0.05);
    return { country: topForeign.iso, confidence };
  }
  if (naCount > 0) {
    // US dominates — only return when at least one explicit US/CAN token.
    return { country: usCount >= canCount ? 'USA' : 'CAN', confidence: 0.7 };
  }
  return null;
}
