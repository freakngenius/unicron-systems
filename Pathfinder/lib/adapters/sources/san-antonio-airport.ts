// lib/adapters/sources/san-antonio-airport.ts
//
// Sprint Z10 adapter — San Antonio Intl Airport (Aviation Department) Contracting.
// Endpoint: https://www.sanantonio.gov/aviation/about/contracting
//
// ENDPOINT DISCOVERY (Sprint Z10):
//   The City of San Antonio Aviation Department lists active contracting
//   opportunities on a small static-ish page at `sanantonio.gov/aviation/about/contracting`.
//   Listings are typically rendered as a bulleted list (`<ul>` of `<li>`)
//   or a small `<table>` of links pointing at either internal CivicEngage
//   detail anchors or external bid-portal URLs (the City typically routes
//   procurement of airport-specific solicitations through the City of San
//   Antonio Purchasing portal — see `san-antonio-city` adapter — but
//   aviation-specific RFPs/RFQs are sometimes posted only here).
//
// SELECTOR STRATEGY:
//   We extract anchors inside the page's main content region whose anchor
//   text suggests a solicitation (RFP/RFQ/IFB/Bid/Proposal/Solicitation
//   keywords) and whose href is not an internal navigation/footer link. Each
//   matched anchor becomes one opportunity row. Page navigation links
//   (Home/Contact/About/etc.) and asset/image hrefs are filtered out.
//
// DETAIL ENRICHMENT:
//   When the linked target is an HTML page we let the shared
//   `enrichDetailPages` helper extract phase signals from the body. PDFs and
//   other binary targets are still emitted as events; the enricher swallows
//   non-HTML fetches as no-upgrade.
//
// Geofence: San Antonio Aviation = Bexar County, TX → in-region.
// source_event_id: stable `hashId(title|href)` — there's no canonical
// solicitation id on this page.

import type { SourceAdapter, SourceEvent } from './types';
import {
  applyEnrichmentToPayload,
  buildEvent,
  enrichDetailPages,
  hashId,
  initialPhaseTagging,
  isInZedcorGeofence,
  pfFetchHtml,
} from './_zedcor-shared';
import type { BidLifecyclePhase } from '../zedcor/phase-signals';

const ENDPOINT = 'https://www.sanantonio.gov/aviation/about/contracting';

// Keywords that indicate an opportunity-style anchor in the airport content.
const OPPORTUNITY_KW =
  /\b(rfp|rfq|ifb|bid|proposal|solicitation|invitation\s+to\s+bid|request\s+for|contract\s+opportunity|opportunity)\b/i;

// Excluded link patterns: navigation, accessibility, mailto, social, images.
const EXCLUDE_HREF =
  /^#|mailto:|tel:|facebook\.com|twitter\.com|youtube\.com|instagram\.com|\.jpg$|\.png$|\.gif$|\.css$|\.js$/i;
const EXCLUDE_TEXT =
  /^(home|contact|about|services|departments|menu|skip\s+to|search|login)$/i;

type Upgrade = {
  phase: BidLifecyclePhase;
  confidence: number;
  buy_window_open: boolean;
  evidence: string;
};

export const sanAntonioAirportAdapter: SourceAdapter = {
  id: 'san-antonio-airport',
  type: 'registered',
  description:
    'San Antonio Intl Airport (Aviation Dept) — contracting page HTML scrape (with detail-page phase enrichment).',

  async poll(opts): Promise<SourceEvent[]> {
    try {
      let $;
      try {
        $ = await pfFetchHtml(ENDPOINT, { fetchImpl: opts.fetch });
      } catch {
        return [];
      }
      const init = initialPhaseTagging();

      type Row = {
        sourceEventId: string;
        title: string;
        sourceUrl: string;
        postedDate: string | null;
      };
      const rows: Row[] = [];
      const seenUrls = new Set<string>();

      // Restrict to the main-content area when present; otherwise fall back to
      // anchors site-wide and let keyword/exclude filters do the work.
      const scope = $('main').length ? $('main a') : $('a');

      scope.each((_, a) => {
        const href = $(a).attr('href');
        if (!href) return;
        if (EXCLUDE_HREF.test(href)) return;
        const text = $(a).text().replace(/\s+/g, ' ').trim();
        if (!text || text.length < 4) return;
        if (EXCLUDE_TEXT.test(text)) return;

        // Surrounding row/list-item text supplements anchor text for the
        // keyword check, so "RFP-25-001" buried in a sibling cell still
        // qualifies a row whose anchor text is "Download".
        const parentText =
          $(a).closest('li,tr,p').first().text().replace(/\s+/g, ' ').trim() || text;
        if (!OPPORTUNITY_KW.test(text) && !OPPORTUNITY_KW.test(parentText)) return;

        let absoluteUrl: string;
        try {
          absoluteUrl = new URL(href, ENDPOINT).toString();
        } catch {
          return;
        }
        // Skip the contracting page itself + sibling Aviation department pages.
        if (absoluteUrl === ENDPOINT) return;
        if (seenUrls.has(absoluteUrl)) return;

        const title =
          parentText.length > text.length && parentText.length < 240
            ? parentText
            : text;

        seenUrls.add(absoluteUrl);
        rows.push({
          sourceEventId: hashId(`${title}|${absoluteUrl}`),
          title,
          sourceUrl: absoluteUrl,
          postedDate: null,
        });
      });

      if (rows.length === 0) return [];

      const geofenced = rows.filter(() => isInZedcorGeofence('TX'));
      if (geofenced.length === 0) return [];

      const detailQueue = geofenced.slice(0, 5);
      const detailUrls = detailQueue.map((r) => r.sourceUrl);
      const postedDates: Record<string, string | null> = {};
      for (const r of detailQueue) postedDates[r.sourceUrl] = r.postedDate;

      let upgrades = new Map<string, Upgrade>();
      if (detailUrls.length > 0) {
        const result = await enrichDetailPages({
          detail_urls: detailUrls,
          fetchImpl: opts.fetch,
          posted_dates: postedDates,
        });
        upgrades = result.upgrades as Map<string, Upgrade>;
      }

      const events: SourceEvent[] = [];
      for (const r of geofenced) {
        let payload: Record<string, unknown> = {
          agency: 'San Antonio Intl Airport (Aviation Dept)',
          city: 'San Antonio',
          county: 'Bexar County',
          state: 'TX',
          source_url: r.sourceUrl,
          response_deadline: null,
          estimated_value: null,
          source_authority: 'airport_authority',
          project_stage: init.project_stage,
          phase_confidence: init.phase_confidence,
          buy_window_open: init.buy_window_open,
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
            posted_date: r.postedDate,
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
