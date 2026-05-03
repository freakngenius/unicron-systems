// services/contact-enricher/providers/apollo.ts — Demo Polish UX Gate 8B.
//
// Apollo.io fallback enricher. Used when Clay returns < 3 contacts or
// returns null email/phone for everything. Calls Apollo's mixed_people
// search endpoint with company-name + seniority filter.
//
// Auth: x-api-key: ${APOLLO_API_KEY}. Missing → returns
// { contacts: [], authoritative: false }.

import { recordProviderCall } from '../cost-recorder';
import type {
  ContactEnricher,
  EnrichRequest,
  EnrichResult,
  EnrichedContact,
  Seniority,
} from './types';
import { classifySeniority } from '@/lib/contacts/role-classification';

const DEFAULT_BASE_URL = 'https://api.apollo.io/api/v1';
const DEFAULT_TIMEOUT_MS = 30_000;
// Apollo charges per credit; one people-search call typically consumes
// a small number depending on whether email/phone reveal is requested.
const DEFAULT_COST_PER_RUN_USD = 0.04;

interface ApolloOrganization {
  name?: string;
}

interface ApolloPerson {
  name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  seniority?: string;
  email?: string;
  email_status?: string;
  organization?: ApolloOrganization;
  phone_numbers?: Array<{ raw_number?: string; type?: string }>;
  linkedin_url?: string;
}

interface ApolloSearchResponse {
  people?: ApolloPerson[];
  pagination?: { total_entries?: number };
}

export interface ApolloConfig {
  apiKey: string;
  baseUrl: string;
  costPerRunUsd: number;
  timeoutMs: number;
}

export function readApolloConfig(): ApolloConfig | null {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return null;
  const baseUrl = process.env.APOLLO_API_BASE_URL || DEFAULT_BASE_URL;
  const costRaw = process.env.APOLLO_COST_PER_RUN_USD;
  const cost =
    costRaw && Number.isFinite(Number(costRaw))
      ? Number(costRaw)
      : DEFAULT_COST_PER_RUN_USD;
  return {
    apiKey,
    baseUrl,
    costPerRunUsd: cost,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

function apolloSeniorityFilter(): string[] {
  // Spec § Enrichment logic — bias toward signer/influencer-tier roles.
  // Apollo's seniority taxonomy: owner, founder, c_suite, partner, vp,
  // head, director, manager, senior, entry, intern.
  return ['c_suite', 'vp', 'head', 'director', 'manager'];
}

export function parseApolloResponse(
  json: unknown,
  req: EnrichRequest,
): EnrichedContact[] {
  if (!json || typeof json !== 'object') return [];
  const body = json as ApolloSearchResponse;
  const rows = Array.isArray(body.people) ? body.people : [];
  const out: EnrichedContact[] = [];
  for (const p of rows) {
    const name =
      (p.name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`).trim();
    if (!name) continue;
    const role = p.title ?? null;
    const seniority: Seniority = classifySeniority(role);
    const phone = p.phone_numbers?.[0]?.raw_number ?? null;
    const phoneTypeRaw = p.phone_numbers?.[0]?.type ?? null;
    const phoneType = phone
      ? phoneTypeRaw === 'mobile'
        ? 'mobile'
        : phoneTypeRaw === 'direct_phone'
          ? 'direct'
          : phoneTypeRaw === 'office'
            ? 'switchboard'
            : 'unknown'
      : null;
    // Apollo's email_status taxonomy: verified | guessed | unverified |
    // unavailable. Map to our 4-value enum.
    const emailStatus = p.email
      ? p.email_status === 'verified'
        ? 'verified'
        : p.email_status === 'guessed'
          ? 'guessed'
          : 'unknown'
      : null;
    out.push({
      project_id: req.project_id,
      owner_organization: req.owner_organization,
      contact_name: name,
      role,
      seniority,
      email: p.email ?? null,
      email_status: emailStatus,
      phone,
      phone_type: phoneType,
      linkedin_url: p.linkedin_url ?? null,
      source: 'apollo',
      // Apollo doesn't expose a confidence score on people search; absent
      // a signal we leave null. The UI's "Show low-confidence" toggle
      // treats null as "no signal" rather than low-conf.
      source_confidence: null,
    });
  }
  return out;
}

export class ApolloContactEnricher implements ContactEnricher {
  readonly provider = 'apollo' as const;

  constructor(private readonly config: ApolloConfig | null = readApolloConfig()) {}

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
    const url = `${this.config.baseUrl}/mixed_people/search`;
    const body = {
      api_key: this.config.apiKey,
      q_organization_name: req.owner_organization,
      person_seniorities: apolloSeniorityFilter(),
      page: 1,
      per_page: Math.max(1, req.max_contacts ?? 5),
    };
    let json: unknown = null;
    let authoritative = true;
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), this.config.timeoutMs);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'x-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        authoritative = res.status >= 500;
        json = null;
      } else {
        json = await res.json().catch(() => null);
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
    const contacts = parseApolloResponse(json, req);
    return {
      contacts,
      meta: {
        provider: this.provider,
        cost_usd: cost,
        latency_ms: latency,
        raw_request_id: null,
      },
      authoritative,
    };
  }
}
