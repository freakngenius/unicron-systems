// lib/adapters/zedcor/external-contact-resolver.ts
//
// Sprint Z7 — Three-layer contact resolver.
//
//   Layer 1: Hunter.io domain-search (HUNTER_API_KEY)
//   Layer 2: Apollo.io mixed_people/search (APOLLO_API_KEY)
//   Layer 3: pathfinder.lib/adapters/zedcor/email-pattern-guesser
//
// Each layer is skipped gracefully when its env var is missing or when
// the monthly-quota throttle (80% threshold) trips. Layer 3 always
// runs, since it costs nothing but a DNS lookup.
//
// Spec: Specs/SPEC-zedcor-z7-contact-resolver.md §"Three-layer resolver".

import {
  isProviderThrottled,
  logApiUsage,
  readContactCache,
  writeContactCache,
  type CachedContact,
  type ResolverSource,
} from './contact-cache';
import { guessContactEmail } from './email-pattern-guesser';

export interface ResolvedContact {
  contact_name: string | null;
  contact_role: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  source: ResolverSource | 'cache' | null;
  confidence: number;
  layer: 1 | 2 | 3 | null;
}

const EMPTY: ResolvedContact = {
  contact_name: null,
  contact_role: null,
  contact_email: null,
  contact_phone: null,
  source: null,
  confidence: 0,
  layer: null,
};

const TARGET_ROLE_PATTERN =
  /(project\s+manager|construction|procure|subcontract|operations|estimating|preconstruction|business\s+develop)/i;

interface HunterEmail {
  value: string;
  type?: string;
  confidence?: number;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  phone_number?: string | null;
}

interface HunterResponse {
  data?: {
    domain?: string | null;
    emails?: HunterEmail[];
  };
}

async function resolveViaHunter(
  companyName: string,
  context: Record<string, unknown>,
): Promise<ResolvedContact | null> {
  const key = process.env.HUNTER_API_KEY;
  if (!key) return null;
  if (await isProviderThrottled('hunter')) return null;

  // Hunter's domain-search accepts a `company` parameter; it'll resolve
  // the domain itself. Filter the result to executive/management roles.
  const url = new URL('https://api.hunter.io/v2/domain-search');
  url.searchParams.set('company', companyName);
  url.searchParams.set('type', 'executive');
  url.searchParams.set('limit', '10');
  url.searchParams.set('api_key', key);

  let body: HunterResponse;
  try {
    const res = await fetch(url.toString(), { method: 'GET' });
    if (!res.ok) return null;
    body = (await res.json()) as HunterResponse;
  } catch {
    return null;
  } finally {
    // Charge usage whether the call hit or missed — Hunter counts both.
    await logApiUsage('hunter', 1, context).catch(() => undefined);
  }

  const emails = body.data?.emails ?? [];
  if (emails.length === 0) return null;

  const ranked = emails
    .filter((e) => !!e.value)
    .sort((a, b) => {
      const aMatch = TARGET_ROLE_PATTERN.test(a.position ?? '') ? 1 : 0;
      const bMatch = TARGET_ROLE_PATTERN.test(b.position ?? '') ? 1 : 0;
      if (aMatch !== bMatch) return bMatch - aMatch;
      return (b.confidence ?? 0) - (a.confidence ?? 0);
    });

  const top = ranked[0];
  if (!top) return null;

  return {
    contact_name: [top.first_name, top.last_name].filter(Boolean).join(' ').trim() || null,
    contact_role: top.position ?? null,
    contact_email: top.value,
    contact_phone: top.phone_number ?? null,
    source: 'hunter',
    confidence: typeof top.confidence === 'number' ? Math.min(1, top.confidence / 100) : 0.7,
    layer: 1,
  };
}

interface ApolloPerson {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  email?: string | null;
  email_status?: string | null;
  organization?: { name?: string | null; primary_domain?: string | null } | null;
  phone_numbers?: Array<{ raw_number?: string | null; sanitized_number?: string | null }>;
}

interface ApolloResponse {
  people?: ApolloPerson[];
}

async function resolveViaApollo(
  companyName: string,
  context: Record<string, unknown>,
): Promise<ResolvedContact | null> {
  const key = process.env.APOLLO_API_KEY;
  if (!key) return null;
  if (await isProviderThrottled('apollo')) return null;

  let body: ApolloResponse;
  try {
    const res = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': key,
      },
      body: JSON.stringify({
        q_organization_name: companyName,
        person_titles: [
          'Project Manager',
          'Construction Manager',
          'Procurement',
          'Subcontract Administrator',
          'Operations Manager',
          'Estimating',
          'Preconstruction',
        ],
        page: 1,
        per_page: 5,
      }),
    });
    if (!res.ok) return null;
    body = (await res.json()) as ApolloResponse;
  } catch {
    return null;
  } finally {
    await logApiUsage('apollo', 1, context).catch(() => undefined);
  }

  const people = body.people ?? [];
  if (people.length === 0) return null;

  // Prefer rows with a verified email.
  const ranked = [...people].sort((a, b) => {
    const aOk = a.email_status === 'verified' ? 1 : 0;
    const bOk = b.email_status === 'verified' ? 1 : 0;
    return bOk - aOk;
  });

  const top = ranked[0];
  if (!top || !top.email) return null;

  const phone =
    top.phone_numbers?.[0]?.sanitized_number ?? top.phone_numbers?.[0]?.raw_number ?? null;

  return {
    contact_name: top.name ?? ([top.first_name, top.last_name].filter(Boolean).join(' ').trim() || null),
    contact_role: top.title ?? null,
    contact_email: top.email,
    contact_phone: phone,
    source: 'apollo',
    confidence: top.email_status === 'verified' ? 0.8 : 0.5,
    layer: 2,
  };
}

async function resolveViaPattern(companyName: string): Promise<ResolvedContact | null> {
  const guess = await guessContactEmail(companyName);
  if (!guess.email) return null;
  return {
    contact_name: 'Project Manager',
    contact_role: 'Project Manager',
    contact_email: guess.email,
    contact_phone: null,
    source: 'pattern',
    confidence: guess.confidence,
    layer: 3,
  };
}

function cacheRowToResolved(row: CachedContact): ResolvedContact {
  const layer: 1 | 2 | 3 | null =
    row.source === 'hunter' ? 1 : row.source === 'apollo' ? 2 : row.source === 'pattern' ? 3 : null;
  return {
    contact_name: row.contact_name,
    contact_role: row.contact_role,
    contact_email: row.contact_email,
    contact_phone: null,
    source: 'cache',
    confidence: row.confidence ?? 0,
    layer,
  };
}

/**
 * Public entry point used by the orchestrator + backfill.
 *
 * Order of operations:
 *   1. 90-day cache.
 *   2. Layer 1 — Hunter (if HUNTER_API_KEY + under quota).
 *   3. Layer 2 — Apollo (if APOLLO_API_KEY + under quota).
 *   4. Layer 3 — pattern guesser (always).
 *
 * On a successful resolve we write the result back to
 * pathfinder.contact_resolution_cache so a parallel sprint or a re-run
 * of the backfill doesn't pay the API cost twice.
 */
export async function resolveExternalContact(
  companyName: string,
  context: Record<string, unknown> = {},
): Promise<ResolvedContact> {
  if (!companyName || !companyName.trim()) return EMPTY;

  // 1. Cache.
  const cached = await readContactCache(companyName);
  if (cached) return cacheRowToResolved(cached);

  // 2-4. Try each layer in order.
  const layers: Array<() => Promise<ResolvedContact | null>> = [
    () => resolveViaHunter(companyName, context),
    () => resolveViaApollo(companyName, context),
    () => resolveViaPattern(companyName),
  ];

  for (const layer of layers) {
    let result: ResolvedContact | null = null;
    try {
      result = await layer();
    } catch {
      result = null;
    }
    if (result && result.contact_email) {
      // Persist the hit so subsequent calls don't re-pay.
      if (result.source && result.source !== 'cache') {
        await writeContactCache({
          company_name: companyName,
          domain: result.contact_email.split('@')[1] ?? null,
          contact_name: result.contact_name,
          contact_email: result.contact_email,
          contact_role: result.contact_role,
          source: result.source as ResolverSource,
          confidence: result.confidence,
        }).catch(() => undefined);
      }
      return result;
    }
  }

  return EMPTY;
}
