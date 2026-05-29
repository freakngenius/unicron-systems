// lib/adapters/zedcor/news-gc-extractor.ts
//
// Sprint Z14 — lightweight GC-name extractor for news-feed snippets
// (RSS title + description). Separate from gc-extractor.ts because
// detail-page extraction works on full HTML and has a much richer signal
// surface; news snippets are short, prose-heavy, and need a different
// approach.
//
// Two layers:
//   1) Cheap regex against award patterns ("X named contractor",
//      "X awarded contract", "X wins/selects/breaks ground on Y").
//   2) Anthropic Sonnet fallback when the regex misses. Sonnet is gated
//      on ANTHROPIC_API_KEY — absent → returns gc_name=null and the
//      caller decides whether to ship the row anyway.
//
// Return shape mirrors the gc-extractor module's gc_name field plus a
// `layer` discriminator so callers can audit which path won.

import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_MODEL = process.env.ZEDCOR_ENRICHMENT_MODEL ?? 'claude-sonnet-4-6';
const ANTHROPIC_MAX_TOKENS = 200;
const ANTHROPIC_TEMPERATURE = 0;

export type NewsExtractionLayer = 'regex' | 'anthropic' | 'none';

export interface NewsGcResult {
  gc_name: string | null;
  layer: NewsExtractionLayer;
  citation: string | null;
}

// Verbs are written with inline case alternation rather than the /i flag
// because /i turns the [A-Z] character class inside COMPANY_NAME into
// [A-Za-z], which silently broke the "capitalized token" guarantee and
// let lowercase trailing words like "was" / "began" leak into matches.
const COMPANY_SUFFIX = String.raw`(?:Construction|Constructors|Contracting|Contractors|Builders|Building|Group|Companies|Company|Industries|Corporation|Corp\.?|Inc\.?|LLC|LLP|LP|Ltd\.?|Partners|Holdings|Enterprises|Engineering|Engineers|Mechanical|Electrical|Civil|Industrial|Services|Solutions)`;
const AWARD_VERBS = String.raw`(?:[Aa]warded|[Nn]amed|[Ss]elected|[Ww]ins?|[Tt]apped|[Cc]hosen|[Pp]icked|[Hh]ired|[Ss]ecures?|[Ll]ands?|[Bb]reaks?\s+ground\s+on|[Tt]ops?\s+out|[Cc]ompletes?)`;

// Capitalized word run: each word starts with [A-Z] and contains letters,
// digits, hyphens, ampersands, or periods. Optional " & " connector.
// Examples that match: "Skanska", "E-J Electric", "Webcor Builders",
// "Turner Construction", "Hensel Phelps", "JE Dunn", "DPR Construction".
const COMPANY_NAME = String.raw`(?:[A-Z][A-Za-z0-9.&-]+(?:\s+(?:&|and)\s+[A-Z][A-Za-z0-9.&-]+|\s+[A-Z][A-Za-z0-9.&-]+){0,4}(?:\s+${COMPANY_SUFFIX})?)`;

// Patterns are ordered from most specific (lowest false-positive risk) to
// most general. The first surviving match wins.
const PATTERNS: Array<{ re: RegExp; group: number }> = [
  // "named Webcor Builders as the general contractor" — specific frame
  { re: new RegExp(`(?:[Nn]amed|[Ss]elected|[Cc]hose|[Pp]icked|[Tt]apped)\\s+(${COMPANY_NAME})\\s+(?:as|to|for)\\b`), group: 1 },
  // "general contractor Hensel Phelps", "prime contractor Turner Construction"
  { re: new RegExp(`(?:[Gg]eneral\\s+contractor|[Pp]rime\\s+contractor|[Cc]ontractor|GC)\\s+(${COMPANY_NAME})\\b`), group: 1 },
  // "contract was awarded to Skanska"
  { re: new RegExp(`\\b[Aa]warded\\s+to\\s+(${COMPANY_NAME})\\b`), group: 1 },
  // "team led by Hensel Phelps", "build team Skanska USA"
  { re: new RegExp(`\\b(?:[Tt]eam\\s+led\\s+by|[Bb]uild\\s+team|[Cc]onstruction\\s+team)\\s+(${COMPANY_NAME})\\b`), group: 1 },
  // "Skanska awarded $1.2B contract", "Skanska was awarded ..." — broadest, last
  { re: new RegExp(`(${COMPANY_NAME})\\s+(?:was\\s+|is\\s+|has\\s+been\\s+)?${AWARD_VERBS}\\b`), group: 1 },
];

const NON_COMPANY_WORDS = new Set<string>([
  'the', 'an', 'a', 'this', 'that', 'these', 'those', 'their', 'his', 'her',
  'new', 'old', 'major', 'large', 'small', 'first', 'second', 'last',
  'tx', 'texas', 'houston', 'dallas', 'austin', 'fort', 'worth',
  // Owner-side titles that frequently anchor "X named Y" sentences. We
  // reject these as plausible GC names because they describe the awarder,
  // not the awardee. Note: case is lowercased before lookup.
  'owner', 'agency', 'authority', 'city', 'county', 'state', 'district',
  'department', 'commission', 'board', 'office', 'governor', 'mayor',
  'project', 'developer', 'team', 'team',
]);

function isPlausibleCompanyName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 3 || trimmed.length > 80) return false;
  // First word must not be a generic stopword.
  const first = trimmed.split(/\s+/)[0]?.toLowerCase() ?? '';
  if (NON_COMPANY_WORDS.has(first)) return false;
  // Reject single common words like "Construction" alone.
  if (!/\s/.test(trimmed) && /^(Construction|Builders|Group|Contractors|Engineering)$/i.test(trimmed)) {
    return false;
  }
  return true;
}

export function extractGcNameWithRegex(text: string): NewsGcResult {
  if (!text) return { gc_name: null, layer: 'none', citation: null };
  const cleaned = text.replace(/\s+/g, ' ').trim();
  for (const { re, group } of PATTERNS) {
    const m = cleaned.match(re);
    if (m && m[group] && isPlausibleCompanyName(m[group])) {
      return {
        gc_name: m[group].trim().replace(/[.,;:]+$/, ''),
        layer: 'regex',
        citation: m[0].slice(0, 200),
      };
    }
  }
  return { gc_name: null, layer: 'none', citation: null };
}

const ANTHROPIC_SYSTEM_PROMPT = `You are a construction-news parser. Given a short news article title and snippet, identify the general contractor / prime contractor named in the story.

Return JSON only:
{"gc_name": "..." or null}

Rules:
- Return the GC company name verbatim, as it appears in the text (do not normalize, do not abbreviate).
- If the story names multiple contractors, return the prime contractor (the one explicitly described as awarded, named, selected, or "general contractor" / "prime contractor").
- If no GC is named, return {"gc_name": null}. Do not guess. Owner agencies, architects, engineers, and subcontractors are not the GC.
- Do not include suffix punctuation like "." or ",".`;

let anthropicClient: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: key });
  return anthropicClient;
}

function parseJsonGcName(content: string): string | null {
  const fenced = content.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : content;
  const start = candidate.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return null;
  try {
    const obj = JSON.parse(candidate.slice(start, end + 1)) as { gc_name?: string | null };
    if (obj && typeof obj.gc_name === 'string' && obj.gc_name.trim()) {
      return obj.gc_name.trim().replace(/[.,;:]+$/, '');
    }
    return null;
  } catch {
    return null;
  }
}

export async function extractGcNameWithAnthropic(
  title: string,
  snippet: string,
): Promise<NewsGcResult> {
  const client = getAnthropic();
  if (!client) return { gc_name: null, layer: 'none', citation: null };

  const userText = `Title: ${title.trim()}\n\nSnippet: ${snippet.trim().slice(0, 2_000)}`;
  let raw: string;
  try {
    const res = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      temperature: ANTHROPIC_TEMPERATURE,
      system: ANTHROPIC_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userText }],
    });
    const block = res.content.find((b) => b.type === 'text');
    raw = block && block.type === 'text' ? block.text : '';
  } catch {
    return { gc_name: null, layer: 'none', citation: null };
  }
  const name = parseJsonGcName(raw);
  if (!name || !isPlausibleCompanyName(name)) {
    return { gc_name: null, layer: 'none', citation: null };
  }
  return { gc_name: name, layer: 'anthropic', citation: raw.slice(0, 200) };
}

/**
 * Two-layer GC-name extractor for news snippets.
 *
 * @param title    RSS item title
 * @param snippet  RSS item description (HTML-stripped)
 * @param opts.skipAnthropic — when true, regex-only (used in tests + when
 *                              caller already knows ANTHROPIC_API_KEY is absent)
 */
export async function extractGcNameFromNewsSnippet(
  title: string,
  snippet: string,
  opts: { skipAnthropic?: boolean } = {},
): Promise<NewsGcResult> {
  const combined = `${title}\n${snippet}`;
  const regex = extractGcNameWithRegex(combined);
  if (regex.gc_name) return regex;
  if (opts.skipAnthropic) return { gc_name: null, layer: 'none', citation: null };
  return extractGcNameWithAnthropic(title, snippet);
}
