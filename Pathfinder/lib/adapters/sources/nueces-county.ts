// lib/adapters/sources/nueces-county.ts
//
// Sprint Z10 adapter — Nueces County Purchasing (HTML scrape).
// Endpoint: https://www.nuecesco.com/departments/purchasing
//
// ENDPOINT DISCOVERY:
//   Nueces County publishes "Current Bids and RFPs" on its Purchasing page
//   as anchor links to PDF specs (and occasionally to an offsite e-bid
//   portal). There is no JSON API. The page is server-rendered HTML, so we
//   parse it with cheerio via pfFetchHtml.
//
// PARSE STRATEGY:
//   Scan for anchors whose href looks like an opportunity document or
//   solicitation page — `.pdf`, `/bids/`, `/rfp/`, `/rfq/`, `/ifb/` — and
//   skip generic site navigation. Each anchor's visible text becomes the
//   title; the absolute URL becomes both source_url and detail enrichment
//   target. Return [] if zero rows parsed so the orchestrator records
//   source_empty instead of source_failed.
//
//   PDF anchors are NOT sent to enrichDetailPages — the helper strips HTML
//   to text via cheerio and a binary PDF body produces noise, so we only
//   enrich HTML detail pages. PDFs still emit as opportunities with the
//   default phase tagging.
//
// Geofence: Nueces County, TX → in-region.

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

const ENDPOINT = 'https://www.nuecesco.com/departments/purchasing';

const AGENCY = 'Nueces County Purchasing';
const CITY = 'Corpus Christi';
const COUNTY = 'Nueces County';
const STATE = 'TX';

// Heuristic: anchor href looks like a solicitation (PDF or bid-document
// path) — excludes navigation links like /home, /departments, mailto:, #.
const OPPORTUNITY_HREF = /(\.pdf(\?|#|$)|\/bids?\/|\/rfp|\/rfq|\/ifb|solicitation|purchasing.*\.aspx)/i;
const EXCLUDE_HREF = /^#|^mailto:|^tel:|\/home$|\/departments$|javascript:/i;

interface Row {
  sourceEventId: string;
  title: string;
  sourceUrl: string;
  isPdf: boolean;
}

export const nuecesCountyAdapter: SourceAdapter = {
  id: 'nueces-county',
  type: 'registered',
  description:
    'Nueces County Purchasing — current bids and RFPs scraped from the Purchasing department landing page (HTML).',

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

      // Only enrich HTML detail pages; skip direct PDFs (enrichDetailPages
      // strips HTML via cheerio — PDF binary content produces noise).
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
          source_authority: 'county_purchasing',
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
