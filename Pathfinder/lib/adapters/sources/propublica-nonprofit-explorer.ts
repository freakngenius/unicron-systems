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
// taxonomy via free-text + the c_code=3 (501(c)(3)) filter. We do not pass
// `ntee[id]` — ProPublica's API rejects the NTEE letter codes (V, W, E, R,
// B) with HTTP 500, and the numeric major-category buckets (1-10) are too
// coarse to be useful (they collapse all "Public, Societal Benefit" into a
// single bucket regardless of sub-code). Free-text matches the sub-name
// + name index well enough; NTEE filtering at the qualifier stage is more
// surgical.
//
// We also bias to recently-founded orgs at the qualifier stage rather
// than via the API (the v2 search response does not expose founded /
// filing dates per row).
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 3.
// Live-verified 2026-05-22 against https://projects.propublica.org/nonprofits/api/v2/.

import type { SourceAdapter, SourcePollOptions, SourceEvent } from './types';

const ENDPOINT = 'https://projects.propublica.org/nonprofits/api/v2/search.json';

interface ThesisQuery {
  q: string;
}

const THESIS_QUERIES: Record<string, ThesisQuery[]> = {
  'ai-safety': [
    { q: 'AI safety alignment' },
    { q: 'machine learning safety' },
  ],
  'ai-governance': [
    { q: 'AI policy governance' },
    { q: 'artificial intelligence policy' },
  ],
  biosecurity: [
    { q: 'pandemic preparedness' },
    { q: 'biosecurity' },
  ],
  longevity: [
    { q: 'aging research' },
    { q: 'longevity' },
  ],
  'civic-infrastructure': [
    { q: 'democracy infrastructure' },
    { q: 'civic technology' },
  ],
  epistemics: [
    { q: 'epistemics forecasting' },
    { q: 'collective intelligence' },
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
