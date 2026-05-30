// lib/catalog/modules/smart-search/applySearch.ts, Stream F.
//
// Pure narrowing helper for the one smart-search input that replaces the
// four dead text inputs on the legacy Internal floor. Cooperates with
// lib/catalog/modules/filter-rail/applyFilters.ts: filter-rail narrows by
// dropdown selections (slug equality on service_category / sales_motion /
// federal_registration / source), then this helper narrows further by a
// free-text query the salesperson typed.
//
// Match semantics: tokenized AND. The query is split on whitespace; a row
// passes when EVERY token matches at least one of:
//   - row.title or company_name (case-insensitive substring)
//   - service_category slug AND humanized label
//   - sales_motion slug AND humanized label
//   - hq_location substring AND the parsed US state name and abbreviation
//   - the numeric row.score as a string (so "55" matches score 55 and "5"
//     matches score 50-59, etc.)
// A two-letter all-caps token additionally matches a state abbreviation
// extracted from hq_location.

import type { RawCompanyRow } from '@/lib/catalog/modules/filter-rail/applyFilters';

// Minimal US state name -> abbreviation map used to translate "Texas" tokens
// into a "TX" match against hq_location and vice versa. Salespeople search
// by either spelling.
const STATE_NAME_TO_ABBR: Record<string, string> = {
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
  'district of columbia': 'DC',
};

const STATE_ABBR_SET = new Set(Object.values(STATE_NAME_TO_ABBR));

function readNestedString(row: RawCompanyRow, path: readonly string[]): string | null {
  let cur: unknown = row.raw_payload;
  for (const seg of path) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[seg];
  }
  if (typeof cur !== 'string') return null;
  const trimmed = cur.trim();
  return trimmed === '' ? null : trimmed;
}

function humanize(slug: string | null): string | null {
  if (!slug) return null;
  return slug.replace(/[_-]+/g, ' ').trim().toLowerCase();
}

function companyName(row: RawCompanyRow): string | null {
  const fromPayload = readNestedString(row, ['internal_enrichment', 'company_name']);
  if (fromPayload) return fromPayload;
  return typeof row.title === 'string' && row.title.trim() !== '' ? row.title : null;
}

// Pull the last comma-separated chunk of hq_location (assumed state) and
// emit both the long form ("texas") and the abbreviation ("TX") so a typed
// search by either form matches. Falls back to scanning each segment when
// the trailing chunk is not recognized.
function locationAliases(loc: string | null): { lower: string; abbrs: ReadonlySet<string> } {
  if (!loc) return { lower: '', abbrs: new Set() };
  const lower = loc.toLowerCase();
  const segs = loc.split(',').map((s) => s.trim());
  const abbrs = new Set<string>();
  for (const seg of segs) {
    const segLower = seg.toLowerCase();
    if (STATE_NAME_TO_ABBR[segLower]) {
      abbrs.add(STATE_NAME_TO_ABBR[segLower]);
    } else if (seg.length === 2 && STATE_ABBR_SET.has(seg.toUpperCase())) {
      abbrs.add(seg.toUpperCase());
    }
  }
  return { lower, abbrs };
}

interface RowMatchSurface {
  company: string;
  category: string;
  motion: string;
  locationLower: string;
  locationAbbrs: ReadonlySet<string>;
  scoreStr: string;
}

function projectRow(row: RawCompanyRow): RowMatchSurface {
  const company = (companyName(row) ?? '').toLowerCase();
  const categorySlug = readNestedString(row, ['internal_enrichment', 'service_category']);
  const motionSlug = readNestedString(row, ['internal_enrichment', 'sales_motion']);
  const category = [categorySlug, humanize(categorySlug)].filter(Boolean).join(' ').toLowerCase();
  const motion = [motionSlug, humanize(motionSlug)].filter(Boolean).join(' ').toLowerCase();
  const locRaw = readNestedString(row, ['internal_enrichment', 'hq_location']);
  const { lower: locationLower, abbrs: locationAbbrs } = locationAliases(locRaw);
  const scoreStr = typeof row.score === 'number' ? String(row.score) : '';
  return { company, category, motion, locationLower, locationAbbrs, scoreStr };
}

function tokenMatchesSurface(token: string, s: RowMatchSurface): boolean {
  // Two-letter caps tokens are state-abbreviation matches first.
  if (token.length === 2 && STATE_ABBR_SET.has(token.toUpperCase())) {
    if (s.locationAbbrs.has(token.toUpperCase())) return true;
  }
  const t = token.toLowerCase();
  if (s.company.includes(t)) return true;
  if (s.category.includes(t)) return true;
  if (s.motion.includes(t)) return true;
  if (s.locationLower.includes(t)) return true;
  if (s.scoreStr && s.scoreStr.includes(t)) return true;
  return false;
}

/**
 * Pure narrowing pass over `rows` against a free-text `q`. Tokenized AND
 * across the four match fields described above. Empty/whitespace `q`
 * returns the input unchanged.
 */
export function applySearchQuery(
  rows: readonly RawCompanyRow[],
  q: string | undefined | null,
): RawCompanyRow[] {
  const text = (q ?? '').trim();
  if (text === '') return [...rows];
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return [...rows];
  return rows.filter((row) => {
    const surface = projectRow(row);
    return tokens.every((tok) => tokenMatchesSurface(tok, surface));
  });
}

export const __internals = {
  STATE_NAME_TO_ABBR,
  STATE_ABBR_SET,
  projectRow,
  locationAliases,
};
