// lib/inngest/functions/index.ts — Phase 1 G1 Task B2.
// Barrel export for all registered Inngest functions. Imported by
// /api/inngest/route.ts to wire the function set into the serve() handler.

export { qualifierRank } from './qualifier-rank';
export { verifier } from './verifier';
export { outreach } from './outreach';
export { delivery } from './delivery';
export { slackAlertOnVerified } from './slack-alert-on-verified';
// Phase 2 Stream D — Architect schedules. Cron triggers run inside the
// Inngest serve() handler; coordinate with Stream A on registration.
export { architectTuningCron } from './architect-tuning-cron';
export { architectDiscoveryCron } from './architect-discovery-cron';
// Phase 2 Stream E — Source Onboarder + Coverage Expansion.
export { sourceOnboarder } from './source-onboarder';
export { coverageExpansionEstimate, coverageExpansionRun } from './coverage-expansion';
// Demo Polish UX Gate 4B-3 — nightly HubSpot reconciliation cron.
export { hubspotReconCron } from './hubspot-recon-cron';
// Demo Polish UX Gate 18D — Verifier deeper pass (lead detail "Attempt
// Verification" button).
export { verifierRetry } from './verifier-retry';
// Sprint 0 — Nervous System Foundation. Placeholder; Sprint 1 wires real ingest skill.
export { ingestRouter } from './ingest-router';
// Sprint 5 Stream A — daily email ingest cron (08:00 PT = 16:00 UTC).
export { emailDailyCron } from './email-cron';
// Phase 2C slice 1 — per-org ingest dispatch cron.
export { ingestAllOrgsCron } from './ingest-all-orgs-cron';
// Funder Stage 3 — `pathfinder/org.ingest_requested` subscriber that
// runs the per-source SOURCE_ADAPTERS registry for opted-in orgs.
// Zedcor remains on the inline ingestor in lib/ingestor.ts.
export { ingestOrgRequested } from './ingest-org-requested';
// Phase 2E slice 2 — Onboarding-to-Live state machine: status flip on
// org.created + periodic threshold check transitioning first_run/ranking
// → ready_to_view or awaiting_threshold.
export { orgCreated } from './org-created';
export { checkReadyToViewCron } from './check-ready-to-view-cron';
// Build-Out Pass slices 3+5 — HTTP-verifies the /[slug] route after
// ready_to_view and flips status to build_out_complete / build_out_failed.
export { verifyBuildOut } from './verify-build-out';
// Funder onboarding post-merge follow-up — `pathfinder/project.qualified`
// subscriber that runs the Funder enricher + adjacency-mapper before the
// next ranker cycle. Funder-only via slug filter inside the handler.
export { funderEnrichAdjacency } from './funder-enrich-adjacency';
// Internal onboarding Stage 5 — `pathfinder/project.qualified` subscriber
// that runs the Internal enricher + geo + adjacency before the next
// ranker cycle picks the project up. Internal-only via slug filter
// inside the handler.
export { internalEnrichGeoAdjacency } from './internal-enrich-geo-adjacency';
