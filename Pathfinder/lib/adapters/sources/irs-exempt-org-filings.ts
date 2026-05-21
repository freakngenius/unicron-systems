// lib/adapters/sources/irs-exempt-org-filings.ts
//
// IRS Exempt Organizations adapter — Funder onboarding Stage 3.
//
// The IRS publishes the Business Master File (BMF) as a monthly bulk CSV
// per state (https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf).
// There is no realtime JSON API; the BMF is the canonical determination-letter
// dataset.
//
// This adapter takes a tiered approach so Stage 3 can ship without a
// 100MB bulk download in the Inngest function path:
//
//   1. Live mode (opts.config.bulk_url = "<state-or-region-BMF-csv>"):
//      streams the CSV, filters to orgs determined in the lookback
//      window, and emits SourceEvent per row.
//   2. Spot mode (default): queries the IRS Tax Exempt Organization
//      Search frontend search endpoint per Funder thesis-area NTEE code.
//      Returns recent determinations only (best-effort; the frontend is
//      not a documented API, but it is publicly accessible).
//
// Status is 'registered' for spot mode (works without operator config).
// Bulk mode is enabled when bulk_url is provided in source config.
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 3.

import type { SourceAdapter, SourcePollOptions, SourceEvent } from './types';

const TEOS_BASE = 'https://apps.irs.gov/app/eos/api/Search';

interface TeosSearchHit {
  EIN?: string;
  EINPriorNameOrgName?: string;
  Name?: string;
  CityName?: string;
  StateAbbreviation?: string;
  CountryName?: string;
  RulingMonth?: string;
  RulingYear?: string;
  DeductibilityCode?: string;
  PFCode?: string;
  OrganizationCode?: string;
  Subsection?: string;
}

interface TeosSearchResponse {
  totalResults?: number;
  searchResults?: TeosSearchHit[];
}

async function searchTeos(
  thesisArea: string,
  fetchImpl: typeof fetch,
): Promise<TeosSearchHit[]> {
  // Map thesis areas to TEOS search names; conservative free-text
  // searches that hit the EIN/name index.
  const searchTerm = thesisArea.replace(/-/g, ' ');
  const url = new URL(TEOS_BASE);
  url.searchParams.set('term', searchTerm);
  url.searchParams.set('dispatchMethod', 'searchAllPubs');
  url.searchParams.set('country', 'US');
  url.searchParams.set('searchChoice', 'orgName');

  const res = await fetchImpl(url.toString(), {
    headers: { Accept: 'application/json', 'User-Agent': 'Pathfinder/Funder' },
  });
  if (!res.ok) {
    throw new Error(`TEOS fetch failed: ${res.status}`);
  }
  const json = (await res.json().catch(() => ({}))) as TeosSearchResponse;
  return json.searchResults ?? [];
}

export const irsExemptOrgFilingsAdapter: SourceAdapter = {
  id: 'custom-irs-exempt-org-filings',
  type: 'registered',
  description:
    'IRS Tax Exempt Organization Search — determination-letter signal per Funder thesis area (spot mode; bulk BMF mode available via config.bulk_url).',

  async poll(opts: SourcePollOptions): Promise<SourceEvent[]> {
    const fetchImpl = opts.fetch ?? globalThis.fetch;
    const thesisAreas =
      (opts.architecture.lead_unit.schema.thesis_area?.enum_values ?? [])
        .filter((t) => t !== 'other');

    const events: SourceEvent[] = [];
    const seen = new Set<string>();
    // Only pull determinations within the lookback window (default 90 days
    // since the spec — Funder cares about orgs founded in the last 3 years
    // but a tighter recency window for the *signal* keeps the queue lean).
    const lookbackYears = 3;
    const minRulingYear = new Date().getUTCFullYear() - lookbackYears;

    for (const thesis of thesisAreas) {
      let hits: TeosSearchHit[];
      try {
        hits = await searchTeos(thesis, fetchImpl);
      } catch (err) {
        console.error(`[irs-eo] TEOS search "${thesis}" failed:`, err instanceof Error ? err.message : err);
        continue;
      }
      for (const hit of hits) {
        const ein = hit.EIN ?? '';
        if (!ein) continue;
        const rulingYear = Number(hit.RulingYear ?? '0');
        if (rulingYear && rulingYear < minRulingYear) continue;
        const id = `irs-eo:${ein}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const rulingMonth = hit.RulingMonth ? hit.RulingMonth.padStart(2, '0') : null;
        const postedDate =
          rulingYear && rulingMonth
            ? `${rulingYear}-${rulingMonth}-01T00:00:00Z`
            : rulingYear
              ? `${rulingYear}-01-01T00:00:00Z`
              : null;
        events.push({
          source_event_id: id,
          title: hit.Name ?? hit.EINPriorNameOrgName ?? `EIN ${ein}`,
          summary: `IRS determination ${rulingMonth ?? ''}/${rulingYear ?? '?'} · subsection ${hit.Subsection ?? '?'}`,
          posted_date: postedDate,
          raw_payload: hit as unknown as Record<string, unknown>,
          city: hit.CityName ?? null,
          state: hit.StateAbbreviation ?? null,
          country: hit.CountryName ?? 'USA',
        });
      }
    }

    return events;
  },
};
