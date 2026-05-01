// lib/adapters/json-dump.ts — Tier 1 static JSON / JSONL dump adapter.
//
// For sources that publish a static URL pointing at a JSON array dump or a
// newline-delimited JSON file. Examples: federal contract bulk JSON dumps,
// state-level open-data JSON exports, GitHub-hosted public registries.
//
// This is the simplest Tier 1 type — fetch once, parse, normalize. No
// pagination concerns because the URL itself is the cursor.

import type { Adapter, AdapterRuntimeConfig, NormalizedEvent } from './types';
import { validateNormalizedEvent } from './socrata';

export interface JsonDumpRecord {
  [key: string]: unknown;
}

interface JsonDumpRuntimeConfig extends AdapterRuntimeConfig {
  format?: 'json' | 'jsonl';        // default auto-detect
  results_path?: string;             // dot path into JSON
  id_field?: string;
  timestamp_field?: string;
  max_records?: number;              // safety cap
}

const DEFAULT_MAX_RECORDS = 5000;

function dig(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else return undefined;
  }
  return cur;
}

function parseJsonl(text: string, max: number): JsonDumpRecord[] {
  const out: JsonDumpRecord[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t);
      if (obj && typeof obj === 'object') out.push(obj as JsonDumpRecord);
    } catch {
      // skip malformed lines
    }
    if (out.length >= max) break;
  }
  return out;
}

export const jsonDumpAdapter: Adapter<JsonDumpRecord> = {
  kind: 'json-dump',

  async poll(config) {
    const cfg = config as JsonDumpRuntimeConfig;
    const headers: Record<string, string> = {
      Accept: 'application/json, application/x-ndjson, application/jsonl',
      ...(config.headers ?? {}),
    };
    const res = await fetch(config.endpoint, { method: 'GET', headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '<unreadable>');
      throw new Error(`json-dump fetch failed status=${res.status} body=${text.slice(0, 200)}`);
    }
    const text = await res.text();
    const max = cfg.max_records ?? DEFAULT_MAX_RECORDS;
    const looksJsonl =
      cfg.format === 'jsonl' || (cfg.format !== 'json' && /^\s*\{/.test(text) && /\n\s*\{/.test(text));
    if (looksJsonl) return parseJsonl(text, max);

    const json = JSON.parse(text);
    let arr: unknown = json;
    if (cfg.results_path) arr = dig(json, cfg.results_path);
    if (!Array.isArray(arr) && json && typeof json === 'object') {
      const obj = json as Record<string, unknown>;
      for (const key of ['results', 'data', 'items', 'records', 'entries']) {
        if (Array.isArray(obj[key])) {
          arr = obj[key];
          break;
        }
      }
    }
    if (!Array.isArray(arr)) {
      throw new Error('json-dump response did not produce an array');
    }
    return (arr as JsonDumpRecord[]).slice(0, max);
  },

  normalize(raw, config) {
    const cfg = config as JsonDumpRuntimeConfig;
    const idKey = cfg.id_field;
    const tsKey = cfg.timestamp_field;
    const id = idKey && raw[idKey] != null ? String(raw[idKey]) : firstStringValue(raw, ['id', 'uuid', 'event_id']);
    const tsRaw = tsKey ? raw[tsKey] : firstStringValue(raw, ['timestamp', 'created_at', 'updated_at', 'date']);
    const ts =
      typeof tsRaw === 'string' && Number.isFinite(Date.parse(tsRaw))
        ? new Date(tsRaw).toISOString()
        : new Date().toISOString();
    return {
      source_event_id: id ?? '',
      timestamp: ts,
      source_url: config.endpoint,
      jurisdiction: config.jurisdiction ?? 'unknown',
      raw_text: firstStringValue(raw, ['description', 'summary', 'title', 'name']),
      metadata: raw,
    } as NormalizedEvent;
  },

  validate(event) {
    return validateNormalizedEvent(event);
  },
};

function firstStringValue(raw: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return undefined;
}
