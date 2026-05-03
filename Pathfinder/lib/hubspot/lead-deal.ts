// lib/hubspot/lead-deal.ts — Gate 10C orchestration.
//
// SPEC - HubSpot Bridge.md §Lead detail. Composes the user-client +
// field-mapper into a single push-deal entry point used by
// /api/leads/[projectId]/hubspot/push. Idempotent on
// (project_id, user_id, portal_id) via the unique key on
// pathfinder.lead_hubspot_deals — the second push for the same
// (project, user, portal) returns the prior result without re-creating
// HubSpot objects.

import { supabaseAdmin } from '@/lib/supabase';
import { getHubspotConnectionTokens } from '@/lib/connectors/user-connection';
import {
  buildContactProperties,
  buildDealProperties,
  companyNameFor,
  normalizeProjectStage,
} from '@/lib/hubspot/field-mapper';
import {
  createUserClient,
  portalContactUrl,
  portalDealUrl,
  HubspotUserClientError,
  type HubspotUserClient,
} from '@/lib/hubspot/user-client';
import type { Project } from '@/lib/types';

export type PushLeadDealOutcome =
  | {
      ok: true;
      idempotent: boolean;
      hubspot_deal_id: string;
      hubspot_deal_url: string | null;
      portal_id: string;
      contacts_pushed: number;
    }
  | {
      ok: false;
      reason: 'no_connection' | 'no_project' | 'hubspot_error';
      detail?: string;
    };

interface AdminFromTable {
  from: (t: string) => unknown;
}

function admin(): AdminFromTable {
  return supabaseAdmin() as unknown as AdminFromTable;
}

interface ProjectRow extends Project {
  /** alias for joined branch info; populated separately. */
}

interface LeadHubspotDealRow {
  id: string;
  project_id: string;
  user_id: string;
  portal_id: string;
  hubspot_deal_id: string;
  hubspot_deal_url: string | null;
  hubspot_company_id: string | null;
  pushed_at: string;
  last_synced_at: string | null;
  current_stage: string | null;
  current_stage_label: string | null;
  current_amount: number | null;
  current_owner_id: string | null;
  current_owner_name: string | null;
  last_activity_at: string | null;
  last_activity_type: string | null;
  status: string;
  error_message: string | null;
}

interface LeadContactRow {
  id: string;
  project_id: string;
  contact_name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
}

interface BranchRow {
  id: string;
  code: string | null;
  name: string | null;
}

async function loadProject(projectId: string): Promise<ProjectRow | null> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, v: string) => {
          maybeSingle: () => Promise<{ data: ProjectRow | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const res = await sb.from('projects').select('*').eq('id', projectId).maybeSingle();
  if (res.error) throw new Error(`loadProject failed: ${res.error.message}`);
  return res.data;
}

async function loadBranchForProject(project: ProjectRow): Promise<BranchRow | null> {
  if (!project.nearest_branch_id) return null;
  const sb = admin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, v: string) => {
          maybeSingle: () => Promise<{ data: BranchRow | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const res = await sb
    .from('branches')
    .select('id, code, name')
    .eq('id', project.nearest_branch_id)
    .maybeSingle();
  if (res.error) return null;
  return res.data;
}

async function loadLeadContacts(projectId: string): Promise<LeadContactRow[]> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, v: string) => {
          order: (
            col: string,
            opts: { ascending: boolean },
          ) => Promise<{ data: LeadContactRow[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const res = await sb
    .from('lead_contacts')
    .select('id, project_id, contact_name, email, phone, role')
    .eq('project_id', projectId)
    .order('contact_name', { ascending: true });
  if (res.error || !res.data) return [];
  return res.data;
}

async function loadExistingPush(
  projectId: string,
  userId: string,
  portalId: string,
): Promise<LeadHubspotDealRow | null> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, v: string) => {
          eq: (col: string, v: string) => {
            eq: (col: string, v: string) => {
              maybeSingle: () => Promise<{ data: LeadHubspotDealRow | null; error: { message: string } | null }>;
            };
          };
        };
      };
    };
  };
  const res = await sb
    .from('lead_hubspot_deals')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('portal_id', portalId)
    .maybeSingle();
  if (res.error) return null;
  return res.data;
}

interface InsertLeadDealInput {
  project_id: string;
  user_id: string;
  portal_id: string;
  hubspot_deal_id: string;
  hubspot_deal_url: string | null;
  hubspot_company_id: string | null;
  current_stage: string | null;
}

async function insertLeadDeal(input: InsertLeadDealInput): Promise<LeadHubspotDealRow> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      insert: (rows: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{ data: LeadHubspotDealRow | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const res = await sb
    .from('lead_hubspot_deals')
    .insert({
      project_id: input.project_id,
      user_id: input.user_id,
      portal_id: input.portal_id,
      hubspot_deal_id: input.hubspot_deal_id,
      hubspot_deal_url: input.hubspot_deal_url,
      hubspot_company_id: input.hubspot_company_id,
      current_stage: input.current_stage,
      status: 'active',
    })
    .select('*')
    .single();
  if (res.error || !res.data) {
    throw new Error(`insertLeadDeal failed: ${res.error?.message ?? 'no row returned'}`);
  }
  return res.data;
}

async function insertLeadContactLink(input: {
  lead_contact_id: string;
  user_id: string;
  portal_id: string;
  hubspot_contact_id: string;
  hubspot_contact_url: string | null;
}): Promise<void> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      insert: (rows: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };
  // Best-effort: a duplicate insert is non-fatal for the push outcome.
  await sb.from('lead_hubspot_contacts').insert(input);
}

export interface PushLeadDealInput {
  projectId: string;
  userId: string;
  /** Override the user-client (for tests). Production paths should not
   *  set this — production constructs the client from the live token. */
  clientOverride?: HubspotUserClient;
}

/** Push a Pathfinder lead to HubSpot as a deal+company+contacts.
 *  Idempotent on (project, user, portal). */
export async function pushLeadDeal(input: PushLeadDealInput): Promise<PushLeadDealOutcome> {
  const tokens = await getHubspotConnectionTokens(input.userId);
  if (!tokens) {
    return { ok: false, reason: 'no_connection' };
  }
  const portalId = tokens.connection.portal_id;
  if (!portalId) {
    return { ok: false, reason: 'no_connection', detail: 'connection has no portal_id' };
  }

  const project = await loadProject(input.projectId);
  if (!project) {
    return { ok: false, reason: 'no_project' };
  }

  const existing = await loadExistingPush(project.id, input.userId, portalId);
  if (existing) {
    return {
      ok: true,
      idempotent: true,
      hubspot_deal_id: existing.hubspot_deal_id,
      hubspot_deal_url: existing.hubspot_deal_url,
      portal_id: portalId,
      contacts_pushed: 0,
    };
  }

  const branch = await loadBranchForProject(project);
  const leadContacts = await loadLeadContacts(project.id);

  const client =
    input.clientOverride ?? createUserClient({ accessToken: tokens.access });

  const stageNormalized = normalizeProjectStage(project.project_stage);
  const dealProps = buildDealProperties({
    project,
    branchName: branch?.name ?? null,
    branchCode: branch?.code ?? null,
    // Stage uuid lookup is the cron flow's stage-map env-driven concern;
    // for the per-user push we send the normalized name and let HubSpot
    // resolve via the portal's pipeline. Custom-property-based mapping
    // ships in 10D.
    hubspotStageId: stageNormalized,
    hubspotPipelineId: process.env.HUBSPOT_DEAL_PIPELINE_ID ?? null,
  });

  let dealId: string;
  try {
    const deal = await client.createDeal({ properties: dealProps });
    dealId = deal.id;
  } catch (err) {
    const detail = err instanceof HubspotUserClientError ? err.message : String(err);
    return { ok: false, reason: 'hubspot_error', detail };
  }

  // Best-effort company. Pathfinder doesn't have a canonical owner_org
  // on every project; the title is a reasonable fallback for the demo.
  let companyId: string | null = null;
  try {
    const company = await client.createCompany({
      properties: { name: companyNameFor(project) },
    });
    companyId = company.id;
    await client.associateDealCompany(dealId, companyId);
  } catch {
    // Non-fatal — deal is created without a company association.
  }

  // Contacts. Each one upsert-by-email + associate-with-deal. Failures
  // here are per-contact; we keep going for the remaining contacts.
  let contactsPushed = 0;
  for (const c of leadContacts) {
    try {
      const contactProps = buildContactProperties(
        { contact_name: c.contact_name, email: c.email, phone: c.phone, role: c.role },
        companyNameFor(project),
      );
      const { id: contactId } = await client.findOrCreateContactByEmail({
        email: c.email ?? null,
        properties: contactProps as unknown as Record<string, string | number>,
      });
      await client.associateDealContact(dealId, contactId);
      await insertLeadContactLink({
        lead_contact_id: c.id,
        user_id: input.userId,
        portal_id: portalId,
        hubspot_contact_id: contactId,
        hubspot_contact_url: portalContactUrl(portalId, contactId),
      });
      contactsPushed += 1;
    } catch {
      // swallow; deal-level success is what gates the outcome.
    }
  }

  // Persist the local mapping row so the next status() call shows
  // "pushed" and the UI can deep-link.
  const dealUrl = portalDealUrl(portalId, dealId);
  try {
    await insertLeadDeal({
      project_id: project.id,
      user_id: input.userId,
      portal_id: portalId,
      hubspot_deal_id: dealId,
      hubspot_deal_url: dealUrl,
      hubspot_company_id: companyId,
      current_stage: stageNormalized,
    });
  } catch (err) {
    // The HubSpot side succeeded; if our DB write failed, surface it but
    // still report the deal id so the operator can see it in HubSpot.
    return {
      ok: false,
      reason: 'hubspot_error',
      detail: `push succeeded but local row insert failed: ${err instanceof Error ? err.message : String(err)} (hubspot_deal_id=${dealId})`,
    };
  }

  return {
    ok: true,
    idempotent: false,
    hubspot_deal_id: dealId,
    hubspot_deal_url: dealUrl,
    portal_id: portalId,
    contacts_pushed: contactsPushed,
  };
}

/** Read the current lead↔HubSpot status for a project + user. */
export async function loadLeadDealStatus(
  projectId: string,
  userId: string,
): Promise<{ deal: LeadHubspotDealRow | null }> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, v: string) => {
          eq: (col: string, v: string) => {
            order: (
              col: string,
              opts: { ascending: boolean },
            ) => {
              limit: (n: number) => {
                maybeSingle: () => Promise<{
                  data: LeadHubspotDealRow | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      };
    };
  };
  const res = await sb
    .from('lead_hubspot_deals')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .order('pushed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (res.error) return { deal: null };
  return { deal: res.data };
}
