// lib/adapters/sources/_zedcor-shared.ts
//
// Sprint Z1A — shared helpers for the 10 Zedcor Houston source adapters.
// Each adapter (houston-obo, harris-county-bonfire, ...) reuses these
// utilities so adapter files stay thin and policy lives in one place.

import * as cheerio from 'cheerio';
import type { SourceEvent } from './types';
import {
  inferPhaseFromText,
  applyBuyWindowAging,
  type BidLifecyclePhase,
  type PhaseInference,
} from '../zedcor/phase-signals';

export const ZEDCOR_UA =
  'PathfinderZedcor/1.0 (Houston procurement crawler; kyle@freakngenius.com)';

export const FETCH_TIMEOUT_MS = 15_000;
export const MAX_CANDIDATES_PER_SOURCE = 50;
// Sprint Z3 — number of detail-page fetches an adapter is allowed per run
// (per-source cap). The most-recently-posted opportunities are enriched first.
export const MAX_DETAIL_FETCHES_PER_SOURCE = 5;
// Polite delay between detail-page fetches inside a single adapter.
export const DETAIL_FETCH_DELAY_MS = 1_500;

export interface FetchOpts {
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
}

/**
 * Fetch HTML/JSON with an AbortSignal timeout + Pathfinder User-Agent.
 * Throws on non-2xx so the orchestrator records source_failed correctly.
 */
export async function pfFetch(url: string, opts: FetchOpts = {}): Promise<Response> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(url, {
    headers: {
      'User-Agent': ZEDCOR_UA,
      Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
      ...(opts.headers ?? {}),
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`fetch ${url} failed: HTTP ${res.status}`);
  }
  return res;
}

export async function pfFetchHtml(url: string, opts: FetchOpts = {}): Promise<cheerio.CheerioAPI> {
  const res = await pfFetch(url, opts);
  return cheerio.load(await res.text());
}

export async function pfFetchJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
  const res = await pfFetch(url, {
    ...opts,
    headers: { Accept: 'application/json', ...(opts.headers ?? {}) },
  });
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// State + date normalization for raw_payload promotion
// ---------------------------------------------------------------------------

const STATE_NAME_TO_CODE: Record<string, string> = {
  texas: 'TX', louisiana: 'LA', oklahoma: 'OK', arkansas: 'AR',
};

const ZEDCOR_GEOFENCE: ReadonlySet<string> = new Set(['TX', 'LA', 'OK', 'AR']);

export function normalizeState(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  const lower = trimmed.toLowerCase();
  if (STATE_NAME_TO_CODE[lower]) return STATE_NAME_TO_CODE[lower];
  const match = trimmed.match(/\b(TX|LA|OK|AR)\b/i);
  if (match) return match[1].toUpperCase();
  return null;
}

export function isInZedcorGeofence(stateCode: string | null | undefined): boolean {
  if (!stateCode) return true; // unknown state is allowed in (defer to verifier)
  return ZEDCOR_GEOFENCE.has(stateCode.toUpperCase());
}

const TX_COUNTIES_BY_KEYWORD: Array<{ kw: RegExp; county: string }> = [
  { kw: /\b(harris|houston)\b/i, county: 'Harris County' },
  { kw: /\bfort bend\b/i, county: 'Fort Bend County' },
  { kw: /\bgalveston\b/i, county: 'Galveston County' },
  { kw: /\bbrazoria\b/i, county: 'Brazoria County' },
  { kw: /\bmontgomery\b/i, county: 'Montgomery County' },
];

export function inferCountyFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const { kw, county } of TX_COUNTIES_BY_KEYWORD) {
    if (kw.test(text)) return county;
  }
  return null;
}

export function parseLooseDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const t = new Date(input.trim()).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// SourceEvent factory — adapter writes the raw_payload + the orchestrator
// promotes fields to projects columns. Adapters MUST stuff the
// orchestrator-promoted fields into raw_payload (agency, city, county,
// state, source_url, response_deadline, estimated_value).
// ---------------------------------------------------------------------------

export interface ZedcorRawPayload {
  agency?: string | null;
  city?: string | null;
  county?: string | null;
  state?: string | null;
  source_url?: string | null;
  response_deadline?: string | null;
  estimated_value?: number | null;
  // Optional per-source extras land here too.
  [key: string]: unknown;
}

export function buildEvent(args: {
  source_event_id: string;
  title: string;
  summary?: string | null;
  posted_date?: string | null;
  raw_payload: ZedcorRawPayload;
}): SourceEvent {
  const state = normalizeState(args.raw_payload.state ?? null);
  return {
    source_event_id: args.source_event_id,
    title: args.title.trim().slice(0, 500),
    summary: args.summary ?? null,
    posted_date: args.posted_date ?? null,
    raw_payload: { ...args.raw_payload, state },
    city: (args.raw_payload.city as string | null | undefined) ?? null,
    state,
    country: 'US',
  };
}

/** Stable hash fallback for sources without their own opportunity id. */
export function hashId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h) ^ input.charCodeAt(i);
  return `h${(h >>> 0).toString(36)}`;
}

// ---------------------------------------------------------------------------
// Sprint Z3 — phase tagging + detail-page enrichment helpers
// ---------------------------------------------------------------------------

/**
 * Initial phase tagging — applied by the adapter as a default before any
 * detail-page enrichment runs. Listing-page data alone is a weak signal, so
 * the default is `solicitation` at `phase_confidence=0.5` per SPEC.
 */
export function initialPhaseTagging(): {
  project_stage: BidLifecyclePhase;
  phase_confidence: number;
  buy_window_open: boolean;
} {
  return {
    project_stage: 'solicitation',
    phase_confidence: 0.5,
    buy_window_open: false,
  };
}

export interface EnrichmentOutcome {
  url: string;
  ok: boolean;
  /** post-enrichment phase if signals upgraded it; null if no upgrade. */
  upgraded_phase: BidLifecyclePhase | null;
  /** post-enrichment confidence; null if no upgrade. */
  confidence: number | null;
  /** verbatim HTML/text fragment that triggered the upgrade, if any. */
  evidence: string | null;
  /** error message when ok=false. */
  error?: string;
}

export interface DetailEnrichmentArgs {
  detail_urls: string[];                         // per-opportunity detail urls (top-N by posted_date)
  fetchImpl?: typeof fetch;
  max_fetches?: number;                          // default MAX_DETAIL_FETCHES_PER_SOURCE
  delay_ms?: number;                             // default DETAIL_FETCH_DELAY_MS
  /** Posted-date lookup used by aging logic when upgrading buy_window_open. */
  posted_dates?: Record<string, string | null>;
}

export interface DetailEnrichmentResults {
  upgrades: Map<string, {
    phase: BidLifecyclePhase;
    confidence: number;
    buy_window_open: boolean;
    evidence: string;
  }>;
  outcomes: EnrichmentOutcome[];
}

/**
 * Fetch each detail URL (rate-limited), strip HTML to text, run phase-signals
 * regex, and return an upgrade map per URL. The adapter merges these into the
 * raw_payload before emit.
 *
 * Errors are swallowed per-URL — one timeout/403 doesn't kill the run. The
 * outcomes array captures verbatim evidence (or error reason) for PR
 * verbatim-evidence requirements.
 */
export async function enrichDetailPages(
  args: DetailEnrichmentArgs,
): Promise<DetailEnrichmentResults> {
  const maxFetches = args.max_fetches ?? MAX_DETAIL_FETCHES_PER_SOURCE;
  const delayMs = args.delay_ms ?? DETAIL_FETCH_DELAY_MS;
  const fetchImpl = args.fetchImpl ?? fetch;
  const upgrades: DetailEnrichmentResults['upgrades'] = new Map();
  const outcomes: EnrichmentOutcome[] = [];
  const queue = args.detail_urls.slice(0, maxFetches);

  for (const url of queue) {
    try {
      const res = await fetchImpl(url, {
        headers: {
          'User-Agent': ZEDCOR_UA,
          Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        outcomes.push({
          url,
          ok: false,
          upgraded_phase: null,
          confidence: null,
          evidence: null,
          error: `HTTP ${res.status}`,
        });
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      const html = await res.text();
      // Strip to text — preserve word boundaries.
      const text = cheerio.load(html)('body').text().replace(/\s+/g, ' ').trim();
      const inf: PhaseInference = inferPhaseFromText(text);

      // Only upgrade when the inference is strictly stronger than the
      // adapter's default (`solicitation` @ 0.5). Equivalent inferences
      // (solicitation @ ≤0.5) are not "upgrades".
      const isUpgrade =
        inf.phase !== 'solicitation' || inf.confidence > 0.5;

      if (isUpgrade) {
        const postedDate = args.posted_dates?.[url] ?? null;
        const bwo = applyBuyWindowAging(inf.phase, postedDate);
        upgrades.set(url, {
          phase: inf.phase,
          confidence: inf.confidence,
          buy_window_open: bwo,
          evidence: inf.signals[0]?.text ?? '',
        });
        outcomes.push({
          url,
          ok: true,
          upgraded_phase: inf.phase,
          confidence: inf.confidence,
          evidence: inf.signals[0]?.text ?? null,
        });
      } else {
        outcomes.push({
          url,
          ok: true,
          upgraded_phase: null,
          confidence: null,
          evidence: null,
        });
      }
      await new Promise((r) => setTimeout(r, delayMs));
    } catch (err) {
      outcomes.push({
        url,
        ok: false,
        upgraded_phase: null,
        confidence: null,
        evidence: null,
        error: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      });
    }
  }

  return { upgrades, outcomes };
}

/**
 * Adapter convenience — apply an enrichment upgrade onto the raw_payload of
 * an opportunity so the orchestrator's writer / verifier downstream sees the
 * upgraded phase. Returns the new raw_payload object (does not mutate input).
 */
export function applyEnrichmentToPayload(
  payload: Record<string, unknown>,
  upgrade: { phase: BidLifecyclePhase; confidence: number; buy_window_open: boolean; evidence: string },
): Record<string, unknown> {
  return {
    ...payload,
    project_stage: upgrade.phase,
    phase_confidence: upgrade.confidence,
    buy_window_open: upgrade.buy_window_open,
    phase_signal_evidence: upgrade.evidence,
  };
}

export type { BidLifecyclePhase };
