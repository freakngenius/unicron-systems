// lib/agents/internal/geo.ts
//
// Internal onboarding Stage 5 — Internal-shaped geo-mapper.
//
// Internal's geo model is intentionally simple. Each lead is a company,
// not a project, and the salient geographic fact is the company's own
// footprint:
//   - hq_state (USPS 2-letter)
//   - operating_states[] (USPS 2-letter, may include hq_state)
//
// No Unicron branches, no haversine, no coverage radius. The Zedcor
// `lib/agents/geo.ts` shim and the Funder `lib/agents/funder/geo.ts`
// (FunderHub) are untouched.
//
// Pure heuristic: scans the title, summary, and raw_payload state hints
// for state references. Returns null when no state can be inferred.
//
// Spec: Pathfinder/Pathfinder-Internal-Blueprint.md §7.

export interface InternalGeoInput {
  title?: string | null;
  summary?: string | null;
  raw_payload?: Record<string, unknown> | null;
}

export interface InternalGeoMetadata {
  hq_state: string | null;
  operating_states: string[];
}

const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC',
]);

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};

function normalizeStateCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (US_STATE_CODES.has(upper) && upper.length === 2) return upper;
  const lower = trimmed.toLowerCase();
  return STATE_NAME_TO_CODE[lower] ?? null;
}

function collectStatesFromText(text: string): string[] {
  const found = new Set<string>();
  // Match only original-case UPPERCASE two-letter codes so common
  // English prepositions ("in", "or", "as") don't false-match. Codes
  // must be flanked by space/comma/period/end-of-string.
  const codeRe = /(?:^|[,\s])([A-Z]{2})(?=$|[,\s.])/g;
  let m: RegExpExecArray | null;
  while ((m = codeRe.exec(text)) !== null) {
    if (US_STATE_CODES.has(m[1])) found.add(m[1]);
  }
  const lower = text.toLowerCase();
  for (const [name, code] of Object.entries(STATE_NAME_TO_CODE)) {
    // Word-boundary check so "indiana" doesn't false-match inside "ndiana"
    // and "iowa" doesn't false-match inside "iowascape" or similar.
    const re = new RegExp(`(?:^|[^a-z])${name}(?:$|[^a-z])`);
    if (re.test(lower)) found.add(code);
  }
  return Array.from(found);
}

/**
 * Map a candidate Internal company event to its hq_state + operating_states
 * footprint. Returns nulls when no state evidence is present.
 */
export function mapInternalGeo(input: InternalGeoInput): InternalGeoMetadata {
  const payload = input.raw_payload ?? {};

  // Strong signal first: payload-level state field set by the adapter.
  const payloadHqRaw =
    (payload.hq_state as string | undefined) ??
    (payload.state as string | undefined) ??
    (payload.physicalAddressState as string | undefined) ??
    null;
  const hqFromPayload = normalizeStateCode(payloadHqRaw);

  // Operating states may arrive as an array on the adapter payload (SAM
  // entity records, USASpending recipient profiles, license multi-state).
  const opsFromPayloadRaw = payload.operating_states;
  const opsFromPayload: string[] = Array.isArray(opsFromPayloadRaw)
    ? (opsFromPayloadRaw as unknown[])
        .map((v) => normalizeStateCode(typeof v === 'string' ? v : null))
        .filter((v): v is string => v !== null)
    : [];

  // Soft signal: scan title/summary/state-laden free text for additional
  // state mentions.
  const text = `${input.title ?? ''} ${input.summary ?? ''}`;
  const opsFromText = collectStatesFromText(text);

  const combinedOps = new Set<string>();
  if (hqFromPayload) combinedOps.add(hqFromPayload);
  for (const s of opsFromPayload) combinedOps.add(s);
  for (const s of opsFromText) combinedOps.add(s);

  let hq = hqFromPayload;
  if (!hq) {
    // Pick the first operating state as best-guess HQ when no explicit
    // payload field is set. Conservative — leaves null if no signal at all.
    if (opsFromPayload.length > 0) hq = opsFromPayload[0];
    else if (opsFromText.length > 0) hq = opsFromText[0];
  }

  return {
    hq_state: hq,
    operating_states: Array.from(combinedOps).sort(),
  };
}

// Exported for tests.
export { normalizeStateCode, collectStatesFromText, US_STATE_CODES };
