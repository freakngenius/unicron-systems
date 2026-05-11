// Multi-tenant customer client.
//
// Real-only: reads/writes go through the server-side proxy at
// /api/internal/organizations (backed by pathfinder.organizations) and
// health rollups read pathfinder.* directly via the Supabase client,
// scoping every query by organization_id (uuid) — the column landed
// in migration 20260511_phase2a_completion_org_id_rls.
//
// History note: this is the second attempt at the mock-strip refactor.
// PR #280 stripped the mock fallbacks but the replacement queries
// referenced columns that didn't exist (customer_org_id never landed
// per Phase 2A; projects.created_at + data_sources.enabled missing).
// PR #312 reverted #280; this file re-strips the fallbacks now that
// the schema actually matches.
//
// No env-flag gates. No localStorage continuity. Empty arrays mean
// empty arrays — callers handle the empty-state UX.

import { getSupabase } from './supabase';
import type {
  CreateCustomerOrgInput,
  CustomerOrg,
  OrgHealthRollup,
} from './contracts/customers';
import { SlugConflictError } from './contracts/customers';

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

/**
 * Returns the list of customer orgs metacron operates.
 * GET /api/internal/organizations — returns [] when no rows exist.
 */
export async function listCustomerOrgs(): Promise<CustomerOrg[]> {
  const res = await fetch('/api/internal/organizations', {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Organizations API ${res.status}: ${body || res.statusText}`);
  }
  return (await res.json()) as CustomerOrg[];
}

/** Fetch one org by slug. Returns null on 404 / unknown. */
export async function getCustomerOrgBySlug(
  slug: string,
): Promise<CustomerOrg | null> {
  const res = await fetch(
    `/api/internal/organizations?slug=${encodeURIComponent(slug)}`,
    { method: 'GET', headers: { accept: 'application/json' } },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Organizations API ${res.status}: ${body || res.statusText}`);
  }
  return (await res.json()) as CustomerOrg;
}

/**
 * Persist a newly-onboarded customer org. Throws SlugConflictError on collision.
 * POST /api/internal/organizations. 409 → SlugConflictError.
 */
export async function createCustomerOrg(
  input: CreateCustomerOrgInput,
): Promise<CustomerOrg> {
  const slug = input.slug.trim();
  const existing = await listCustomerOrgs();
  if (existing.some((o) => o.slug === slug)) {
    throw new SlugConflictError(slug);
  }

  const res = await fetch('/api/internal/organizations', {
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

// agent_log event_type values that count as errors for the dashboard
// rollup. Sourced from a 2026-05-11 probe of pathfinder.agent_log:
//   error 649 · verify_fail 469 · deal_push_failed 66 · signature_failed 63 · draft_fail 5
const ERROR_EVENT_TYPES = [
  'error',
  'verify_fail',
  'deal_push_failed',
  'signature_failed',
  'draft_fail',
] as const;

/**
 * Per-org health rollup — trailing 7d / 30d windows. Issues three SELECT
 * queries against pathfinder.* tables, every one scoped by organization_id
 * (uuid). Reads as the Supabase anon key with RLS enforcing operator-only
 * access via the operator_allowlist policy installed by the Phase 2A
 * completion migration.
 */
export async function getOrgHealth(orgId: string): Promise<OrgHealthRollup> {
  const supabase = getSupabase();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [leadsRes, errorsRes, sourcesRes, draftedRes, sentRes] = await Promise.all([
    supabase
      .schema('pathfinder')
      .from('projects')
      .select('created_at, score')
      .eq('organization_id', orgId)
      .gte('created_at', since30d),
    supabase
      .schema('pathfinder')
      .from('agent_log')
      .select('agent_name, event_type, event_data, ts')
      .eq('organization_id', orgId)
      .in('event_type', ERROR_EVENT_TYPES as unknown as string[])
      .gte('ts', since30d)
      .order('ts', { ascending: false }),
    supabase
      .schema('pathfinder')
      .from('data_sources')
      .select('id, adapter_kind, name, jurisdiction')
      .eq('organization_id', orgId)
      .eq('enabled', true),
    // Outreach delivery denominator — drafts created in the 7d window
    // scoped by organization_id (uuid). Reads pathfinder.outreach_drafts.
    supabase
      .schema('pathfinder')
      .from('outreach_drafts')
      .select('id')
      .eq('organization_id', orgId)
      .gte('draft_at', since7d),
    // Outreach delivery numerator — sends in the 7d window scoped to this
    // org. pathfinder.outreach_edits is the canonical send log (written by
    // the sendOutreach orchestrator in Pathfinder/app/api/leads/.../send).
    // outreach_edits has no organization_id column, so we scope via the
    // FK outreach_edits.outreach_draft_id → outreach_drafts.id and the
    // !inner relationship hint, filtering on the parent's organization_id.
    // NOTE: outreach_drafts.sent_at exists in the schema but is never
    // populated by any code path today; outreach_edits.sent_at is the
    // real timestamp for delivery accounting.
    supabase
      .schema('pathfinder')
      .from('outreach_edits')
      .select('sent_at, outreach_drafts!inner(organization_id)')
      .eq('outreach_drafts.organization_id', orgId)
      .not('sent_at', 'is', null)
      .gte('sent_at', since7d),
  ]);

  if (leadsRes.error) throw leadsRes.error;
  if (errorsRes.error) throw errorsRes.error;
  if (sourcesRes.error) throw sourcesRes.error;
  if (draftedRes.error) throw draftedRes.error;
  if (sentRes.error) throw sentRes.error;

  const leads = (leadsRes.data ?? []) as { created_at: string; score: number | null }[];
  const errorsRaw = (errorsRes.data ?? []) as {
    agent_name: string;
    event_type: string;
    event_data: { message?: string; reason?: string } | null;
    ts: string;
  }[];
  const sourcesRaw = (sourcesRes.data ?? []) as {
    id: string;
    adapter_kind: string;
    name: string;
    jurisdiction: string | null;
  }[];
  const draftedRaw = (draftedRes.data ?? []) as { id: number | string }[];
  const sentRaw = (sentRes.data ?? []) as { sent_at: string }[];

  // agent_log → recent_errors: lift message from event_data jsonb, fall
  // back to event_type when the row is missing event_data (older error
  // rows that didn't capture structured detail).
  const errors = errorsRaw.map((e) => ({
    agent_name: e.agent_name,
    message: e.event_data?.message ?? e.event_data?.reason ?? e.event_type,
    created_at: e.ts,
  }));

  // data_sources → active_sources: rename adapter_kind → type, name → label
  // to match the OrgHealthRollup wire contract (which the dashboard renders).
  const sources = sourcesRaw.map((s) => ({
    id: s.id,
    type: s.adapter_kind,
    label: s.name,
    jurisdiction: s.jurisdiction,
  }));

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

  // Outreach delivery rate over the trailing 7 days: sends in window
  // ÷ drafts in window, capped at 1.0. The numerator and denominator are
  // independent counts (a send today can correspond to a draft from before
  // the window), so the ratio can briefly exceed 1 without the cap.
  // Returns 0 on an empty denominator to avoid divide-by-zero.
  const drafted_7d = draftedRaw.length;
  const sent_7d = sentRaw.length;
  const outreach_delivery_rate_7d =
    drafted_7d > 0 ? Math.min(1, sent_7d / drafted_7d) : 0;

  return {
    org_id: orgId,
    lead_volume_30d,
    lead_volume_7d_total,
    lead_volume_30d_total: leads.length,
    high_score_rate_7d,
    outreach_delivery_rate_7d,
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
