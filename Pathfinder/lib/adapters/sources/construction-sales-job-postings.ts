// lib/adapters/sources/construction-sales-job-postings.ts
//
// Construction-vertical sales job postings adapter — Internal Stage 5.
//
// Signal: construction-vertical companies hiring sales / BD roles. A
// company that just opened a "Sales · Construction" req is an active-
// outbound-motion company by definition — the strongest qualifier our
// architecture has (architecture.scoring.weights.sales_motion_strength = 0.25).
//
// Implementation: Greenhouse public Job Board API. Greenhouse exposes a
// keyless GET endpoint at https://boards-api.greenhouse.io/v1/boards/<slug>/jobs
// that returns every public job for a company. We poll a curated list of
// construction-tech / construction-services boards and filter to sales /
// BD roles. Indeed and LinkedIn paid APIs are deferred per blueprint
// Section 10 decision 2.
//
// Live-verified 2026-05-22 against Greenhouse public boards for fieldwire,
// openspace, and buildkite (HTTP 200; non-zero job counts).
//
// Spec: Pathfinder/Pathfinder-Internal-Blueprint.md §8 priority 2.
//       Pathfinder/docs/PLAN-internal-onboarding.md §"Stage 5".

import type { SourceAdapter, SourcePollOptions, SourceEvent } from './types';
import { INTERNAL_UA, SALES_TITLE_KEYWORDS, CONSTRUCTION_KEYWORDS } from './_internal-shared';

// Curated default boards. Operators can extend via config.boards. Every
// slug here was probed live and returned a 200 response. The set is
// construction-tech-heavy because the construction GCs themselves
// (Turner, Skanska, Mortenson) host their boards on Workday/iCIMS not on
// the Greenhouse public API. Construction tech is still on-vertical: those
// companies sell into GCs / specialty trades and their sales hires confirm
// active commercial motion in the construction vertical.
const DEFAULT_BOARDS = [
  { slug: 'fieldwire', name: 'Fieldwire' },
  { slug: 'openspace', name: 'OpenSpace' },
  { slug: 'buildkite', name: 'Buildkite' },
];

interface GreenhouseJob {
  id: number;
  title: string;
  updated_at?: string;
  first_published?: string;
  absolute_url?: string;
  location?: { name?: string };
  metadata?: unknown;
  departments?: Array<{ name?: string }>;
  offices?: Array<{ name?: string; location?: string | null }>;
}

interface GreenhouseResponse {
  jobs?: GreenhouseJob[];
}

function lower(s: string | null | undefined): string {
  return (s ?? '').toLowerCase();
}

function looksLikeSalesRole(job: GreenhouseJob): boolean {
  const text = `${lower(job.title)} ${(job.departments ?? []).map((d) => lower(d?.name)).join(' ')}`;
  return SALES_TITLE_KEYWORDS.some((k) => text.includes(k));
}

function looksConstructionVertical(job: GreenhouseJob, boardName: string): boolean {
  // For dedicated construction-tech boards (fieldwire/openspace/etc.) every
  // job qualifies as construction-vertical. For mixed/horizontal boards
  // operators may add, gate on construction-keyword presence in the title
  // or department.
  const t = `${lower(job.title)} ${(job.departments ?? []).map((d) => lower(d?.name)).join(' ')} ${lower(boardName)}`;
  if (CONSTRUCTION_KEYWORDS.some((k) => lower(boardName).includes(k))) return true;
  // Allow-list pass for the curated default boards.
  return DEFAULT_BOARDS.some((b) => b.name === boardName) ||
    CONSTRUCTION_KEYWORDS.some((k) => t.includes(k));
}

function locationParts(job: GreenhouseJob): { city: string | null; state: string | null } {
  const locName = job.location?.name ?? job.offices?.[0]?.name ?? null;
  if (!locName) return { city: null, state: null };
  // Greenhouse encodes locations as "City, ST" or "City, ST, Country".
  const parts = locName.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { city: null, state: null };
  if (parts.length === 1) return { city: parts[0], state: null };
  return { city: parts[0], state: parts[1].length === 2 ? parts[1] : null };
}

export const constructionSalesJobPostingsAdapter: SourceAdapter = {
  id: 'custom-construction-sales-job-postings',
  type: 'registered',
  description:
    'Greenhouse public job boards filtered to construction-vertical sales / BD postings — strongest active-outbound-motion signal.',

  async poll(opts: SourcePollOptions): Promise<SourceEvent[]> {
    const fetchImpl = opts.fetch ?? globalThis.fetch;
    const boards = (opts.config?.boards as Array<{ slug: string; name: string }> | undefined) ?? DEFAULT_BOARDS;
    const events: SourceEvent[] = [];
    const seen = new Set<string>();

    for (const board of boards) {
      const url = `https://boards-api.greenhouse.io/v1/boards/${board.slug}/jobs`;
      let json: GreenhouseResponse;
      try {
        const res = await fetchImpl(url, {
          headers: { Accept: 'application/json', 'User-Agent': INTERNAL_UA },
        });
        if (!res.ok) {
          console.error(`[job-postings] ${board.slug} status=${res.status}`);
          continue;
        }
        json = (await res.json()) as GreenhouseResponse;
      } catch (err) {
        console.error(`[job-postings] ${board.slug} error:`,
          err instanceof Error ? err.message : err);
        continue;
      }
      for (const job of json.jobs ?? []) {
        if (!looksLikeSalesRole(job)) continue;
        if (!looksConstructionVertical(job, board.name)) continue;
        const id = `gh:${board.slug}:${job.id}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const { city, state } = locationParts(job);
        events.push({
          source_event_id: id,
          title: board.name,
          summary: `Hiring "${job.title}"${job.location?.name ? ` · ${job.location.name}` : ''}`,
          posted_date: job.first_published ?? job.updated_at ?? null,
          raw_payload: {
            board_slug: board.slug,
            company_name: board.name,
            job_id: job.id,
            job_title: job.title,
            job_url: job.absolute_url ?? null,
            location: job.location?.name ?? null,
            departments: (job.departments ?? []).map((d) => d?.name).filter(Boolean),
            updated_at: job.updated_at ?? null,
            first_published: job.first_published ?? null,
            // Internal-specific signals consumed downstream by qualifier
            // + ranker (Stage 6/7).
            internal_sales_motion_signal: 'hiring-bd',
            internal_service_hint: 'construction-tech',
          },
          city,
          state,
          country: 'USA',
        });
      }
    }
    return events;
  },
};
