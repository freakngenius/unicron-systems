// lib/inngest/functions/contact-enrichment.ts — Demo Polish UX Gate 8B.
//
// Daily cron at 02:00 UTC enriches the top-50 leads not enriched in last
// 7 days. Spec: SPEC - Contact Enrichment.md § Cron + on-demand.
//
// The pure I/O wrapper lives at services/contact-enricher/runner.ts so
// this file can stay a thin Inngest adapter (mirrors the
// hubspot-recon-cron.ts shape).

import { inngest } from '../client';

export const contactEnrichmentCron = inngest.createFunction(
  {
    id: 'pathfinder-contact-enrichment-daily',
    name: 'Contact enrichment — daily top-50 cron',
    retries: 1,
    triggers: [{ cron: 'TZ=UTC 0 2 * * *' }],
  },
  async ({ step }: { step: unknown }) => {
    const stepCtx = step as {
      run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
    };
    const result = await stepCtx.run('run-contact-enrichment', async () => {
      const { runEnrichment } = await import('@/services/contact-enricher/runner');
      return runEnrichment();
    });
    return result;
  },
);
