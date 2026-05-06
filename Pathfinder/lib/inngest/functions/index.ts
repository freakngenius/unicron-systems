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
