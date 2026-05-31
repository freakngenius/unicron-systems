// app/api/inngest/route.ts — Phase 1 G1 Task B1.
//
// Inngest serves its functions through this single endpoint. Inngest
// cloud (or the local Inngest dev server) calls this route to discover
// the function set and dispatch events into them.

import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import {
  qualifierRank,
  verifier,
  outreach,
  delivery,
  slackAlertOnVerified,
  architectTuningCron,
  architectDiscoveryCron,
  sourceOnboarder,
  coverageExpansionEstimate,
  coverageExpansionRun,
  ingestRouter,
  ingestAllOrgsCron,
  ingestOrgRequested,
  verifyBuildOut,
  orgCreated,
  checkReadyToViewCron,
  funderEnrichAdjacency,
  internalEnrichGeoAdjacency,
  searchOrchestrator,
} from '@/lib/inngest/functions';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    qualifierRank,
    verifier,
    outreach,
    delivery,
    slackAlertOnVerified,
    architectTuningCron,
    architectDiscoveryCron,
    sourceOnboarder,
    coverageExpansionEstimate,
    coverageExpansionRun,
    ingestRouter,
    ingestAllOrgsCron,
    // Build-Out Pass slices 3+5 — subscribes to pathfinder/org.ready_to_view.
    verifyBuildOut,
    // Phase 2E slice 2 — Onboarding-to-Live state machine: status flip on
    // org.created + periodic threshold check transitioning first_run/ranking
    // → ready_to_view or awaiting_threshold. Both were exported from
    // lib/inngest/functions but not previously wired into serve(), so the
    // Inngest cloud never received them. DoD smoke step 3 was blocked on
    // this; registering them here unblocks the cascade through steps 4-6.
    orgCreated,
    checkReadyToViewCron,
    // Funder Stage 3 — `pathfinder/org.ingest_requested` subscriber.
    // Was exported but never wired into serve(); registering here so the
    // Inngest cloud actually dispatches the per-org ingest cycle.
    ingestOrgRequested,
    // Funder onboarding post-merge follow-up — `pathfinder/project.qualified`
    // subscriber that runs the Funder enricher + adjacency-mapper before
    // the next ranker cycle picks up the row. Funder-only via slug filter
    // inside the handler.
    funderEnrichAdjacency,
    // Internal onboarding Stage 5 — `pathfinder/project.qualified`
    // subscriber that runs the Internal enricher + geo + adjacency
    // before the next ranker cycle picks up the row. Internal-only
    // via slug filter inside the handler. Adjacency is inert until
    // UNICRON_INTERNAL_ADJACENCY_SEED_PATH is set.
    internalEnrichGeoAdjacency,
    // ICP Saved Search S1 — pathfinder/search.run.requested subscriber.
    // Walks the six-phase orchestration plan (interpret -> geo -> sources
    // -> wire -> scrape -> score), writing progress to
    // pathfinder.search_runs after each phase. Imports the planner/runner
    // from @/lib/agents/search (Stream S2 seam; stub at S1, real at S2).
    searchOrchestrator,
  ],
});

export const dynamic = 'force-dynamic';
// Tuning sessions cap at 30 min per spec §9, but Inngest steps run
// independently — the serve() route only handles dispatch, not the
// session itself. 60s is enough for Inngest function discovery + step ack.
export const maxDuration = 60;
