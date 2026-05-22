// lib/adapters/sources/funder-990-filings.ts
//
// Funder 990 filings adapter — Funder onboarding Stage 3.
//
// IRS Form 990 grant data runs 12-18 months behind the live grant flow.
// Per Build-Spec §2 resolved default 6, this adapter is built at priority
// 5 and its output is treated as enrichment context, not a timely trigger.
//
// Implementation: piggybacks on ProPublica's "filings" endpoint per EIN
// to pull 990 schedule I (grants to organizations) data. The list of
// "anchor philanthropies" to monitor comes from architecture context
// (peer funders); v1 ships a small static list of well-known AI / EA
// adjacent funders and operator extends via config.
//
// Status: 'registered' (works without config; returns context records,
// not timely signals).
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 3.

import type { SourceAdapter, SourcePollOptions, SourceEvent } from './types';

interface PeerFunder {
  ein: string;
  name: string;
}

const DEFAULT_PEER_FUNDERS: PeerFunder[] = [
  // A small starter set of AI/EA-adjacent peer funders; operator extends.
  // EINs are public via ProPublica Nonprofit Explorer. Live-verified
  // 2026-05-22 against https://projects.propublica.org/nonprofits/api/v2/
  // (prior EINs 454962108 + 463254889 returned 404 — the parent entities
  // renamed and re-registered under new EINs).
  { ein: '810737472', name: 'Open Philanthropy' },
  { ein: '471988398', name: 'Effective Ventures Foundation USA' },
];

interface ProPublicaOrgFilingsResponse {
  organization?: { ein?: number; name?: string };
  filings_with_data?: Array<{
    tax_prd?: number;
    tax_prd_yr?: number;
    formtype?: number;
    pdf_url?: string;
    totprgmrevnue?: number | null;
    totfuncexpns?: number | null;
  }>;
}

export const funder990FilingsAdapter: SourceAdapter = {
  id: 'custom-funder-990-filings',
  type: 'registered',
  description:
    'Peer-funder 990 filings — enrichment context (not timely). Pulls latest 990 metadata for the configured peer funder list via ProPublica.',

  async poll(opts: SourcePollOptions): Promise<SourceEvent[]> {
    const fetchImpl = opts.fetch ?? globalThis.fetch;
    const peers = (opts.config?.peer_funders as PeerFunder[] | undefined) ?? DEFAULT_PEER_FUNDERS;

    const events: SourceEvent[] = [];
    for (const peer of peers) {
      const url = `https://projects.propublica.org/nonprofits/api/v2/organizations/${peer.ein}.json`;
      let json: ProPublicaOrgFilingsResponse;
      try {
        const res = await fetchImpl(url, {
          headers: { Accept: 'application/json', 'User-Agent': 'Pathfinder/Funder' },
        });
        if (!res.ok) {
          console.error(`[funder-990] ${peer.name} fetch failed: ${res.status}`);
          continue;
        }
        json = (await res.json()) as ProPublicaOrgFilingsResponse;
      } catch (err) {
        console.error(`[funder-990] ${peer.name} error:`, err instanceof Error ? err.message : err);
        continue;
      }

      const latest = (json.filings_with_data ?? [])[0];
      if (!latest) continue;

      events.push({
        source_event_id: `funder-990:${peer.ein}:${latest.tax_prd ?? latest.tax_prd_yr ?? 'unknown'}`,
        title: `${peer.name} 990 filing (${latest.tax_prd_yr ?? '?'})`,
        summary: `Total functional expenses: ${latest.totfuncexpns ?? '?'} · Form ${latest.formtype ?? '?'}`,
        posted_date: latest.tax_prd_yr ? `${latest.tax_prd_yr}-12-31T23:59:59Z` : null,
        raw_payload: {
          peer_funder_name: peer.name,
          peer_funder_ein: peer.ein,
          tax_prd: latest.tax_prd,
          tax_prd_yr: latest.tax_prd_yr,
          formtype: latest.formtype,
          pdf_url: latest.pdf_url,
          totprgmrevnue: latest.totprgmrevnue,
          totfuncexpns: latest.totfuncexpns,
        },
      });
    }
    return events;
  },
};
