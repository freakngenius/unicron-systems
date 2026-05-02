// Pipeline Kanban — Stream B Gate B1.
//
// Server component fetches the current deals + project hydrate, hands to
// the client-component <PipelineKanban /> which owns drag-and-drop state.
// Mounted under /pathfinder/pipeline (the Pathfinder Next.js app uses
// basePath: '/pathfinder' — see next.config.js).

import { PipelineKanban } from '@/components/pipeline/PipelineKanban';
import { listDealsWithProjects } from '@/lib/deals';
import type { DealWithProject } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PipelinePage() {
  let initialDeals: DealWithProject[] = [];
  let loadError: string | null = null;
  try {
    initialDeals = await listDealsWithProjects({ limit: 1000 });
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return <PipelineKanban initialDeals={initialDeals} loadError={loadError} />;
}
