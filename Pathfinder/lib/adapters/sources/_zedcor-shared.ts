// lib/adapters/sources/_zedcor-shared.ts
//
// Sprint Z1A — shared helpers for the 10 Zedcor Houston source adapters.
// Each adapter (houston-obo, harris-county-bonfire, ...) reuses these
// utilities so adapter files stay thin and policy lives in one place.

import * as cheerio from 'cheerio';
import type { SourceEvent } from './types';

export const ZEDCOR_UA =
  'PathfinderZedcor/1.0 (Houston procurement crawler; kyle@freakngenius.com)';

export const FETCH_TIMEOUT_MS = 15_000;
export const MAX_CANDIDATES_PER_SOURCE = 50;

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
