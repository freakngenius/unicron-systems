// Lead Detail — Stream B Gate B2.
//
// Server component fetches the project, the latest outreach_drafts row
// (preferring 'email' channel), the current contacts (when present), and
// any prior outreach_edits. Hands to <LeadDetail /> for the composer UI.

import { notFound } from 'next/navigation';

import { LeadDetail } from '@/components/lead/LeadDetail';
import { LeadDetailModal } from '@/components/lead/LeadDetailModal';
import type { CrossPollinationMatchRow } from '@/components/zedcor/ZedcorRelationshipContext';
import {
  formatFromDisplay,
  resolveActiveConnection,
} from '@/lib/outreach/user-connection';
import { supabase } from '@/lib/supabase';
import { buildTimelineForProject, type TimelineEvent } from '@/lib/timeline';

const DEMO_OPERATOR_EMAIL =
  process.env.PF_DEMO_OPERATOR_EMAIL ?? 'kyle@freakngenius.com';
import type {
  LeadContactRow,
  OutreachDraft,
  OutreachEdit,
  Project,
  ProjectContact,
} from '@/lib/types';

// Demo Polish UX Gate 9A — neighbor cap for arrow-key cycling. Top 200
// ranked projects (score desc, posted_date desc) are passed to the modal
// shell; arrow keys cycle within that set. 200 is enough to cover the
// dashboard's default top-50 view plus a healthy margin and stays small
// enough to ship inline (a few KB of IDs).
const NEIGHBOR_CAP = 200;

// Z-F integrator — minimal projection of the zedcor branch row used by the
// LeadDetail header. Avoid importing the engine helper here (server-side
// fetch is straightforward) so the page renders without engine deps.
interface ZedcorBranchInfo {
  id: string;
  branch_name: string;
  state: string;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function fetchData(projectId: string): Promise<{
  project: Project | null;
  latestEmailDraft: OutreachDraft | null;
  contacts: ProjectContact[];
  leadContacts: LeadContactRow[];
  recentEdits: OutreachEdit[];
  timelineEvents: TimelineEvent[];
  crossPollMatches: CrossPollinationMatchRow[];
  zedcorBranch: ZedcorBranchInfo | null;
}> {
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
    // Relationship Context section. The engine inserts here from the
    // ranker; ordering by confidence DESC mirrors the engine's own sort.
    supabase
      .from('lead_cross_pollination')
      .select('*')
      .eq('lead_id', projectId)
      .order('match_confidence', { ascending: false })
      .limit(10),
  ]);

  const project = (projectRes.data as Project | null) ?? null;

  // Z-F integrator — resolve nearest_zedcor_branch_id → branch_name + state
  // for the page header. Run after the project read so we can short-circuit
  // when the project has no proximity data.
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
    latestEmailDraft: ((draftRes.data ?? [])[0] as OutreachDraft | undefined) ?? null,
    contacts: ((contactsRes.data ?? []) as ProjectContact[]) ?? [],
    leadContacts: ((leadContactsRes.data ?? []) as LeadContactRow[]) ?? [],
    recentEdits: ((editsRes.data ?? []) as OutreachEdit[]) ?? [],
    timelineEvents,
    crossPollMatches: ((crossPollRes.data ?? []) as unknown as CrossPollinationMatchRow[]) ?? [],
    zedcorBranch,
  };
}

export default async function LeadDetailPage({
  params,
}: {
  params: { projectId: string };
}) {
  // Next.js 14 Page server components receive `params` URL-encoded
  // (Route Handlers receive them decoded — known inconsistency). Project
  // ids in pathfinder.projects are stored as `sam.gov:<noticeid>` etc.
  // with literal colons; without this decode, supabase.eq() on the
  // encoded `sam.gov%3A<noticeid>` returns null and the page 404s for
  // every lead. Filed in MEMORY/operator-todos/2026-05-03-pathfinder-lead-detail-route-404.md.
  const projectId = decodeURIComponent(params.projectId);

  const [
    {
      project,
      latestEmailDraft,
      contacts,
      leadContacts,
      recentEdits,
      timelineEvents,
      crossPollMatches,
      zedcorBranch,
    },
    neighborIds,
    connection,
  ] = await Promise.all([
    fetchData(projectId),
    fetchNeighborIds(),
    resolveActiveConnection(DEMO_OPERATOR_EMAIL),
  ]);
  if (!project) notFound();

  // Demo Polish UX Gate 7A — flag-gated lead detail redesign. Read at the
  // server-component boundary; default off. When `1`, LeadDetail renders the
  // v2 composition (Gate 9A) wrapped in the LeadDetailModal shell. When
  // unset/0, the existing pre-redesign layout renders untouched.
  const redesignEnabled = process.env.LEAD_DETAIL_REDESIGN === '1';

  // Demo Polish UX Gate 8C — top-50 status drives the ContactsCard
  // empty-state. Threshold mirrors the contact-enricher cron's selection
  // (top 50 by score). Approximate from project.score; the real cron
  // recomputes nightly. The UI's only failure mode here is showing
  // "Run now" for a lead that's borderline — acceptable.
  const TOP_FIFTY_SCORE_FLOOR = 50;
  const isTopFifty = (project.score ?? 0) >= TOP_FIFTY_SCORE_FLOOR;

  const leadDetail = (
    <LeadDetail
      project={project}
      latestEmailDraft={latestEmailDraft}
      contacts={contacts}
      leadContacts={leadContacts}
      recentEdits={recentEdits}
      timelineEvents={timelineEvents}
      crossPollMatches={crossPollMatches}
      zedcorBranch={zedcorBranch}
      redesignEnabled={redesignEnabled}
      isTopFifty={isTopFifty}
      isAdmin={true}
      fromDisplay={formatFromDisplay(connection)}
      isConnected={connection?.isConnected ?? false}
    />
  );

  // Gate 9A — wrap the redesigned view in the full-screen modal shell.
  // Legacy (flag-off) path renders standalone so existing behavior stays
  // identical until the redesign is fully validated in production.
  if (redesignEnabled) {
    return (
      <LeadDetailModal currentProjectId={project.id} neighborIds={neighborIds}>
        {leadDetail}
      </LeadDetailModal>
    );
  }
  return leadDetail;
}

// Demo Polish UX Gate 9A — fetch the top-N ranked project IDs so the modal
// shell can cycle arrow-key navigation between sibling leads. Order
// mirrors the dashboard's default ranking: score desc with nulls last,
// then posted_date desc as a tiebreak. Capped at NEIGHBOR_CAP rows.
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
