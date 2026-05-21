// lib/adapters/sources/accelerator-cohort-pages.ts
//
// Accelerator cohort pages adapter — Funder onboarding Stage 3.
//
// Per-accelerator HTML scraping is brittle and varies per site (Y
// Combinator, ARC Prize, Astera Institute, Schmidt Futures, etc.). This
// adapter ships as `tier-2-human-assist` per Build-Spec §4 Stage 3
// guidance: a scraping source that is unstable registers as
// tier-2-human-assist rather than blocking the run.
//
// The poll() implementation iterates the configured accelerator list (if
// any) and best-effort scrapes each. Empty config returns [] cleanly so
// the subscriber records 0 events for this source without erroring.
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 3.

import type { SourceAdapter, SourcePollOptions, SourceEvent } from './types';

interface AcceleratorConfig {
  name: string;
  url: string;
  /** Selector or regex hint passed to the per-source scraper. */
  hint?: string;
}

const DEFAULT_ACCELERATORS: AcceleratorConfig[] = [
  // Empty by default — operator must opt-in per accelerator because
  // page structure changes frequently and each one needs its own selector.
];

export const acceleratorCohortPagesAdapter: SourceAdapter = {
  id: 'custom-accelerator-cohort-pages',
  type: 'tier-2-human-assist',
  description:
    'Accelerator cohort pages — per-accelerator HTML scrape with operator-configured page list. Registered as tier-2 because page structure is fragile.',

  async poll(opts: SourcePollOptions): Promise<SourceEvent[]> {
    const fetchImpl = opts.fetch ?? globalThis.fetch;
    const accels = (opts.config?.accelerators as AcceleratorConfig[] | undefined) ?? DEFAULT_ACCELERATORS;
    if (accels.length === 0) return [];

    const events: SourceEvent[] = [];
    for (const accel of accels) {
      try {
        const res = await fetchImpl(accel.url, {
          headers: { Accept: 'text/html', 'User-Agent': 'Pathfinder/Funder' },
        });
        if (!res.ok) {
          console.error(`[accelerator-cohort] ${accel.name} fetch failed: ${res.status}`);
          continue;
        }
        const html = await res.text();
        // Generic heuristic: pull <h2>/<h3> titles + the first paragraph,
        // since cohort pages typically list orgs as section headings.
        // Operator can swap this for a per-accelerator parser via config.
        const blocks = [...html.matchAll(/<h[23][^>]*>([^<]+)<\/h[23]>/gi)];
        for (const b of blocks) {
          const title = b[1].trim();
          if (!title) continue;
          events.push({
            source_event_id: `accelerator:${accel.name}:${title}`.toLowerCase().replace(/\s+/g, '-'),
            title,
            summary: `Listed on ${accel.name} cohort page`,
            posted_date: null,
            raw_payload: { accelerator: accel.name, cohort_url: accel.url, title },
          });
        }
      } catch (err) {
        console.error(`[accelerator-cohort] ${accel.name} error:`, err instanceof Error ? err.message : err);
      }
    }
    return events;
  },
};
