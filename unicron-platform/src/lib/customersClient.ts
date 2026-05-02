// Multi-tenant customer client (Phase 1 / Stream M3).
//
// Reads only — no mutations. RLS allows anon SELECT on the relevant
// pathfinder.* tables (verified via 0002_tables.sql / 0004_rls.sql).
//
// Single-org degradation: until pathfinder.organizations ships
// (operator-todo 2026-05-02-pathfinder-needs-org-table.md), `listOrgs()`
// returns a hardcoded list with the single Zedcor entry.

import { getSupabase } from './supabase';
import type {
  CustomerOrg,
  OrgHealthRollup,
} from './contracts/customers';
import { customersMock, customerHealthMock } from '../data/mocks';

const KNOWN_ORGS: CustomerOrg[] = [
  {
    id: 'zedcor',
    display_name: 'Zedcor Security Solutions',
    status: 'active',
    onboarded_at: '2026-04-01T00:00:00.000Z',
    primary_contact_email: 'ops@zedcor.example.com',
  },
];

function realEnabled(): boolean {
  return import.meta.env.VITE_PATHFINDER_DB_ENABLED === 'true';
}

/**
 * Returns the list of customer orgs metacron operates. Until
 * pathfinder.organizations ships, `KNOWN_ORGS` is the source of truth.
 */
export async function listCustomerOrgs(): Promise<CustomerOrg[]> {
  if (!realEnabled()) {
    await new Promise((r) => setTimeout(r, 100));
    return [...customersMock];
  }
  // Once pathfinder.organizations exists, swap the literal below for:
  //   const { data, error } = await supabase.schema('pathfinder')
  //     .from('organizations').select('*').order('display_name');
  // Until then, return the hardcoded list.
  return [...KNOWN_ORGS];
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
  if (!realEnabled()) {
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
