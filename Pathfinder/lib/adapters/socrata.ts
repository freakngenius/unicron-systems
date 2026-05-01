// lib/adapters/socrata.ts — Tier 1 Socrata adapter.
//
// Socrata Open Data API (`https://<host>/resource/<dataset>.json`). Conforms
// to the SODA 2.0 surface used by data.cityofnewyork.us, data.sfgov.org,
// data.sacramento.gov, etc. Pagination via $limit + $offset; auth optional
// via X-App-Token header (rate-limit lifted when present).
//
// Spec: SPEC - Source Onboarder Agent.md §5,§7. Stream README §"Tier 1 only:
// Socrata, REST APIs (JSON-paginated), RSS feeds, JSON dumps."

import type { Adapter, AdapterRuntimeConfig, NormalizedEvent, ValidationResult } from './types';

export interface SocrataRecord {
  // Socrata records are loose JSON objects keyed by column name. Common columns
  // observed across permit / lien / RFP datasets:
  [key: string]: unknown;
}

const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_LOOKBACK_SECONDS = 24 * 60 * 60; // last 24 hours by default

function appToken(config: AdapterRuntimeConfig): string | undefined {
  const envName = config.api_key_env;
  if (envName && process.env[envName]) return process.env[envName];
  return undefined;
}

function buildUrl(config: AdapterRuntimeConfig): string {
  const url = new URL(config.endpoint);
  const limit = config.page_size ?? DEFAULT_PAGE_SIZE;
  url.searchParams.set('$limit', String(limit));
  if (config.query) {
    for (const [k, v] of Object.entries(config.query)) {
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export const socrataAdapter: Adapter<SocrataRecord> = {
  kind: 'socrata',

  async poll(config) {
    const token = appToken(config);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(config.headers ?? {}),
    };
    if (token) headers['X-App-Token'] = token;

    const url = buildUrl(config);
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '<unreadable>');
      throw new Error(`socrata fetch failed status=${res.status} body=${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json)) {
      throw new Error('socrata response was not a JSON array');
    }
    return json as SocrataRecord[];
  },

  normalize(raw, config) {
    const sourceEventId = String(
      raw.id ??
        raw.permit_number ??
        raw.case_number ??
        raw.uniqueid ??
        raw.objectid ??
        // SODA exposes :id as a system column
        (raw as Record<string, unknown>)[':id'] ??
        ''
    );
    const ts =
      pickTimestamp(raw) ?? new Date().toISOString();
    const value = pickNumeric(raw, [
      'estimated_cost',
      'project_cost',
      'declared_valuation',
      'estimated_project_cost',
      'amount',
    ]);
    const projectType = pickString(raw, [
      'permit_type',
      'application_type',
      'work_type',
      'description',
      'job_type',
    ]);
    const lat = pickNumeric(raw, ['latitude', 'lat', 'y']);
    const lng = pickNumeric(raw, ['longitude', 'lng', 'long', 'x']);
    const address = pickString(raw, ['address', 'street_address', 'project_address', 'house_address']);
    const city = pickString(raw, ['city', 'municipality']);
    const state = pickString(raw, ['state', 'state_code']) ?? config.jurisdiction;
    const gc = pickString(raw, ['contractor', 'contractor_name', 'general_contractor', 'gc_name', 'company_name']);
    const summary = pickString(raw, ['description', 'summary', 'work_description', 'project_description']);

    return {
      source_event_id: sourceEventId,
      timestamp: ts,
      source_url: config.endpoint,
      jurisdiction: config.jurisdiction ?? 'unknown',
      raw_text: summary ?? undefined,
      project_value: value ?? undefined,
      project_type: projectType ?? undefined,
      location:
        address || city || state || lat != null || lng != null
          ? {
              address: address ?? undefined,
              city: city ?? undefined,
              state: state ?? undefined,
              lat: lat ?? undefined,
              lng: lng ?? undefined,
            }
          : undefined,
      gc_name: gc ?? undefined,
      metadata: raw as Record<string, unknown>,
    };
  },

  validate(event) {
    return validateNormalizedEvent(event);
  },
};

// ----- shared helpers (also used by other Tier 1 adapters) ---------------

export function validateNormalizedEvent(event: NormalizedEvent): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!event.source_event_id) errors.push('source_event_id is required');
  if (!event.timestamp) errors.push('timestamp is required');
  if (!event.source_url) errors.push('source_url is required');
  if (!event.jurisdiction) errors.push('jurisdiction is required');
  if (event.timestamp && Number.isNaN(Date.parse(event.timestamp))) {
    errors.push(`timestamp is not parseable: ${event.timestamp}`);
  }
  if (event.project_value != null && !Number.isFinite(event.project_value)) {
    errors.push('project_value must be a finite number when present');
  }
  if (!event.raw_text) warnings.push('raw_text missing — qualifier will have less to work with');
  return { ok: errors.length === 0, errors, warnings };
}

function pickString(raw: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return undefined;
}

function pickNumeric(raw: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function pickTimestamp(raw: Record<string, unknown>): string | undefined {
  const candidates = [
    'issue_date',
    'issued_date',
    'application_date',
    'filing_date',
    'permit_date',
    'created_at',
    'created_date',
    'updated_at',
    'updated_date',
    'date',
    'posted_date',
    'recorded_date',
    'awarded_date',
  ];
  for (const k of candidates) {
    const v = raw[k];
    if (typeof v === 'string') {
      const parsed = Date.parse(v);
      if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    }
  }
  return undefined;
}
