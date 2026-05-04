// Lead Detail — Stream B Gate B2.
//
// Demo Polish UX Gate 15A: this route is now the STANDALONE full-page
// render only. Direct URL loads, refreshes-while-modal-open, and deep
// links all hit this route. The intercepted-route variant lives at
// `app/@modal/(.)leads/[projectId]/page.tsx` and is what gets rendered
// when navigation originates from the dashboard.

import { notFound } from 'next/navigation';

import { LeadDetail } from '@/components/lead/LeadDetail';
import { loadLeadDetailPayload } from '@/lib/lead-detail-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function LeadDetailPage({
  params,
}: {
  params: { projectId: string };
}) {
  // Next.js 14 page params are URL-encoded; project ids in
  // pathfinder.projects use literal colons (`sam.gov:<noticeid>`).
  // Without this decode, supabase.eq() returns null and the route 404s.
  // Filed in MEMORY/operator-todos/2026-05-03-pathfinder-lead-detail-route-404.md.
  const projectId = decodeURIComponent(params.projectId);

  const payload = await loadLeadDetailPayload(projectId);
  if (!payload.project) notFound();

  return (
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
  );
}
