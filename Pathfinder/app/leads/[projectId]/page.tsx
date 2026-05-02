// Lead Detail — Stream B Gate B2.
//
// Server component fetches the project, the latest outreach_drafts row
// (preferring 'email' channel), the current contacts (when present), and
// any prior outreach_edits. Hands to <LeadDetail /> for the composer UI.

import { notFound } from 'next/navigation';

import { LeadDetail } from '@/components/lead/LeadDetail';
import type { CrossPollinationMatchRow } from '@/components/zedcor/ZedcorRelationshipContext';
import { supabase } from '@/lib/supabase';
import { buildTimelineForProject, type TimelineEvent } from '@/lib/timeline';
import type {
  OutreachDraft,
  OutreachEdit,
  Project,
  ProjectContact,
} from '@/lib/types';

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
  recentEdits: OutreachEdit[];
  timelineEvents: TimelineEvent[];
  crossPollMatches: CrossPollinationMatchRow[];
  zedcorBranch: ZedcorBranchInfo | null;
}> {
  const [
    projectRes,
    draftRes,
    contactsRes,
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
  const {
    project,
    latestEmailDraft,
    contacts,
    recentEdits,
    timelineEvents,
    crossPollMatches,
    zedcorBranch,
  } = await fetchData(params.projectId);
  if (!project) notFound();

  return (
    <LeadDetail
      project={project}
      latestEmailDraft={latestEmailDraft}
      contacts={contacts}
      recentEdits={recentEdits}
      timelineEvents={timelineEvents}
      crossPollMatches={crossPollMatches}
      zedcorBranch={zedcorBranch}
    />
  );
}
