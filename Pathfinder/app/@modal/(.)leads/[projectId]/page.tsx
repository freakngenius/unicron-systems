// app/@modal/(.)leads/[projectId]/page.tsx — Demo Polish UX Gate 15A.
//
// Intercepting-route variant of the lead detail. Fires when the
// navigation to /pathfinder/leads/[projectId] originates from a sibling
// route (the dashboard at /pathfinder). Renders the same <LeadDetail />
// payload as the standalone route, wrapped in <LeadDetailModal /> so
// the live map remains visible behind a 40% black + 12px blur backdrop.
//
// Direct URL loads / refresh hit the standalone route at
// `app/leads/[projectId]/page.tsx` and skip this intercept entirely.

import { notFound } from 'next/navigation';
import * as React from 'react';

import { LeadDetail } from '@/components/lead/LeadDetail';
import { LeadDetailModal } from '@/components/lead/LeadDetailModal';
import { loadLeadDetailPayload } from '@/lib/lead-detail-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function InterceptedLeadDetailPage({
  params,
}: {
  params: { projectId: string };
}) {
  const projectId = decodeURIComponent(params.projectId);

  const payload = await loadLeadDetailPayload(projectId);
  if (!payload.project) notFound();

  return (
    <LeadDetailModal
      currentProjectId={payload.project.id}
      neighborIds={payload.neighborIds}
    >
      <LeadDetail
        project={payload.project}
        latestEmailDraft={payload.latestEmailDraft}
        contacts={payload.contacts}
        leadContacts={payload.leadContacts}
        recentEdits={payload.recentEdits}
        timelineEvents={payload.timelineEvents}
        crossPollMatches={payload.crossPollMatches}
        zedcorBranch={payload.zedcorBranch}
        redesignEnabled={payload.redesignEnabled}
        isTopFifty={payload.isTopFifty}
        isAdmin={true}
        fromDisplay={payload.fromDisplay}
        isConnected={payload.isConnected}
      />
    </LeadDetailModal>
  );
}
