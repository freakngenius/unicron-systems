// lib/geography/coord-extractor.ts — Haiku-driven location inference.
//
// Demo Polish P1 — Layer B (coordinate enforcement). When the deterministic
// state-centroid fallback (lib/zedcor/state-centroids.ts) returns no hit,
// we send the project's title + summary + a small raw_payload excerpt to
// Haiku and ask it for {city, state, country, confidence}. The result
// drives a city-centroid lookup (lib/zedcor/city-centroids.ts). Confidence
// < 0.7 is treated as "still null" by the caller.
//
// Cost guardrail: Haiku 4.5 input ≈ $1/MTok, output ≈ $5/MTok. Per call
// the prompt is ~300 input tokens + ~80 output tokens = ~$0.0007. With
// 151 null-coord projects in the corpus the total backfill is ~$0.10.
//
// This module is server-only — it imports the Anthropic SDK via the
// shared lib/anthropic.ts wrapper so llm_calls cost telemetry is captured.

import Anthropic from '@anthropic-ai/sdk';
import { anthropic } from '@/lib/anthropic';

const HAIKU_MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 200;

export interface ExtractedLocation {
  /** Lower-case city name when one was identified, or null. */
  city: string | null;
  /** 2-letter US state postal code or Canadian province code, or null. */
  state: string | null;
  /** ISO-3 country code (USA / CAN / ROU / ...) or null. */
  country: string | null;
  /** 0..1 — Haiku's self-reported confidence in the inference. */
  confidence: number;
}

const SYSTEM_PROMPT = [
  'You extract a single best-guess location from a public-data project record.',
  'You are given a JSON blob with title, summary, and a raw payload excerpt.',
  'Return ONLY a single JSON object on one line, no prose, no markdown.',
  'Schema:',
  '  {"city":"<lowercase city or null>",',
  '   "state":"<2-letter US state postal or 2-letter Canadian province or null>",',
  '   "country":"<ISO-3 code: USA, CAN, ROU, GBR, ... — null only if truly indeterminate>",',
  '   "confidence":<number 0..1>}',
  'Rules:',
  '  - Use country=USA whenever the payload references a US state, US agency,',
  '    a US ZIP code, or US city name.',
  '  - Use country=CAN for Canadian provinces or cities.',
  '  - Use the explicit place-of-performance country when present.',
  '  - confidence ≥ 0.8 only when you have a city + state/province match.',
  '  - confidence ≥ 0.6 with state/province only.',
  '  - confidence < 0.6 with country alone.',
  '  - If the record references a foreign air base / embassy / overseas',
  '    construction site, set country to that foreign ISO-3 code with high',
  '    confidence (e.g. Mihail Kogălniceanu Airbase → country=ROU).',
].join(' ');

interface RawHaikuJson {
  city?: string | null;
  state?: string | null;
  country?: string | null;
  confidence?: number | string | null;
}

/** Best-effort extraction. Returns a result with confidence=0 + nulls when
 *  Haiku is unreachable / parse-fails — caller treats those the same as a
 *  low-confidence inference (geo_unknown=true downstream). */
export async function extractLocationViaHaiku(args: {
  title: string | null;
  summary: string | null;
  rawPayload: Record<string, unknown> | null;
  /** Hard timeout (ms). Default 12s — safely under Vercel cron's 60s. */
  timeoutMs?: number;
}): Promise<ExtractedLocation> {
  const { title, summary, rawPayload, timeoutMs = 12_000 } = args;

  const client = anthropic();
  const userPayload = {
    title: title ?? '',
    summary: summary ?? '',
    raw_payload_excerpt: JSON.stringify(rawPayload ?? {}).slice(0, 800),
  };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await client.messages.create(
      {
        model: HAIKU_MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(userPayload) }],
      },
      { signal: ac.signal as AbortSignal } as Anthropic.RequestOptions,
    );

    const text = res.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();

    return parseHaikuJson(text);
  } catch {
    // Network / 429 / abort — return a "couldn't infer" result.
    return { city: null, state: null, country: null, confidence: 0 };
  } finally {
    clearTimeout(timer);
  }
}

/** Parse Haiku's reply. Tolerates leading whitespace, code fences, and a
 *  trailing newline. Returns the zero result when JSON parsing fails. */
export function parseHaikuJson(text: string): ExtractedLocation {
  if (!text) return { city: null, state: null, country: null, confidence: 0 };
  // Strip a markdown code fence if Haiku wraps the JSON despite instructions.
  let body = text.trim();
  if (body.startsWith('```')) {
    const lines = body.split(/\r?\n/);
    body = lines
      .filter((l) => !l.startsWith('```'))
      .join('\n')
      .trim();
  }
  // Look for the first {...} block.
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return { city: null, state: null, country: null, confidence: 0 };
  }
  const slice = body.slice(start, end + 1);
  try {
    const obj = JSON.parse(slice) as RawHaikuJson;
    const city = typeof obj.city === 'string' && obj.city.trim() ? obj.city.trim().toLowerCase() : null;
    const state = typeof obj.state === 'string' && obj.state.trim().length === 2
      ? obj.state.trim().toUpperCase()
      : null;
    const country = typeof obj.country === 'string' && obj.country.trim()
      ? obj.country.trim().toUpperCase()
      : null;
    let confidence = 0;
    if (typeof obj.confidence === 'number' && Number.isFinite(obj.confidence)) {
      confidence = obj.confidence;
    } else if (typeof obj.confidence === 'string') {
      const n = Number.parseFloat(obj.confidence);
      if (Number.isFinite(n)) confidence = n;
    }
    confidence = Math.max(0, Math.min(1, confidence));
    return { city, state, country, confidence };
  } catch {
    return { city: null, state: null, country: null, confidence: 0 };
  }
}
