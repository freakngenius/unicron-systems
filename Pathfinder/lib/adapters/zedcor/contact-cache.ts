// lib/adapters/zedcor/contact-cache.ts
//
// Sprint Z7 — Cache layer in front of the three-layer contact resolver.
//
// Reads + writes pathfinder.contact_resolution_cache (90-day TTL) and
// pathfinder.api_usage_log (monthly quota throttle for Hunter + Apollo).
//
// Spec: Specs/SPEC-zedcor-z7-contact-resolver.md §"File ownership" +
//       §"Soft caps".

import { supabaseAdmin } from '@/lib/supabase';

export const CACHE_TTL_DAYS = 90;

export type ResolverSource = 'hunter' | 'apollo' | 'pattern';

export interface CachedContact {
  company_name: string;
  domain: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_role: string | null;
  source: ResolverSource;
  confidence: number | null;
  cached_at: string;
}

/**
 * Normalize a company / GC name for cache lookups. Lowercased, whitespace
 * collapsed, common corporate suffixes stripped so "Acme, Inc." and
 * "ACME inc" hash to the same key.
 */
const CORPORATE_SUFFIX_RE =
  /\s+(inc|llc|llp|ltd|corp|co|company|holdings|group|construction|builders|building)\.?$/i;

export function normalizeCompanyName(name: string): string {
  let cleaned = name.trim().toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  // Strip suffixes iteratively — "Tellepsen Builders LLC" → "tellepsen builders" → "tellepsen".
  while (CORPORATE_SUFFIX_RE.test(cleaned)) {
    cleaned = cleaned.replace(CORPORATE_SUFFIX_RE, '').trim();
  }
  return cleaned;
}

/**
 * Returns the most recent cache row for this company that is still
 * within the 90-day TTL, or null if none.
 */
export async function readContactCache(companyName: string): Promise<CachedContact | null> {
  const key = normalizeCompanyName(companyName);
  if (!key) return null;
  const cutoff = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        ilike: (col: string, val: string) => {
          gte: (col: string, val: string) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: CachedContact[] | null; error: { message: string } | null }>;
            };
          };
        };
      };
    };
  };
  const { data, error } = await admin
    .from('contact_resolution_cache')
    .select('company_name, domain, contact_name, contact_email, contact_role, source, confidence, cached_at')
    .ilike('company_name', key)
    .gte('cached_at', cutoff)
    .order('cached_at', { ascending: false })
    .limit(1);
  if (error) return null;
  return data?.[0] ?? null;
}

export async function writeContactCache(row: Omit<CachedContact, 'cached_at'>): Promise<void> {
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };
  await admin.from('contact_resolution_cache').insert({
    company_name: normalizeCompanyName(row.company_name),
    domain: row.domain,
    contact_name: row.contact_name,
    contact_email: row.contact_email,
    contact_role: row.contact_role,
    source: row.source,
    confidence: row.confidence,
  });
}

/**
 * Returns the monthly unit total for a provider — sum of `units` rows
 * inserted since the first of the current UTC month.
 */
export async function getMonthlyUsage(provider: ResolverSource): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          gte: (col: string, val: string) => Promise<{ data: Array<{ units: number }> | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const { data, error } = await admin
    .from('api_usage_log')
    .select('units')
    .eq('provider', provider)
    .gte('called_at', monthStart.toISOString());
  if (error || !data) return 0;
  return data.reduce((acc, r) => acc + (r.units ?? 1), 0);
}

export async function logApiUsage(
  provider: ResolverSource,
  units: number,
  context: Record<string, unknown> | null = null,
): Promise<void> {
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };
  await admin.from('api_usage_log').insert({ provider, units, context });
}

export const PROVIDER_MONTHLY_QUOTAS = {
  hunter: 25,
  apollo: 60,
} as const;

export const QUOTA_THROTTLE_THRESHOLD = 0.8;

/**
 * True when we've hit the 80% threshold of the provider's free-tier
 * monthly quota. Caller skips the provider when true.
 */
export async function isProviderThrottled(provider: 'hunter' | 'apollo'): Promise<boolean> {
  const used = await getMonthlyUsage(provider);
  const quota = PROVIDER_MONTHLY_QUOTAS[provider];
  return used >= quota * QUOTA_THROTTLE_THRESHOLD;
}
