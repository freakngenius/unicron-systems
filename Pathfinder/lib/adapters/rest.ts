// lib/adapters/rest.ts — Tier 1 generic REST/JSON adapter.
//
// Catches the long tail of public REST APIs that return JSON arrays or
// `{results: [...]}` envelopes. Auth via API-key header, API-key query, or
// none. Pagination via page/offset (page_size) — link-header pagination is
// best-effort. The adapter generation flow may produce a more specific
// adapter; this module is the safe default that the onboarder reaches for
// when no specialized adapter applies.

import type { Adapter, AdapterRuntimeConfig, NormalizedEvent } from './types';
import { validateNormalizedEvent } from './socrata';

export interface RestRecord {
  [key: string]: unknown;
}

interface RestRuntimeConfig extends AdapterRuntimeConfig {
  results_path?: string;             // dot path into JSON (e.g. 'data.results')
  id_field?: string;                 // override for source_event_id
  timestamp_field?: string;          // override
  auth_pattern?: 'none' | 'api_key_query' | 'api_key_header' | 'bearer';
  api_key_query_param?: string;      // when auth_pattern === 'api_key_query'
  api_key_header_name?: string;      // when auth_pattern === 'api_key_header'
}

const DEFAULT_PAGE_SIZE = 100;

function resolveAuth(config: RestRuntimeConfig): {
  headers: Record<string, string>;
  url: URL;
} {
  const url = new URL(config.endpoint);
  if (config.query) {
    for (const [k, v] of Object.entries(config.query)) {
      url.searchParams.set(k, String(v));
    }
  }
  url.searchParams.set('limit', String(config.page_size ?? DEFAULT_PAGE_SIZE));
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(config.headers ?? {}),
  };
  const apiKey = config.api_key_env ? process.env[config.api_key_env] : undefined;
  if (apiKey && config.auth_pattern === 'api_key_query') {
    url.searchParams.set(config.api_key_query_param ?? 'api_key', apiKey);
  } else if (apiKey && config.auth_pattern === 'api_key_header') {
    headers[config.api_key_header_name ?? 'X-API-Key'] = apiKey;
  } else if (apiKey && config.auth_pattern === 'bearer') {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return { headers, url };
}

function dig(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

function extractRecords(json: unknown, resultsPath?: string): RestRecord[] {
  if (resultsPath) {
    const v = dig(json, resultsPath);
    if (Array.isArray(v)) return v as RestRecord[];
  }
  if (Array.isArray(json)) return json as RestRecord[];
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    for (const key of ['results', 'data', 'items', 'records', 'entries']) {
      if (Array.isArray(obj[key])) return obj[key] as RestRecord[];
    }
  }
  throw new Error('rest adapter could not locate records array in response');
}

function pickTimestamp(raw: Record<string, unknown>, override?: string): string | undefined {
  const candidates = override
    ? [override]
    : [
        'created_at',
        'updated_at',
        'timestamp',
        'date',
        'posted_at',
        'posted_date',
        'issued_at',
        'created',
        'modified',
      ];
  for (const k of candidates) {
    const v = raw[k];
    if (typeof v === 'string') {
      const parsed = Date.parse(v);
      if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    }
    if (typeof v === 'number' && v > 1_000_000_000) {
      // unix seconds
      const parsed = v < 1e12 ? v * 1000 : v;
      return new Date(parsed).toISOString();
    }
  }
  return undefined;
}

function pickId(raw: Record<string, unknown>, override?: string): string | undefined {
  if (override && raw[override] != null) return String(raw[override]);
  for (const k of ['id', 'uuid', 'event_id', 'record_id', 'source_id']) {
    if (raw[k] != null) return String(raw[k]);
  }
  return undefined;
}

export const restAdapter: Adapter<RestRecord> = {
  kind: 'rest',

  async poll(config) {
    const cfg = config as RestRuntimeConfig;
    const { headers, url } = resolveAuth(cfg);
    const res = await fetch(url.toString(), { method: 'GET', headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '<unreadable>');
      throw new Error(`rest fetch failed status=${res.status} body=${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as unknown;
    return extractRecords(json, cfg.results_path);
  },

  normalize(raw, config) {
    const cfg = config as RestRuntimeConfig;
    const id = pickId(raw, cfg.id_field) ?? '';
    const ts = pickTimestamp(raw, cfg.timestamp_field) ?? new Date().toISOString();
    const summary = stringField(raw, ['description', 'summary', 'title', 'name', 'text']);
    return {
      source_event_id: id,
      timestamp: ts,
      source_url: config.endpoint,
      jurisdiction: config.jurisdiction ?? 'unknown',
      raw_text: summary ?? undefined,
      metadata: raw,
    } as NormalizedEvent;
  },

  validate(event) {
    return validateNormalizedEvent(event);
  },
};

function stringField(raw: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return undefined;
}
