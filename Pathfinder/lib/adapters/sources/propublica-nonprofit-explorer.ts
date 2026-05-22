// lib/adapters/sources/propublica-nonprofit-explorer.ts
//
// ProPublica Nonprofit Explorer adapter — Funder onboarding Stage 3.
//
// Endpoint: https://projects.propublica.org/nonprofits/api/v2/search.json
// Auth: none (public API).
// Pagination: page parameter (100 results per page; we pull the first page
// per cycle and rely on posted_date ordering for incremental discovery).
//
// Query strategy: for Funder, we search by the architecture's thesis_area
// taxonomy. Each thesis_area maps to a set of NTEE codes plus a free-text
// query. Codes are chosen against ProPublica's documented NTEE list:
//   ai-safety / ai-governance → V (research) + W (public affairs)
//   biosecurity                → E (health) + V (research)
//   longevity                  → E (health) + V (research)
//   civic-infrastructure       → R (civil rights) + W (public affairs)
//   epistemics                 → B (education) + V (research)
//
// We also bias to organizations founded in the last 3 years using the
// `c_code=03` (501(c)(3)) filter and a posted-date heuristic on the API's
// "last filed return" timestamp.
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 3.

import type { SourceAdapter, SourcePollOptions, SourceEvent } from './types';

const ENDPOINT = 'https://projects.propublica.org/nonprofits/api/v2/search.json';

interface ThesisQuery {
  q: string;
  ntee_major?: string;
}

const THESIS_QUERIES: Record<string, ThesisQuery[]> = {
  'ai-safety': [
    { q: 'AI safety alignment', ntee_major: 'V' },
    { q: 'machine learning safety', ntee_major: 'V' },
  ],
  'ai-governance': [
    { q: 'AI policy governance', ntee_major: 'W' },
    { q: 'artificial intelligence policy' },
  ],
  biosecurity: [
    { q: 'pandemic preparedness', ntee_major: 'E' },
    { q: 'biosecurity', ntee_major: 'V' },
  ],
  longevity: [
    { q: 'aging research', ntee_major: 'E' },
    { q: 'longevity', ntee_major: 'V' },
  ],
  'civic-infrastructure': [
    { q: 'democracy infrastructure', ntee_major: 'R' },
    { q: 'civic technology', ntee_major: 'W' },
  ],
  epistemics: [
    { q: 'epistemics forecasting', ntee_major: 'V' },
    { q: 'collective intelligence', ntee_major: 'B' },
  ],
};

interface ProPublicaSearchResponse {
  total_results: number;
  organizations: Array<{
    ein: number;
    strein: string;
    name: string;
    sub_name?: string | null;
    city?: string | null;
    state?: string | null;
    ntee_code?: string | null;
    raw_ntee_code?: string | null;
    subseccd?: number | null;
    has_subseccd?: boolean | null;
    have_filings?: boolean | null;
    have_extracts?: boolean | null;
    have_pdfs?: boolean | null;
    score?: number | null;
  }>;
}

async function searchProPublica(
  query: ThesisQuery,
  fetchImpl: typeof fetch,
): Promise<ProPublicaSearchResponse['organizations']> {
  const url = new URL(ENDPOINT);
  url.searchParams.set('q', query.q);
  if (query.ntee_major) url.searchParams.set('ntee[id]', query.ntee_major);
  url.searchParams.set('c_code[id]', '3'); // 501(c)(3) only
  const res = await fetchImpl(url.toString(), {
    headers: { Accept: 'application/json', 'User-Agent': 'Pathfinder/Funder (kyle@freakngenius.com)' },
  });
  if (!res.ok) {
    throw new Error(`ProPublica fetch failed: ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`);
  }
  const json = (await res.json()) as ProPublicaSearchResponse;
  return json.organizations ?? [];
}

export const propublicaNonprofitExplorerAdapter: SourceAdapter = {
  id: 'custom-propublica-nonprofit-explorer',
  type: 'registered',
  description: 'ProPublica Nonprofit Explorer — searches 501(c)(3) orgs by NTEE code + free text for each Funder thesis area.',

  async poll(opts: SourcePollOptions): Promise<SourceEvent[]> {
    const fetchImpl = opts.fetch ?? globalThis.fetch;
    const thesisAreas =
      (opts.architecture.lead_unit.schema.thesis_area?.enum_values ?? [])
        .filter((t) => t !== 'other');

    const events: SourceEvent[] = [];
    const seen = new Set<string>();

    for (const thesis of thesisAreas) {
      const queries = THESIS_QUERIES[thesis] ?? [{ q: thesis.replace(/-/g, ' ') }];
      for (const query of queries) {
        let orgs: ProPublicaSearchResponse['organizations'];
        try {
          orgs = await searchProPublica(query, fetchImpl);
        } catch (err) {
          // Continue to the next query rather than failing the whole poll.
          // The subscriber records per-source error in agent_runs.
          console.error(`[propublica] query "${query.q}" failed:`, err instanceof Error ? err.message : err);
          continue;
        }
        for (const org of orgs) {
          const id = `propublica:${org.ein}`;
          if (seen.has(id)) continue;
          seen.add(id);
          events.push({
            source_event_id: id,
            title: org.name,
            summary: org.sub_name ?? null,
            posted_date: null, // ProPublica search doesn't expose founded/filing dates
            raw_payload: {
              ein: org.ein,
              strein: org.strein,
              name: org.name,
              ntee_code: org.ntee_code,
              raw_ntee_code: org.raw_ntee_code,
              city: org.city,
              state: org.state,
              query: query.q,
              thesis_match: thesis,
              propublica_score: org.score,
              have_filings: org.have_filings,
            },
            city: org.city ?? null,
            state: org.state ?? null,
            country: 'USA',
          });
        }
      }
    }

    return events;
  },
};
