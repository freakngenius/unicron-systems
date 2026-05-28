// lib/adapters/zedcor/gc-extractor.ts
//
// Sprint Z3.5 — Three-layer GC + contact extraction pipeline.
//
//   Layer 1: structured HTML extraction (cheerio).
//   Layer 2: Anthropic Sonnet structured JSON extraction.
//   Layer 3: Perplexity Sonar web search fallback for gc_name only.
//
// Caller passes (source_url, title). We fetch the detail page once, run
// the layers in order, merge fields (first non-null wins), and return a
// gc_metadata bundle ready to persist to pathfinder.projects.gc_metadata
// and to map onto Notion via lib/notion/zedcor-writer:enrichmentToNotionProperties.
//
// Hard rules (from spec §"Hard rules"):
//   - Never fabricate.
//   - Never store full detail-page HTML (we only return extracted fields).
//   - Never claim a GC for a project still in solicitation phase — callers
//     gate by project_stage; this module trusts the caller's gate.

import Anthropic from '@anthropic-ai/sdk';
import * as cheerio from 'cheerio';
import { fetchDetailPage, type FetchStatus } from './detail-page-fetcher';
import { extractContactFromHtml, normalizeUsPhone } from './contact-extractor';


export type ExtractionLayer = 'html' | 'anthropic' | 'sonar' | 'mixed' | 'none';

export interface GcMetadata {
  gc_name: string | null;
  gc_award_date: string | null;
  gc_contact_name: string | null;
  gc_contact_role: string | null;
  gc_contact_email: string | null;
  gc_contact_phone: string | null;
  sub_bid_deadline: string | null;
  subcontract_package_url: string | null;
  fetched_at: string;
  fetch_status: FetchStatus;
  extraction_layer: ExtractionLayer;
  source_citation: string | null;
}

interface ExtractableFields {
  gc_name: string | null;
  gc_award_date: string | null;
  gc_contact_name: string | null;
  gc_contact_role: string | null;
  gc_contact_email: string | null;
  gc_contact_phone: string | null;
  sub_bid_deadline: string | null;
  subcontract_package_url: string | null;
}

const EMPTY_FIELDS: ExtractableFields = {
  gc_name: null,
  gc_award_date: null,
  gc_contact_name: null,
  gc_contact_role: null,
  gc_contact_email: null,
  gc_contact_phone: null,
  sub_bid_deadline: null,
  subcontract_package_url: null,
};

const ANTHROPIC_MODEL = process.env.ZEDCOR_ENRICHMENT_MODEL ?? 'claude-sonnet-4-6';
const ANTHROPIC_MAX_TOKENS = 800;
const ANTHROPIC_TEMPERATURE = 0;

// Approximate token-to-char ratio for english HTML: 1 token ≈ 4 chars. We
// cap detail-page text we send to Anthropic to ~6K tokens worth (~24K chars)
// to keep the per-project cost predictable (spec §"Soft cap").
const ANTHROPIC_MAX_PAGE_CHARS = 24_000;

const ANTHROPIC_SYSTEM_PROMPT = `You are a construction-procurement document parser. Given the text of a public bid/award detail page, extract the following fields as JSON. Return null for any field not found verbatim in the text. Do not fabricate.

{
  "gc_name": "string or null — the prime contractor / general contractor awarded the contract",
  "gc_award_date": "YYYY-MM-DD or null — date the prime contract was awarded",
  "gc_contact_name": "string or null — project manager or subcontract administrator at the GC, NOT the owner agency",
  "gc_contact_role": "string or null — their title",
  "gc_contact_email": "string or null",
  "gc_contact_phone": "string or null — formatted as +1-XXX-XXX-XXXX",
  "sub_bid_deadline": "YYYY-MM-DD or null — date GC will close subcontractor selection",
  "subcontract_package_url": "string or null — URL to sub-bid documents"
}

Only extract from explicit text on the page. If the page describes an owner's RFP (not a GC award), set gc_name=null. If the page is an award notice naming a prime contractor, populate gc_name from there.`;

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function toIsoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Accept YYYY-MM-DD directly.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const t = Date.parse(trimmed);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

function mergeFields(primary: ExtractableFields, secondary: ExtractableFields): ExtractableFields {
  return {
    gc_name: primary.gc_name ?? secondary.gc_name,
    gc_award_date: primary.gc_award_date ?? secondary.gc_award_date,
    gc_contact_name: primary.gc_contact_name ?? secondary.gc_contact_name,
    gc_contact_role: primary.gc_contact_role ?? secondary.gc_contact_role,
    gc_contact_email: primary.gc_contact_email ?? secondary.gc_contact_email,
    gc_contact_phone: primary.gc_contact_phone ?? secondary.gc_contact_phone,
    sub_bid_deadline: primary.sub_bid_deadline ?? secondary.sub_bid_deadline,
    subcontract_package_url: primary.subcontract_package_url ?? secondary.subcontract_package_url,
  };
}

function hasAnyField(f: ExtractableFields): boolean {
  return Boolean(
    f.gc_name || f.gc_award_date || f.gc_contact_name || f.gc_contact_role ||
    f.gc_contact_email || f.gc_contact_phone || f.sub_bid_deadline || f.subcontract_package_url,
  );
}

function isComplete(f: ExtractableFields): boolean {
  // "Complete enough to skip Layer 2": we have a GC name and at least
  // one contact channel. Award date / sub-bid deadline are nice-to-have.
  return Boolean(f.gc_name && (f.gc_contact_email || f.gc_contact_phone));
}

// ──────────────────────────────────────────────────────────────────────────
// Layer 1: cheerio structured extraction
// ──────────────────────────────────────────────────────────────────────────

// Award-notice row labels we expect on award pages.
const GC_NAME_LABELS = /\b(awarded\s+to|prime\s+contractor|general\s+contractor|awarded\s+vendor|contract(?:or)?\s+awarded|successful\s+bidder|winning\s+bidder|recommended\s+(?:bidder|awardee)|notice\s+of\s+award)\b/i;
const AWARD_DATE_LABELS = /\b(award\s+date|date\s+awarded|contract\s+award\s+date|notice\s+of\s+award\s+date|awarded\s+on)\b/i;
const SUB_BID_LABELS = /\b(sub[\s\-]?bid\s+(?:deadline|due|date)|subcontractor\s+(?:bids?|packages?)\s+due|sub[s]?\s+due|sub[\s\-]?bid\s+package(?:s)?\s+due)\b/i;
const SUB_PACKAGE_LINK_TEXT = /\b(bid\s+documents?|subcontract(?:or)?\s+packages?|sub[\s\-]?bid\s+packages?|plans?\s+(?:and|&)\s+specs?|bid\s+package(?:s)?)\b/i;

// Cheerio wrappers around a single matched element. Using `unknown` for the
// generic keeps this file decoupled from cheerio's internal Node-type enum
// (which changes between minor releases).
type CheerioEl = ReturnType<cheerio.CheerioAPI>;

function readSiblingValue($el: CheerioEl): string | null {
  // <th>Label</th><td>Value</td> or <dt>Label</dt><dd>Value</dd>
  const tag = ($el.prop('tagName') ?? '').toString().toLowerCase();
  if (tag === 'th' || tag === 'td') {
    const td = $el.next('td');
    if (td.length) return td.text().trim();
  }
  if (tag === 'dt') {
    const dd = $el.next('dd');
    if (dd.length) return dd.text().trim();
  }
  // Inline pattern: "Label: Value" in same node.
  const text = $el.text();
  const colonIdx = text.indexOf(':');
  if (colonIdx >= 0) {
    const tail = text.slice(colonIdx + 1).trim();
    if (tail) return tail;
  }
  return null;
}

function extractGcFieldsFromHtml(html: string): ExtractableFields {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();

  let gc_name: string | null = null;
  let gc_award_date: string | null = null;
  let sub_bid_deadline: string | null = null;
  let subcontract_package_url: string | null = null;

  // Pass 1: labeled cell scan (th/td/dt + inline "Label:").
  $('th, td, dt, p, li, strong, b, span, div').each((_, el) => {
    const node = $(el);
    const text = node.text().trim();
    if (!text || text.length > 200) return;

    if (!gc_name && GC_NAME_LABELS.test(text)) {
      const value = readSiblingValue(node);
      if (value && value.length > 1 && value.length < 200) gc_name = value;
    }
    if (!gc_award_date && AWARD_DATE_LABELS.test(text)) {
      const value = readSiblingValue(node);
      const iso = toIsoDate(value);
      if (iso) gc_award_date = iso;
    }
    if (!sub_bid_deadline && SUB_BID_LABELS.test(text)) {
      const value = readSiblingValue(node);
      const iso = toIsoDate(value);
      if (iso) sub_bid_deadline = iso;
    }
  });

  // Pass 2: links labeled like a bid-package URL.
  if (!subcontract_package_url) {
    $('a[href]').each((_, el) => {
      const linkText = $(el).text().trim();
      const href = $(el).attr('href') ?? '';
      if (!href) return undefined;
      if (SUB_PACKAGE_LINK_TEXT.test(linkText)) {
        subcontract_package_url = href;
        return false;
      }
      return undefined;
    });
  }

  const contact = extractContactFromHtml(html);

  return {
    gc_name,
    gc_award_date,
    gc_contact_name: contact.gc_contact_name,
    gc_contact_role: contact.gc_contact_role,
    gc_contact_email: contact.gc_contact_email,
    gc_contact_phone: contact.gc_contact_phone,
    sub_bid_deadline,
    subcontract_package_url,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Layer 2: Anthropic structured extraction
// ──────────────────────────────────────────────────────────────────────────

let anthropicClient: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: key });
  return anthropicClient;
}

function htmlToPlainText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, nav, header, footer, aside').remove();
  // Collapse whitespace per text node.
  return $('body').text().replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function parseJsonFromAnthropic(content: string): Partial<ExtractableFields> | null {
  // Accept either bare JSON or a ```json fenced block.
  const fenced = content.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : content;
  // Find the first {...} balanced block to tolerate any preamble.
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
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function extractWithAnthropic(html: string): Promise<ExtractableFields | null> {
  const client = getAnthropic();
  if (!client) return null;

  const text = htmlToPlainText(html).slice(0, ANTHROPIC_MAX_PAGE_CHARS);
  if (!text) return null;

  let raw: string;
  try {
    const res = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      temperature: ANTHROPIC_TEMPERATURE,
      system: ANTHROPIC_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
    });
    const block = res.content.find((b) => b.type === 'text');
    raw = block && block.type === 'text' ? block.text : '';
  } catch {
    return null;
  }

  const parsed = parseJsonFromAnthropic(raw);
  if (!parsed) return null;

  // Normalize known fields. Trust Anthropic for everything except date and
  // phone formatting (we want strict YYYY-MM-DD and +1-XXX-XXX-XXXX).
  return {
    gc_name: typeof parsed.gc_name === 'string' && parsed.gc_name.trim() ? parsed.gc_name.trim() : null,
    gc_award_date: toIsoDate(parsed.gc_award_date ?? null),
    gc_contact_name: typeof parsed.gc_contact_name === 'string' && parsed.gc_contact_name.trim() ? parsed.gc_contact_name.trim() : null,
    gc_contact_role: typeof parsed.gc_contact_role === 'string' && parsed.gc_contact_role.trim() ? parsed.gc_contact_role.trim() : null,
    gc_contact_email: typeof parsed.gc_contact_email === 'string' && /@/.test(parsed.gc_contact_email) ? parsed.gc_contact_email.trim() : null,
    gc_contact_phone: typeof parsed.gc_contact_phone === 'string' ? (normalizeUsPhone(parsed.gc_contact_phone) ?? null) : null,
    sub_bid_deadline: toIsoDate(parsed.sub_bid_deadline ?? null),
    subcontract_package_url: typeof parsed.subcontract_package_url === 'string' && /^https?:\/\//i.test(parsed.subcontract_package_url) ? parsed.subcontract_package_url.trim() : null,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Layer 3: Perplexity Sonar fallback (gc_name only)
// ──────────────────────────────────────────────────────────────────────────

interface SonarResult {
  gc_name: string | null;
  citation: string | null;
}

async function extractGcNameFromSonar(projectTitle: string): Promise<SonarResult> {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key || !projectTitle) return { gc_name: null, citation: null };

  const query = `"${projectTitle}" awarded contract prime contractor general contractor 2025 2026`;
  let raw: string;
  let citation: string | null = null;
  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You are a construction-procurement research assistant. Given a project title, return ONLY the prime contractor (GC) name as a JSON object {"gc_name": "..."} or {"gc_name": null} if no clear award found. Use press releases, agency announcements, or construction trade press. Do not guess.',
          },
          { role: 'user', content: query },
        ],
      }),
    });
    if (!res.ok) return { gc_name: null, citation: null };
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      citations?: string[];
    };
    raw = body.choices?.[0]?.message?.content ?? '';
    citation = body.citations && body.citations.length > 0 ? body.citations[0] : null;
  } catch {
    return { gc_name: null, citation: null };
  }

  const parsed = parseJsonFromAnthropic(raw);
  const gc = parsed && typeof parsed.gc_name === 'string' && parsed.gc_name.trim() ? parsed.gc_name.trim() : null;
  return { gc_name: gc, citation: gc ? citation : null };
}

// ──────────────────────────────────────────────────────────────────────────
// Public entry point
// ──────────────────────────────────────────────────────────────────────────

export interface EnrichInput {
  source_url: string | null;
  title: string;
  /** Z6 — force the tiered L1→L4 bypass fetcher for this row even on
   *  non-whitelisted hosts. Used by backfill --use-bypass-fetcher. */
  forceBypass?: boolean;
}

/**
 * Run all three extraction layers and return the final gc_metadata bundle.
 * The caller is responsible for persisting and for writing the result to
 * Notion via lib/notion/zedcor-writer:enrichmentToNotionProperties.
 */
export async function extractGcMetadata(input: EnrichInput): Promise<GcMetadata> {
  const fetched = await fetchDetailPage(input.source_url, {
    forceBypass: input.forceBypass ?? false,
  });
  const base: Omit<GcMetadata, keyof ExtractableFields> = {
    fetched_at: fetched.fetchedAt,
    fetch_status: fetched.status,
    extraction_layer: 'none',
    source_citation: null,
  };

  // If the page couldn't be fetched, still try Layer 3 (Perplexity) for GC name.
  if (fetched.status !== 'ok' || !fetched.html) {
    const sonar = await extractGcNameFromSonar(input.title);
    if (sonar.gc_name) {
      return {
        ...EMPTY_FIELDS,
        ...base,
        gc_name: sonar.gc_name,
        extraction_layer: 'sonar',
        source_citation: sonar.citation,
      };
    }
    return { ...EMPTY_FIELDS, ...base };
  }

  // Layer 1
  const layer1 = extractGcFieldsFromHtml(fetched.html);
  let merged = layer1;
  let layer: ExtractionLayer = hasAnyField(layer1) ? 'html' : 'none';

  // Layer 2 — run unless Layer 1 is "complete enough".
  if (!isComplete(layer1)) {
    const layer2 = await extractWithAnthropic(fetched.html);
    if (layer2) {
      merged = mergeFields(layer1, layer2);
      const layer2Contributed = hasAnyField({
        gc_name: layer1.gc_name ? null : layer2.gc_name,
        gc_award_date: layer1.gc_award_date ? null : layer2.gc_award_date,
        gc_contact_name: layer1.gc_contact_name ? null : layer2.gc_contact_name,
        gc_contact_role: layer1.gc_contact_role ? null : layer2.gc_contact_role,
        gc_contact_email: layer1.gc_contact_email ? null : layer2.gc_contact_email,
        gc_contact_phone: layer1.gc_contact_phone ? null : layer2.gc_contact_phone,
        sub_bid_deadline: layer1.sub_bid_deadline ? null : layer2.sub_bid_deadline,
        subcontract_package_url: layer1.subcontract_package_url ? null : layer2.subcontract_package_url,
      });
      if (layer2Contributed) {
        layer = hasAnyField(layer1) ? 'mixed' : 'anthropic';
      }
    }
  }

  // Layer 3 — only if gc_name still null.
  let citation: string | null = null;
  if (!merged.gc_name) {
    const sonar = await extractGcNameFromSonar(input.title);
    if (sonar.gc_name) {
      merged = { ...merged, gc_name: sonar.gc_name };
      citation = sonar.citation;
      layer = hasAnyField({ ...merged, gc_name: null }) ? 'mixed' : 'sonar';
    }
  }

  return {
    ...merged,
    ...base,
    extraction_layer: layer,
    source_citation: citation,
  };
}

// Test seam — also reset detail-page-fetcher state from caller.
export const __internal = {
  extractGcFieldsFromHtml,
  parseJsonFromAnthropic,
  toIsoDate,
};
