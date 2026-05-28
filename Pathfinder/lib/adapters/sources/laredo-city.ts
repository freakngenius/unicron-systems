// lib/adapters/sources/laredo-city.ts
//
// Sprint Z10 adapter — City of Laredo Purchasing.
// Endpoint: https://www.cityoflaredo.com/purchasing
//
// ENDPOINT DISCOVERY:
//   The City of Laredo Purchasing page links to open RFP/RFQ/IFB documents
//   directly as PDF anchors hosted under cityoflaredo.com (or occasionally
//   on a subdomain). No JSON API is exposed. Server-rendered HTML is parsed
//   with cheerio via pfFetchHtml.
//
// PARSE STRATEGY:
//   The PDF anchors are the opportunities. Match anchors whose href looks
//   like a solicitation document: `.pdf`, `/purchasing/`, `/rfp`, `/rfq`,
//   `/ifb`, `/bid`. Exclude navigation, mailto:, and login routes. Each
//   anchor's visible text becomes the title; the absolute URL is the
//   source_url. source_event_id is hashId(agency|title|url) for stable
//   cross-cycle dedupe — Laredo doesn't expose a solicitation ID on the
//   listing page anchor text consistently.
//
//   Direct PDFs skip enrichDetailPages (the helper strips HTML via cheerio
//   and binary PDF bodies produce noise rather than phase signals). HTML
//   detail subpages — if any — are sent through the enricher top-5.
//
//   Return [] when zero rows parsed so the orchestrator records
//   source_empty rather than source_failed.
//
// Geofence: City of Laredo sits in Webb County, TX → in-region.

import type { SourceAdapter, SourceEvent } from './types';
import {
  applyEnrichmentToPayload,
  buildEvent,
  enrichDetailPages,
  hashId,
  initialPhaseTagging,
  isInZedcorGeofence,
  pfFetchHtml,
  type BidLifecyclePhase,
} from './_zedcor-shared';

const ENDPOINT = 'https://www.cityoflaredo.com/purchasing';

const AGENCY = 'City of Laredo Purchasing';
const CITY = 'Laredo';
const COUNTY = 'Webb County';
const STATE = 'TX';

const OPPORTUNITY_HREF =
  /(\.pdf(\?|#|$)|\/rfp|\/rfq|\/ifb|\/bid|\/solicitation|\/purchasing\/[^\/?#]+)/i;
const EXCLUDE_HREF = /^#|^mailto:|^tel:|javascript:|\/login|\/admin/i;
// Filter the purchasing index itself so it doesn't emit itself.
const SELF_INDEX = /\/purchasing\/?$/i;

interface Row {
  sourceEventId: string;
  title: string;
  sourceUrl: string;
  isPdf: boolean;
}

export const laredoCityAdapter: SourceAdapter = {
  id: 'laredo-city',
  type: 'registered',
  description:
    'City of Laredo Purchasing — open RFP/RFQ/IFB PDF anchors scraped from the Purchasing landing page (HTML).',

  async poll(opts): Promise<SourceEvent[]> {
    try {
      if (!isInZedcorGeofence(STATE)) return [];

      const $ = await pfFetchHtml(ENDPOINT, { fetchImpl: opts.fetch });
      const init = initialPhaseTagging();

      const seen = new Set<string>();
      const rows: Row[] = [];

      $('a[href]').each((_, a) => {
        const href = $(a).attr('href');
        const text = $(a).text().trim().replace(/\s+/g, ' ');
        if (!href || !text || text.length < 4) return;
        if (EXCLUDE_HREF.test(href)) return;
        if (!OPPORTUNITY_HREF.test(href)) return;
        let absoluteUrl: string;
        try {
          absoluteUrl = new URL(href, ENDPOINT).toString();
        } catch {
          return;
        }
        let pathname: string;
        try {
          pathname = new URL(absoluteUrl).pathname;
        } catch {
          return;
        }
        if (SELF_INDEX.test(pathname)) return;
        if (seen.has(absoluteUrl)) return;
        seen.add(absoluteUrl);
        const isPdf = /\.pdf(\?|#|$)/i.test(absoluteUrl);
        rows.push({
          sourceEventId: hashId(`${AGENCY}|${text}|${absoluteUrl}`),
          title: text,
          sourceUrl: absoluteUrl,
          isPdf,
        });
      });

      if (rows.length === 0) return [];

      // Only enrich HTML detail pages — PDFs are skipped (binary body noise).
      const htmlRows = rows.filter((r) => !r.isPdf);
      const detailUrls = htmlRows.slice(0, 5).map((r) => r.sourceUrl);
      const postedDates: Record<string, string | null> = {};
      for (const r of htmlRows.slice(0, 5)) postedDates[r.sourceUrl] = null;

      let upgrades = new Map<
        string,
        { phase: BidLifecyclePhase; confidence: number; buy_window_open: boolean; evidence: string }
      >();
      if (detailUrls.length > 0) {
        const result = await enrichDetailPages({
          detail_urls: detailUrls,
          fetchImpl: opts.fetch,
          posted_dates: postedDates,
        });
        upgrades = result.upgrades;
      }

      const events: SourceEvent[] = [];
      for (const r of rows) {
        let payload: Record<string, unknown> = {
          agency: AGENCY,
          city: CITY,
          county: COUNTY,
          state: STATE,
          source_url: r.sourceUrl,
          response_deadline: null,
          estimated_value: null,
          source_authority: 'city_purchasing',
          project_stage: init.project_stage,
          phase_confidence: init.phase_confidence,
          buy_window_open: init.buy_window_open,
          document_type: r.isPdf ? 'pdf' : 'html',
        };
        const upgrade = upgrades.get(r.sourceUrl);
        if (upgrade) {
          payload = applyEnrichmentToPayload(payload, upgrade);
        }
        events.push(
          buildEvent({
            source_event_id: r.sourceEventId,
            title: r.title,
            summary: null,
            posted_date: null,
            raw_payload: payload,
          }),
        );
      }

      return events;
    } catch {
      return [];
    }
  },
};
