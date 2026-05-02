// lib/inngest/functions/hubspot-recon-cron.ts — Demo Polish UX Gate 4B-3.
//
// Nightly reconciliation between Pathfinder lead_actions and HubSpot
// deals. Runs at 03:00 UTC. Per-field policy from
// connectors.metadata.hubspot_mapping decides who wins; unresolvable
// diffs land in pathfinder.architect_inbox with
// category='hubspot-sync-conflict'.
//
// Drift metrics (auto_resolved count, escalated count, matched count)
// are written to pathfinder.connector_audit_log so the Settings tile
// can surface "last recon: 0 conflicts" or similar.
//
// The diff itself lives in lib/connectors/hubspot/recon.ts (pure,
// unit-tested). This file is the Inngest wrapper + I/O layer.

import { inngest } from '../client';

interface ReconRunResult {
  connectors_processed: number;
  auto_resolved: number;
  escalated: number;
  matched: number;
  errors: string[];
}

export const hubspotReconCron = inngest.createFunction(
  {
    id: 'pathfinder-hubspot-recon-nightly',
    name: 'HubSpot — nightly reconciliation',
    retries: 1,
    triggers: [{ cron: 'TZ=UTC 0 3 * * *' }],
  },
  async ({ step }: { step: unknown }) => {
    const stepCtx = step as {
      run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
    };
    const result = await stepCtx.run('run-recon', async () => {
      const { runHubspotRecon } = await import('@/services/connectors/hubspot-recon');
      return runHubspotRecon();
    });
    return result satisfies ReconRunResult;
  },
);
