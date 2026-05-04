// Multi-tenant customer client (Phase 1 / Stream M3 + 2026-05-04 persistence).
//
// Reads + writes for `pathfinder.organizations`. Until Pathfinder ships the
// schema (see MEMORY/operator-todos/2026-05-04-pathfinder-needs-organizations-schema.md),
// the write path falls back to localStorage so the demo flow stays continuous.
//
// Modes:
//   - `VITE_CUSTOMER_PERSISTENCE_ENABLED=true` AND `VITE_PATHFINDER_API_URL` set:
//     real path — POST/GET against Pathfinder's /api/organizations.
//   - Otherwise: mock-mode — merges `customersMock` with locally-persisted
//     orgs in `localStorage`. Slug uniqueness still enforced.
//
// Health rollups (`getOrgHealth`) continue to gate on `VITE_PATHFINDER_DB_ENABLED`
// and read from `pathfinder.*` directly via Supabase anon client.

import { getSupabase } from './supabase';
import type {
  CreateCustomerOrgInput,
  CustomerOrg,
  OrgHealthRollup,
} from './contracts/customers';
import { SlugConflictError } from './contracts/customers';
import { customersMock, customerHealthMock } from '../data/mocks';

const LOCAL_STORAGE_KEY = 'unicron.customer_orgs.local';

const KNOWN_ORGS: CustomerOrg[] = [
  {
    id: 'zedcor',
    slug: 'zedcor',
    display_name: 'Zedcor Security Solutions',
    status: 'active',
    onboarded_at: '2026-04-01T00:00:00.000Z',
    primary_contact_email: 'ops@zedcor.example.com',
    architecture: null,
  },
];

function dbEnabled(): boolean {
  return import.meta.env.VITE_PATHFINDER_DB_ENABLED === 'true';
}

export function customerPersistenceEnabled(): boolean {
  return (
    import.meta.env.VITE_CUSTOMER_PERSISTENCE_ENABLED === 'true' &&
    Boolean(pathfinderApiUrl())
  );
}

function pathfinderApiUrl(): string | undefined {
  const url = import.meta.env.VITE_PATHFINDER_API_URL as string | undefined;
  return url && url.length > 0 ? url.replace(/\/$/, '') : undefined;
}

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/** Convert an arbitrary name to a candidate slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Validate a slug. Returns null if valid; otherwise an error string. */
export function validateSlug(slug: string, existing: string[]): string | null {
  if (!slug) return 'Slug is required';
  if (!SLUG_PATTERN.test(slug)) {
    return 'Slug must be lowercase letters, numbers, or hyphens (2-40 chars)';
  }
  if (existing.includes(slug)) return `Slug "${slug}" is already taken`;
  return null;
}

function readLocalOrgs(): CustomerOrg[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomerOrg[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalOrgs(orgs: CustomerOrg[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(orgs));
  } catch {
    // localStorage may be unavailable (private mode, quota); the in-memory
    // demo continues without persistence.
  }
}

/** Test seam — clears the localStorage scratch list. */
export function __resetLocalCustomerOrgsForTests(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch {
    /* noop */
  }
}

/**
 * Returns the list of customer orgs metacron operates.
 *
 * Real-mode (`customerPersistenceEnabled()`): GET Pathfinder /api/organizations.
 * Mock-mode: merges `customersMock` (or KNOWN_ORGS when DB flag set) with any
 * localStorage-persisted orgs from prior Approve & Deploy runs.
 */
export async function listCustomerOrgs(): Promise<CustomerOrg[]> {
  if (customerPersistenceEnabled()) {
    const base = pathfinderApiUrl()!;
    const res = await fetch(`${base}/api/organizations`, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Organizations API ${res.status}: ${body || res.statusText}`);
    }
    return (await res.json()) as CustomerOrg[];
  }

  await new Promise((r) => setTimeout(r, 100));
  const base = dbEnabled() ? KNOWN_ORGS : customersMock;
  const local = readLocalOrgs();
  const seen = new Set(base.map((o) => o.slug));
  return [...base, ...local.filter((o) => !seen.has(o.slug))];
}

/** Fetch one org by slug. Returns null on 404 / unknown. */
export async function getCustomerOrgBySlug(
  slug: string,
): Promise<CustomerOrg | null> {
  if (customerPersistenceEnabled()) {
    const base = pathfinderApiUrl()!;
    const res = await fetch(
      `${base}/api/organizations/${encodeURIComponent(slug)}`,
      { method: 'GET', headers: { accept: 'application/json' } },
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Organizations API ${res.status}: ${body || res.statusText}`);
    }
    return (await res.json()) as CustomerOrg;
  }

  const all = await listCustomerOrgs();
  return all.find((o) => o.slug === slug) ?? null;
}

/**
 * Persist a newly-onboarded customer org. Throws SlugConflictError on collision.
 *
 * Real-mode: POST `/api/organizations`. 409 → SlugConflictError.
 * Mock-mode: append to localStorage. Pre-flight slug check throws on collision.
 */
export async function createCustomerOrg(
  input: CreateCustomerOrgInput,
): Promise<CustomerOrg> {
  const slug = input.slug.trim();
  const existing = await listCustomerOrgs();
  if (existing.some((o) => o.slug === slug)) {
    throw new SlugConflictError(slug);
  }

  if (customerPersistenceEnabled()) {
    const base = pathfinderApiUrl()!;
    const res = await fetch(`${base}/api/organizations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        name: input.name,
        slug,
        customer_org_id: slug,
        architecture: input.architecture ?? {},
        primary_contact_email: input.primary_contact_email,
      }),
    });
    if (res.status === 409) throw new SlugConflictError(slug);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Organizations API ${res.status}: ${body || res.statusText}`);
    }
    return (await res.json()) as CustomerOrg;
  }

  // Mock-mode persistence: localStorage continuity for the demo.
  const row: CustomerOrg = {
    id: slug,
    slug,
    display_name: input.name,
    status: 'onboarding',
    onboarded_at: new Date().toISOString(),
    primary_contact_email: input.primary_contact_email,
    architecture: input.architecture,
  };
  const local = readLocalOrgs();
  writeLocalOrgs([...local, row]);
  return row;
}

/**
 * Per-org health rollup — trailing 7d / 30d windows. Issues a small set of
 * SELECT queries against `pathfinder.projects` + `pathfinder.agent_log` +
 * `pathfinder.outreach_drafts` / `outreach_sends` and `pathfinder.data_sources`.
 *
 * Mock-mode returns the customerHealthMock fixture which mirrors the live
 * shape so the dashboard renders identically without Supabase access.
 */
export async function getOrgHealth(orgId: string): Promise<OrgHealthRollup> {
  if (!dbEnabled()) {
    await new Promise((r) => setTimeout(r, 150));
    return { ...customerHealthMock, org_id: orgId };
  }

  const supabase = getSupabase();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [leadsRes, errorsRes, sourcesRes] = await Promise.all([
    supabase
      .schema('pathfinder')
      .from('projects')
      .select('created_at, score')
      .eq('customer_org_id', orgId)
      .gte('created_at', since30d),
    supabase
      .schema('pathfinder')
      .from('agent_log')
      .select('agent_name, message, created_at, level')
      .eq('customer_org_id', orgId)
      .eq('level', 'error')
      .gte('created_at', since30d)
      .order('created_at', { ascending: false }),
    supabase
      .schema('pathfinder')
      .from('data_sources')
      .select('id, type, label, jurisdiction')
      .eq('customer_org_id', orgId)
      .eq('enabled', true),
  ]);

  if (leadsRes.error) throw leadsRes.error;
  if (errorsRes.error) throw errorsRes.error;
  if (sourcesRes.error) throw sourcesRes.error;

  const leads = (leadsRes.data ?? []) as { created_at: string; score: number | null }[];
  const errors = (errorsRes.data ?? []) as {
    agent_name: string;
    message: string;
    created_at: string;
  }[];
  const sources = (sourcesRes.data ?? []) as {
    id: string;
    type: string;
    label: string;
    jurisdiction: string | null;
  }[];

  const lead_volume_30d = bucketByDay(leads.map((l) => l.created_at), 30);
  const error_volume_30d = bucketByDay(errors.map((e) => e.created_at), 30);

  const lead_volume_7d_total = lead_volume_30d.slice(-7).reduce((a, b) => a + b, 0);
  const error_total_7d = error_volume_30d.slice(-7).reduce((a, b) => a + b, 0);
  const since7dDate = new Date(since7d);
  const high_score_7d = leads.filter(
    (l) => new Date(l.created_at) >= since7dDate && (l.score ?? 0) >= 80,
  ).length;
  const high_score_rate_7d =
    lead_volume_7d_total > 0 ? high_score_7d / lead_volume_7d_total : 0;

  return {
    org_id: orgId,
    lead_volume_30d,
    lead_volume_7d_total,
    lead_volume_30d_total: leads.length,
    high_score_rate_7d,
    // Outreach delivery requires a separate query; deferred until the dashboard
    // has a confirmed outreach table shape. Returning a placeholder for now —
    // dashboard guards against nulls/zero.
    outreach_delivery_rate_7d: 0,
    error_volume_30d,
    error_total_7d,
    error_rate_7d: lead_volume_7d_total > 0 ? error_total_7d / lead_volume_7d_total : 0,
    recent_errors: errors.slice(0, 10),
    active_sources: sources,
  };
}

/** Bucket ISO timestamps into N daily buckets ending today, oldest → newest. */
function bucketByDay(timestamps: string[], days: number): number[] {
  const buckets = new Array(days).fill(0);
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  for (const t of timestamps) {
    const ms = Date.parse(t);
    if (Number.isNaN(ms)) continue;
    const ageDays = Math.floor((now - ms) / dayMs);
    if (ageDays < 0 || ageDays >= days) continue;
    buckets[days - 1 - ageDays] += 1;
  }
  return buckets;
}
