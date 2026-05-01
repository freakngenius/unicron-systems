// Lead Detail — Stream B Gate B2.
//
// Server component fetches the project, the latest outreach_drafts row
// (preferring 'email' channel), the current contacts (when present), and
// any prior outreach_edits. Hands to <LeadDetail /> for the composer UI.

import { notFound } from 'next/navigation';

import { LeadDetail } from '@/components/lead/LeadDetail';
import { supabase } from '@/lib/supabase';
import { buildTimelineForProject, type TimelineEvent } from '@/lib/timeline';
import type {
  OutreachDraft,
  OutreachEdit,
  Project,
  ProjectContact,
} from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function fetchData(projectId: string): Promise<{
  project: Project | null;
  latestEmailDraft: OutreachDraft | null;
  contacts: ProjectContact[];
  recentEdits: OutreachEdit[];
  timelineEvents: TimelineEvent[];
}> {
  const [projectRes, draftRes, contactsRes, editsRes, timelineEvents] = await Promise.all([
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
  ]);

  return {
    project: (projectRes.data as Project | null) ?? null,
    latestEmailDraft: ((draftRes.data ?? [])[0] as OutreachDraft | undefined) ?? null,
    contacts: ((contactsRes.data ?? []) as ProjectContact[]) ?? [],
    recentEdits: ((editsRes.data ?? []) as OutreachEdit[]) ?? [],
    timelineEvents,
  };
}

export default async function LeadDetailPage({
  params,
}: {
  params: { projectId: string };
}) {
  const { project, latestEmailDraft, contacts, recentEdits, timelineEvents } =
    await fetchData(params.projectId);
  if (!project) notFound();

  return (
    <LeadDetail
      project={project}
      latestEmailDraft={latestEmailDraft}
      contacts={contacts}
      recentEdits={recentEdits}
      timelineEvents={timelineEvents}
    />
  );
}
