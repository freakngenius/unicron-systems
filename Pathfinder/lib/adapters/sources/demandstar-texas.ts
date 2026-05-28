// lib/adapters/sources/demandstar-texas.ts
//
// Sprint Z6 — DemandStar Texas. DemandStar aggregates 8,000+ state and
// local procurement opportunities across Texas. The public-facing search
// endpoint at https://www.demandstar.com/search?state=TX is unauthenticated
// for the listing surface but uses a Next.js-style React app whose data is
// hydrated from a `/api/v1/bids` JSON endpoint.
//
// Endpoint strategy:
//   1) JSON API (preferred): GET https://www.demandstar.com/api/v1/bids?state=TX
//      DemandStar's listing endpoints have shifted shape over time; the
//      adapter tries the documented shape, then falls through to HTML
//      scraping of the search results page.
//   2) HTML listing fallback: scrape /search?state=TX result cards.
//
// DemandStar is in the procurement whitelist (../zedcor/robots-policy.ts),
// so the detail-page-fetcher will bypass Cloudflare for downstream
// enrichment. The adapter itself uses the cheaper native fetch first.

import * as cheerio from 'cheerio';
import type { SourceAdapter, SourceEvent } from './types';
import {
  buildEvent,
  hashId,
  inferCountyFromText,
  initialPhaseTagging,
  parseLooseDate,
  pfFetch,
  pfFetchJson,
} from './_zedcor-shared';

const JSON_ENDPOINT = 'https://www.demandstar.com/api/v1/bids?state=TX&status=open&pageSize=50';
const HTML_FALLBACK = 'https://www.demandstar.com/search?state=TX';

interface DsBid {
  bidId?: string | number;
  bidName?: string | null;
  bidNumber?: string | null;
  agencyName?: string | null;
  agencyCity?: string | null;
  agencyState?: string | null;
  postedDate?: string | null;
  dueDate?: string | null;
  description?: string | null;
}

interface DsResponse {
  data?: DsBid[];
  bids?: DsBid[];
  result?: { bids?: DsBid[] };
  items?: DsBid[];
}

interface Candidate {
  id: string;
  number: string | null;
  title: string;
  agency: string | null;
  city: string | null;
  postedDate: string | null;
  responseDeadline: string | null;
  description: string | null;
  sourceUrl: string;
}

function detailUrlFor(bidId: string | number, slug?: string): string {
  const cleanSlug = slug ? `/${slug.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}` : '';
  return `https://www.demandstar.com/bids/${bidId}${cleanSlug}`;
}

function fromJsonBid(b: DsBid): Candidate | null {
  if (b.bidId == null) return null;
  const id = String(b.bidId);
  const title = (b.bidName ?? '').trim();
  if (!title) return null;
  return {
    id,
    number: (b.bidNumber ?? '').trim() || null,
    title,
    agency: (b.agencyName ?? '').trim() || null,
    city: (b.agencyCity ?? '').trim() || null,
    postedDate: parseLooseDate(b.postedDate ?? null),
    responseDeadline: parseLooseDate(b.dueDate ?? null),
    description: (b.description ?? '').trim() || null,
    sourceUrl: detailUrlFor(id, title),
  };
}

function parseHtmlListing(html: string): Candidate[] {
  const $ = cheerio.load(html);
  const out: Candidate[] = [];
  $('a[href*="/bids/"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const idMatch = href.match(/\/bids\/(\d+)/);
    if (!idMatch) return;
    const id = idMatch[1];
    const title = $(el).text().trim();
    if (!title) return;
    out.push({
      id,
      number: null,
      title,
      agency: null,
      city: null,
      postedDate: null,
      responseDeadline: null,
      description: null,
      sourceUrl: href.startsWith('http') ? href : `https://www.demandstar.com${href}`,
    });
  });
  // de-dup by id
  const seen = new Set<string>();
  return out.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

export const demandstarTexasAdapter: SourceAdapter = {
  id: 'demandstar-texas',
  type: 'registered',
  description:
    'DemandStar Texas — public-facing aggregator of 8,000+ TX state and local procurement opportunities.',

  async poll(opts): Promise<SourceEvent[]> {
    const fetchImpl = opts.fetch ?? fetch;

    let candidates: Candidate[] = [];
    try {
      const payload = await pfFetchJson<DsResponse>(JSON_ENDPOINT, { fetchImpl });
      const bids =
        payload.data ?? payload.bids ?? payload.result?.bids ?? payload.items ?? [];
      candidates = bids.map(fromJsonBid).filter((b): b is Candidate => b != null);
    } catch {
      candidates = [];
    }

    if (candidates.length === 0) {
      try {
        const res = await pfFetch(HTML_FALLBACK, { fetchImpl });
        const body = await res.text();
        candidates = parseHtmlListing(body);
      } catch {
        return [];
      }
    }

    if (candidates.length === 0) return [];

    const init = initialPhaseTagging();
    return candidates.map((c): SourceEvent => {
      const sourceEventId = c.number ? `demandstar:${c.number}` : `demandstar:${hashId(c.id)}`;
      const inferredCounty = inferCountyFromText(`${c.title} ${c.agency ?? ''} ${c.city ?? ''}`);
      return buildEvent({
        source_event_id: sourceEventId,
        title: c.number ? `${c.number} — ${c.title}` : c.title,
        summary: c.description,
        posted_date: c.postedDate,
        raw_payload: {
          agency: c.agency,
          city: c.city,
          county: inferredCounty,
          state: 'TX',
          source_url: c.sourceUrl,
          response_deadline: c.responseDeadline,
          estimated_value: null,
          source_authority: 'public_construction',
          project_stage: init.project_stage,
          phase_confidence: init.phase_confidence,
          buy_window_open: init.buy_window_open,
          demandstar_raw: c,
        },
      });
    });
  },
};
