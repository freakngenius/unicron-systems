// lib/lead-actions.ts — canonical accept-flow library for Pathfinder.
//
// Public interface (kept stable for P0-04 Slack-bot + P0-01 chat-panel
// consumers; full contract in docs/LEAD-ACTIONS-API.md):
//
//   acceptLead(input)                  → record an accept + push to HubSpot
//   pushDealForLeadAction(leadActionId) → re-push (used by reconcile cron)
//   applyHubspotStageEvent(event)      → webhook-driven stage update
//   recordLocalAction(input)           → dismiss / snooze (no HubSpot push)
//
// All writes go through the service-role Supabase client; RLS blocks
// anon writes. Audit rows land in agent_log with agent_name='hubspot-sync'.

import {
  createHubspotClient,
  HubspotError,
  type HubspotClient,
} from '@/lib/hubspot/client';
import {
  hubspotDealPipelineId,
  mapHubspotStageToPathfinder,
  mapPathfinderToHubspotStage,
} from '@/lib/hubspot/stage-map';
import { noteBodyFor, projectToDealProperties } from '@/lib/hubspot/deal-mapper';
import { supabaseAdmin } from '@/lib/supabase';
import type {
  Branch,
  Customer,
  LeadAction,
  LeadActionStatus,
  Project,
} from '@/lib/types';

// ────────────────────────────────────────────────────────────────────────
// Service-role Supabase client (lazy, mirrors lib/briefing.ts pattern)
// ────────────────────────────────────────────────────────────────────────

let _admin: ReturnType<typeof supabaseAdmin> | null = null;
function admin() {
  if (!_admin) _admin = supabaseAdmin();
  return _admin;
}

// Phase 2A completion (migration 20260511_phase2a_completion_org_id_rls.sql)
// made organization_id NOT NULL on lead_actions and agent_log. lead_actions
// is per-project, so we read the project's org_id at write time. Audit
// rows are platform-scoped — use the Zedcor fallback.
import { getPlatformOrgId } from './agent-runs';

async function resolveOrgForProject(projectId: string): Promise<string | null> {
  try {
    const sb = admin() as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: { organization_id: string | null } | null; error: unknown }>;
          };
        };
      };
    };
    const res = await sb
      .from('projects')
      .select('organization_id')
      .eq('id', projectId)
      .maybeSingle();
    return res.data?.organization_id ?? null;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Audit log helper (agent_name='hubspot-sync' per spec hard rule)
// ────────────────────────────────────────────────────────────────────────

type AuditPayload = Record<string, unknown> & { message?: string };

async function audit(eventType: string, data: AuditPayload): Promise<void> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
  };
  try {
    // agent_log.organization_id is NOT NULL. Prefer the project's org
    // when the audit payload includes a project_id; otherwise fall back
    // to Zedcor as the platform default.
    const projectId = typeof data.project_id === 'string' ? data.project_id : null;
    const orgId =
      (projectId ? await resolveOrgForProject(projectId) : null) ?? (await getPlatformOrgId());
    if (!orgId) return; // best-effort: skip the log row when no org resolvable.
    await sb.from('agent_log').insert({
      agent_name: 'hubspot-sync',
      event_type: eventType,
      event_data: data,
      organization_id: orgId,
    });
  } catch {
    // Audit best-effort; do not fail the caller because logging failed.
  }
}

// ────────────────────────────────────────────────────────────────────────
// HubSpot client factory (overridable for tests)
// ────────────────────────────────────────────────────────────────────────

let _hubspot: HubspotClient | null = null;
let _hubspotOverride: HubspotClient | null = null;

function getHubspot(): HubspotClient {
  if (_hubspotOverride) return _hubspotOverride;
  if (_hubspot) return _hubspot;

  const token = process.env.HUBSPOT_API_KEY;
  if (!token) {
    throw new Error('HUBSPOT_API_KEY is not set; HubSpot calls are disabled');
  }
  _hubspot = createHubspotClient({
    token,
    log: (eventType, data) => audit(eventType, data),
  });
  return _hubspot;
}

/** Test seam: inject a stub client. */
export function setHubspotClientForTesting(client: HubspotClient | null): void {
  _hubspotOverride = client;
}

// ────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────

export interface AcceptLeadInput {
  projectId: string;
  actorEmail: string;
  attestedPipelineValue?: number | null;
  firstActionDate?: string | null;
  note?: string | null;
}

export interface AcceptLeadResult {
  leadActionId: number;
  hubspotDealId: string | null;
  pushed: boolean;
  pushError?: string;
}

export interface RecordLocalActionInput {
  projectId: string;
  actorEmail: string;
  status: 'dismissed' | 'snoozed';
  note?: string | null;
}

export interface RecordLocalActionResult {
  leadActionId: number;
}

export interface HubspotStageEvent {
  /** HubSpot deal id (objectId on the change-property webhook). */
  dealId: string;
  /** Internal stage id HubSpot is reporting the deal moved to. */
  newStageId: string;
  /** HubSpot's per-event id; used for webhook-replay idempotency. */
  eventId: string;
  /** ms-epoch (HubSpot's `occurredAt`). */
  occurredAt: number;
  /** Optional amount echoed by HubSpot (used to stamp closed_won_amount). */
  amount?: number | null;
}

export type ApplyStageOutcome =
  | { kind: 'updated'; leadActionId: number; previousStatus: LeadActionStatus; newStatus: LeadActionStatus }
  | { kind: 'replayed'; leadActionId: number }
  | { kind: 'unknown_stage'; stageId: string }
  | { kind: 'unknown_deal'; dealId: string };

// ────────────────────────────────────────────────────────────────────────
// acceptLead — record an accept + push to HubSpot
// ────────────────────────────────────────────────────────────────────────

export async function acceptLead(input: AcceptLeadInput): Promise<AcceptLeadResult> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => {
        select: (cols: string) => Promise<{
          data: Array<{ id: number }> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };

  const { data, error } = await sb
    .from('lead_actions')
    .upsert(
      {
        project_id: input.projectId,
        actor_email: input.actorEmail,
        status: 'accepted',
        attested_pipeline_value: input.attestedPipelineValue ?? null,
        first_action_date: input.firstActionDate ?? null,
        note: input.note ?? null,
      },
      { onConflict: 'project_id,actor_email' },
    )
    .select('id');

  if (error || !data || data.length === 0) {
    await audit('accept_failed', {
      message: 'lead_actions upsert failed',
      project_id: input.projectId,
      actor_email: input.actorEmail,
      reason: error?.message ?? 'no_row_returned',
    });
    throw new Error(`accept failed: ${error?.message ?? 'no row returned'}`);
  }

  const leadActionId = data[0].id;
  await audit('accept_recorded', {
    message: 'accept persisted; HubSpot push starting',
    lead_action_id: leadActionId,
    project_id: input.projectId,
    actor_email: input.actorEmail,
  });

  // Push is fire-and-await: we want the response shape to include the
  // HubSpot deal id when push succeeds, but a push failure is *not* a
  // failed accept. The lead_actions row is left in 'accepted' with a
  // null hubspot_deal_id; a daily reconcile cron (out of scope for this
  // PR) re-pushes.
  try {
    const dealId = await pushDealForLeadAction(leadActionId);
    return { leadActionId, hubspotDealId: dealId, pushed: true };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return { leadActionId, hubspotDealId: null, pushed: false, pushError: reason };
  }
}

// ────────────────────────────────────────────────────────────────────────
// pushDealForLeadAction — build the deal payload + push + persist
// ────────────────────────────────────────────────────────────────────────

interface ProjectAndContext {
  project: Project;
  branch: Branch | null;
  customer: Customer | null;
}

async function loadContext(leadAction: LeadAction): Promise<ProjectAndContext> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
      };
    };
  };

  const projectRes = await sb
    .from('projects')
    .select('*')
    .eq('id', leadAction.project_id)
    .maybeSingle();
  if (projectRes.error || !projectRes.data) {
    throw new Error(`project ${leadAction.project_id} not found: ${projectRes.error?.message ?? 'no_row'}`);
  }
  const project = projectRes.data as unknown as Project;

  let branch: Branch | null = null;
  if (project.nearest_branch_id) {
    const r = await sb
      .from('branches')
      .select('*')
      .eq('id', project.nearest_branch_id)
      .maybeSingle();
    if (r.data) branch = r.data as unknown as Branch;
  }

  let customer: Customer | null = null;
  if (project.warm_for_customer_id) {
    const r = await sb
      .from('customers')
      .select('*')
      .eq('id', project.warm_for_customer_id)
      .maybeSingle();
    if (r.data) customer = r.data as unknown as Customer;
  }

  return { project, branch, customer };
}

async function loadLeadAction(id: number): Promise<LeadAction> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: number) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const r = await sb.from('lead_actions').select('*').eq('id', id).maybeSingle();
  if (r.error || !r.data) {
    throw new Error(`lead_action ${id} not found: ${r.error?.message ?? 'no_row'}`);
  }
  return r.data as unknown as LeadAction;
}

export async function pushDealForLeadAction(leadActionId: number): Promise<string> {
  const startMs = Date.now();
  const leadAction = await loadLeadAction(leadActionId);
  const { project, branch, customer } = await loadContext(leadAction);

  let dealProps;
  try {
    dealProps = projectToDealProperties({ project, leadAction, branch, customer });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await audit('deal_push_failed', {
      message: 'deal payload build failed',
      lead_action_id: leadActionId,
      reason,
    });
    throw e;
  }

  const hubspot = getHubspot();
  let dealId: string;
  try {
    const created = await hubspot.createDeal({ properties: dealProps as unknown as Record<string, string | number> });
    dealId = created.id;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    const status = e instanceof HubspotError ? e.status : null;
    await audit('deal_push_failed', {
      message: 'createDeal failed',
      lead_action_id: leadActionId,
      reason,
      status,
    });
    throw e;
  }

  // Best-effort note attachment. A note failure does not unwind the deal
  // creation — the deal exists and attribution is intact via
  // pathfinder_lead_id. We just audit the failure for follow-up.
  const noteBody = noteBodyFor(project, leadAction, customer);
  try {
    await hubspot.attachNote({ dealId, body: noteBody });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await audit('note_attach_failed', {
      message: 'note attach failed; deal push still succeeded',
      lead_action_id: leadActionId,
      hubspot_deal_id: dealId,
      reason,
    });
  }

  // Persist the deal id + sync metadata back to lead_actions.
  const sb = admin() as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: number) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  await sb
    .from('lead_actions')
    .update({
      hubspot_deal_id: dealId,
      hubspot_pipeline_id: hubspotDealPipelineId(),
      hubspot_stage_id: mapPathfinderToHubspotStage('accepted'),
      hubspot_pushed_at: new Date().toISOString(),
    })
    .eq('id', leadActionId);

  await audit('deal_pushed', {
    message: 'deal created in HubSpot',
    lead_action_id: leadActionId,
    hubspot_deal_id: dealId,
    latency_ms: Date.now() - startMs,
  });

  return dealId;
}

// ────────────────────────────────────────────────────────────────────────
// applyHubspotStageEvent — webhook-driven stage update
// ────────────────────────────────────────────────────────────────────────

export async function applyHubspotStageEvent(event: HubspotStageEvent): Promise<ApplyStageOutcome> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
      };
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: number) => Promise<{ error: { message: string } | null }>;
      };
    };
  };

  const lookup = await sb.from('lead_actions').select('*').eq('hubspot_deal_id', event.dealId).maybeSingle();
  if (lookup.error || !lookup.data) {
    await audit('stage_event_unknown_deal', {
      message: 'stage event references a HubSpot deal Pathfinder does not own',
      hubspot_deal_id: event.dealId,
      hubspot_event_id: event.eventId,
    });
    return { kind: 'unknown_deal', dealId: event.dealId };
  }
  const row = lookup.data as unknown as LeadAction;

  if (row.hubspot_last_event_id === event.eventId) {
    await audit('stage_replayed_skip', {
      message: 'webhook replayed an already-processed event',
      lead_action_id: row.id,
      hubspot_event_id: event.eventId,
    });
    return { kind: 'replayed', leadActionId: row.id };
  }

  const newStatus = mapHubspotStageToPathfinder(event.newStageId);
  if (!newStatus) {
    await audit('stage_unknown', {
      message: 'HubSpot stage id does not map to a Pathfinder status',
      lead_action_id: row.id,
      hubspot_stage_id: event.newStageId,
      hubspot_event_id: event.eventId,
    });
    return { kind: 'unknown_stage', stageId: event.newStageId };
  }

  const update: Record<string, unknown> = {
    status: newStatus,
    hubspot_stage_id: event.newStageId,
    hubspot_last_event_id: event.eventId,
    hubspot_last_event_at: new Date(event.occurredAt).toISOString(),
  };

  if (newStatus === 'closed_won') {
    update.closed_won_at = new Date(event.occurredAt).toISOString();
    // Prefer HubSpot-reported amount; fall back to attested.
    update.closed_won_amount = event.amount ?? row.attested_pipeline_value ?? null;
  }

  await sb.from('lead_actions').update(update).eq('id', row.id);

  await audit('stage_event', {
    message: `lead_actions.status: ${row.status} -> ${newStatus}`,
    lead_action_id: row.id,
    previous_status: row.status,
    new_status: newStatus,
    hubspot_stage_id: event.newStageId,
    hubspot_event_id: event.eventId,
    hubspot_amount: event.amount ?? null,
  });

  return {
    kind: 'updated',
    leadActionId: row.id,
    previousStatus: row.status,
    newStatus,
  };
}

// ────────────────────────────────────────────────────────────────────────
// recordLocalAction — dismiss / snooze (no HubSpot)
// ────────────────────────────────────────────────────────────────────────

export async function recordLocalAction(
  input: RecordLocalActionInput,
): Promise<RecordLocalActionResult> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => {
        select: (cols: string) => Promise<{
          data: Array<{ id: number }> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };

  const { data, error } = await sb
    .from('lead_actions')
    .upsert(
      {
        project_id: input.projectId,
        actor_email: input.actorEmail,
        status: input.status,
        note: input.note ?? null,
      },
      { onConflict: 'project_id,actor_email' },
    )
    .select('id');

  if (error || !data || data.length === 0) {
    throw new Error(`recordLocalAction failed: ${error?.message ?? 'no row returned'}`);
  }

  await audit('local_action', {
    message: `recorded local action: ${input.status}`,
    lead_action_id: data[0].id,
    project_id: input.projectId,
    actor_email: input.actorEmail,
    status: input.status,
  });

  return { leadActionId: data[0].id };
}
