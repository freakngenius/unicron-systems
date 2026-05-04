// lib/lead-detail-data.ts — Demo Polish UX Gate 15A.
//
// Shared data loader for the standalone (`app/leads/[projectId]/page.tsx`)
// and the intercepted (`app/@modal/(.)leads/[projectId]/page.tsx`) lead
// detail routes. Both routes need identical reads; centralising here
// prevents drift between the two surfaces.

import type { CrossPollinationMatchRow } from '@/components/zedcor/ZedcorRelationshipContext';
import {
  formatFromDisplay,
  resolveActiveConnection,
} from '@/lib/outreach/user-connection';
import { supabase } from '@/lib/supabase';
import { buildTimelineForProject, type TimelineEvent } from '@/lib/timeline';
import type {
  LeadContactRow,
  OutreachDraft,
  OutreachEdit,
  Project,
  ProjectContact,
} from '@/lib/types';

export const DEMO_OPERATOR_EMAIL =
  process.env.PF_DEMO_OPERATOR_EMAIL ?? 'kyle@freakngenius.com';

// Top 200 by score / posted_date for arrow-key cycling. Mirrors the
// dashboard's default ranking (Gate 9A).
const NEIGHBOR_CAP = 200;
// Top-50 score floor for the ContactsCard empty-state classifier. (Gate 8C)
const TOP_FIFTY_SCORE_FLOOR = 50;

export interface ZedcorBranchInfo {
  id: string;
  branch_name: string;
  state: string;
}

export interface LeadDetailPayload {
  project: Project | null;
  latestEmailDraft: OutreachDraft | null;
  contacts: ProjectContact[];
  leadContacts: LeadContactRow[];
  recentEdits: OutreachEdit[];
  timelineEvents: TimelineEvent[];
  crossPollMatches: CrossPollinationMatchRow[];
  zedcorBranch: ZedcorBranchInfo | null;
  neighborIds: string[];
  redesignEnabled: boolean;
  isTopFifty: boolean;
  fromDisplay: string;
  isConnected: boolean;
}

async function fetchData(projectId: string) {
  const [
    projectRes,
    draftRes,
    contactsRes,
    leadContactsRes,
    editsRes,
    timelineEvents,
    crossPollRes,
  ] = await Promise.all([
    supabase.from('projects').select('*').eq('id', projectId).maybeSingle(),
    supabase
      .from('outreach_drafts')
      .select('*')
      .eq('project_id', projectId)
      .eq('channel', 'email')
      .order('draft_at', { ascending: false })
      .limit(1),
    supabase
      .from('project_contacts')
      .select('*')
      .eq('project_id', projectId)
      .order('confidence', { ascending: false }),
    // Demo Polish UX Gate 8C — read decision-maker contacts from
    // pathfinder.lead_contacts (populated by Gate 8B's enricher).
    supabase
      .from('lead_contacts')
      .select('*')
      .eq('project_id', projectId)
      .order('enriched_at', { ascending: false }),
    supabase
      .from('outreach_edits')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(20),
    buildTimelineForProject(projectId).catch(() => [] as TimelineEvent[]),
    // Z-F integrator — load cross-pollination matches for the
    // Relationship Context section.
    supabase
      .from('lead_cross_pollination')
      .select('*')
      .eq('lead_id', projectId)
      .order('match_confidence', { ascending: false })
      .limit(10),
  ]);

  const project = (projectRes.data as Project | null) ?? null;

  // Z-F integrator — resolve nearest_zedcor_branch_id → branch_name + state
  // for the page header.
  let zedcorBranch: ZedcorBranchInfo | null = null;
  if (project?.nearest_zedcor_branch_id) {
    const { data: branchRow } = await supabase
      .from('zedcor_branches')
      .select('id, branch_name, state')
      .eq('id', project.nearest_zedcor_branch_id)
      .maybeSingle();
    if (branchRow) zedcorBranch = branchRow as unknown as ZedcorBranchInfo;
  }

  return {
    project,
    latestEmailDraft:
      ((draftRes.data ?? [])[0] as OutreachDraft | undefined) ?? null,
    contacts: ((contactsRes.data ?? []) as ProjectContact[]) ?? [],
    leadContacts: ((leadContactsRes.data ?? []) as LeadContactRow[]) ?? [],
    recentEdits: ((editsRes.data ?? []) as OutreachEdit[]) ?? [],
    timelineEvents,
    crossPollMatches:
      ((crossPollRes.data ?? []) as unknown as CrossPollinationMatchRow[]) ?? [],
    zedcorBranch,
  };
}

async function fetchNeighborIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .order('score', { ascending: false, nullsFirst: false })
    .order('posted_date', { ascending: false, nullsFirst: false })
    .limit(NEIGHBOR_CAP);
  if (error) return [];
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

export async function loadLeadDetailPayload(
  projectId: string,
): Promise<LeadDetailPayload> {
  const [data, neighborIds, connection] = await Promise.all([
    fetchData(projectId),
    fetchNeighborIds(),
    resolveActiveConnection(DEMO_OPERATOR_EMAIL),
  ]);

  const redesignEnabled = process.env.LEAD_DETAIL_REDESIGN === '1';
  const isTopFifty = (data.project?.score ?? 0) >= TOP_FIFTY_SCORE_FLOOR;

  return {
    ...data,
    neighborIds,
    redesignEnabled,
    isTopFifty,
    fromDisplay: formatFromDisplay(connection),
    isConnected: connection?.isConnected ?? false,
  };
}
