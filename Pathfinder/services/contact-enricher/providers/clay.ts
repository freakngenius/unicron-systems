// services/contact-enricher/providers/clay.ts — Demo Polish UX Gate 8B.
//
// Clay is the primary contact-enrichment provider. The integration model is:
//   - Operator configures a Clay workbook with the seed columns the spec
//     calls for (owner_organization, owner_type, location, naics_code,
//     prioritized_roles) plus the enrichment columns (Apollo passthrough,
//     Hunter verifier, ZoomInfo, etc.).
//   - We POST to Clay's "Run Now" endpoint with the seed payload; Clay
//     returns enriched rows synchronously (or a job id we then poll, but
//     we default to sync for simplicity).
//   - Provider parses the response into EnrichedContact[].
//
// Auth: Bearer ${CLAY_API_KEY}. Workbook: ${CLAY_WORKBOOK_ID}. Both env
// vars required; missing → returns { contacts: [], authoritative: false }
// with cost_usd: 0 so the orchestrator can fall through to Apollo without
// a hard error.
//
// Endpoint URL is configurable via CLAY_API_BASE_URL (default
// https://api.clay.com) so an operator who runs Clay through a different
// hostname can switch without a redeploy.

import { recordProviderCall } from '../cost-recorder';
import type {
  ContactEnricher,
  EnrichRequest,
  EnrichResult,
  EnrichedContact,
  EmailStatus,
  PhoneType,
  Seniority,
} from './types';
import { classifySeniority } from '@/lib/contacts/role-classification';

const DEFAULT_BASE_URL = 'https://api.clay.com';
const DEFAULT_TIMEOUT_MS = 30_000;
// Clay's per-row enrichment is metered in credits; the dollar conversion
// is workspace-specific. We use a conservative public-facing approximation
// here so the cost-summary endpoint produces useful numbers; operators
// override via CLAY_COST_PER_RUN_USD.
const DEFAULT_COST_PER_RUN_USD = 0.05;

interface ClayApiContact {
  full_name?: string;
  name?: string;
  role?: string;
  title?: string;
  email?: string;
  email_status?: 'verified' | 'guessed' | 'invalid' | 'unknown' | string;
  phone?: string;
  phone_type?: 'direct' | 'mobile' | 'switchboard' | 'unknown' | string;
  linkedin_url?: string;
  linkedin?: string;
  confidence?: number;
}

interface ClayApiResponse {
  contacts?: ClayApiContact[];
  results?: ClayApiContact[];
  request_id?: string;
}

export interface ClayConfig {
  apiKey: string;
  workbookId: string;
  baseUrl: string;
  costPerRunUsd: number;
  timeoutMs: number;
}

export function readClayConfig(): ClayConfig | null {
  const apiKey = process.env.CLAY_API_KEY;
  const workbookId = process.env.CLAY_WORKBOOK_ID;
  if (!apiKey || !workbookId) return null;
  const baseUrl = process.env.CLAY_API_BASE_URL || DEFAULT_BASE_URL;
  const costRaw = process.env.CLAY_COST_PER_RUN_USD;
  const cost =
    costRaw && Number.isFinite(Number(costRaw))
      ? Number(costRaw)
      : DEFAULT_COST_PER_RUN_USD;
  return {
    apiKey,
    workbookId,
    baseUrl,
    costPerRunUsd: cost,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

function normalizeEmailStatus(raw: string | undefined): EmailStatus | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === 'verified' || v === 'guessed' || v === 'invalid' || v === 'unknown') {
    return v;
  }
  if (v === 'valid' || v === 'deliverable') return 'verified';
  if (v === 'risky' || v === 'unverified') return 'unknown';
  if (v === 'undeliverable' || v === 'rejected') return 'invalid';
  return null;
}

function normalizePhoneType(raw: string | undefined): PhoneType | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === 'direct' || v === 'mobile' || v === 'switchboard' || v === 'unknown') {
    return v;
  }
  if (v === 'cell' || v === 'cellular') return 'mobile';
  if (v === 'office' || v === 'work') return 'direct';
  return null;
}

export function parseClayResponse(
  json: unknown,
  req: EnrichRequest,
): EnrichedContact[] {
  if (!json || typeof json !== 'object') return [];
  const body = json as ClayApiResponse;
  const rows = body.contacts ?? body.results ?? [];
  if (!Array.isArray(rows)) return [];
  const out: EnrichedContact[] = [];
  for (const row of rows) {
    const name = (row.full_name ?? row.name ?? '').trim();
    if (!name) continue;
    const role = (row.role ?? row.title ?? null) || null;
    const seniority: Seniority = classifySeniority(role);
    out.push({
      project_id: req.project_id,
      owner_organization: req.owner_organization,
      contact_name: name,
      role,
      seniority,
      email: row.email ?? null,
      email_status: row.email ? normalizeEmailStatus(row.email_status) ?? 'unknown' : null,
      phone: row.phone ?? null,
      phone_type: row.phone ? normalizePhoneType(row.phone_type) ?? 'unknown' : null,
      linkedin_url: row.linkedin_url ?? row.linkedin ?? null,
      source: 'clay',
      source_confidence:
        typeof row.confidence === 'number' && row.confidence >= 0 && row.confidence <= 1
          ? row.confidence
          : null,
    });
  }
  return out;
}

export class ClayContactEnricher implements ContactEnricher {
  readonly provider = 'clay' as const;

  constructor(private readonly config: ClayConfig | null = readClayConfig()) {}

  async enrichContacts(req: EnrichRequest): Promise<EnrichResult> {
    const startedAt = Date.now();
    if (!this.config) {
      return {
        contacts: [],
        meta: {
          provider: this.provider,
          cost_usd: 0,
          latency_ms: 0,
          raw_request_id: null,
        },
        authoritative: false,
      };
    }
    const url = `${this.config.baseUrl}/v3/workbooks/${encodeURIComponent(this.config.workbookId)}/run`;
    const body = {
      seed: {
        owner_organization: req.owner_organization,
        owner_type: req.owner_type ?? null,
        location_text: req.location_text ?? null,
        naics_code: req.naics_code ?? null,
        prioritized_roles: req.prioritized_roles ?? [],
        max_contacts: req.max_contacts ?? 5,
      },
    };
    let json: unknown = null;
    let requestId: string | null = null;
    let authoritative = true;
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), this.config.timeoutMs);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        // 4xx → credentials / config issue; the orchestrator's hard-halt
        // monitor reads `authoritative=false` to know we never got a real
        // empty result.
        authoritative = res.status >= 500;
        json = null;
      } else {
        json = await res.json().catch(() => null);
        requestId = (json && typeof json === 'object' && 'request_id' in json
          ? (json as { request_id?: string }).request_id ?? null
          : null);
      }
    } catch {
      authoritative = false;
      json = null;
    }
    const latency = Date.now() - startedAt;
    const cost = json ? this.config.costPerRunUsd : 0;
    if (cost > 0) {
      recordProviderCall({
        provider: this.provider,
        operation: 'enrich-contacts',
        costUsd: cost,
        latencyMs: latency,
        projectId: req.project_id,
      });
    }
    const contacts = parseClayResponse(json, req);
    return {
      contacts,
      meta: {
        provider: this.provider,
        cost_usd: cost,
        latency_ms: latency,
        raw_request_id: requestId,
      },
      authoritative,
    };
  }
}
