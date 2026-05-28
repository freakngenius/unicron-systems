// lib/adapters/sources/dfw-airport.ts
//
// Sprint Z10 adapter — Dallas/Fort Worth International Airport Procurement.
// Endpoint: https://www.dfwairport.com/business/contracts-and-procurement/
//          (HTML scrape — no public JSON feed).
//
// ENDPOINT DISCOVERY (verified 2026-05-28 from sprint notes):
//   DFW Airport's "Contracts and Procurement" page is a server-rendered
//   marketing page that links out to per-solicitation detail pages and
//   PDF bid documents. There is no public unauth JSON endpoint; the
//   substantive opportunity anchors live inside the main `<article>` /
//   `.content-area` region of the page.
//
//   ROW SELECTOR: `a[href]` scoped to main content (after pruning
//   `header, nav, footer, .site-header, .site-footer`). Each anchor is
//   positive-filtered on href — only anchors pointing at solicitation /
//   RFP / IFB / RFQ paths, /business/contracts-and-procurement/* detail
//   pages, or PDF bid docs are surfaced.
//
//   Per-row source_event_id is hashId(`${AGENCY}|${title}|${href}`) so
//   the same gateway dedupes cleanly across cycles.
//
// FALLBACK STRATEGY:
//   If the landing page returns non-2xx or no qualifying anchors parse,
//   return [] so the orchestrator records source_empty / parser_drift.
//
// Detail-page enrichment:
//   Detail URLs are the absolute href of each anchor. PDF URLs will not
//   produce useful HTML; the shared helper swallows the parse miss. HTML
//   detail pages run through the phase-signals regex.
//
// Geofence: DFW Airport straddles Dallas/Tarrant counties; we tag as
// Tarrant County (Procurement's mailing address is on the Tarrant side)
// and the city as "DFW Airport". TX → in-region.
//
// SOURCE_AUTHORITY: airport_authority.

import type { SourceAdapter, SourceEvent } from './types';
import {
  applyEnrichmentToPayload,
  buildEvent,
  enrichDetailPages,
  hashId,
  initialPhaseTagging,
  isInZedcorGeofence,
  parseLooseDate,
  pfFetchHtml,
  type BidLifecyclePhase,
} from './_zedcor-shared';

const ENDPOINT = 'https://www.dfwairport.com/business/contracts-and-procurement/';
const NAV_STRIP_SELECTOR =
  'header, nav, footer, .site-header, .site-footer, .global-nav, .breadcrumb, script, style';
const ROW_SELECTOR = 'a[href]';

const AGENCY = 'DFW International Airport Procurement';
const CITY = 'DFW Airport';
const COUNTY = 'Tarrant County';
const STATE = 'TX';

// Positive filter — an anchor must look like a procurement gateway to be
// emitted. Catches in-site detail pages, vendor portals, and direct PDFs.
const PROCUREMENT_HREF =
  /\/business\/contracts-and-procurement\/[^/?#]+|(rfp|rfq|ifb|itb|csp|solicitation|bid)[\-_/]|\.(pdf|docx?|xlsx?)$|bonfirehub\.com|periscopeholdings|publicpurchase\.com|ionwave\.net/i;

// Hard-exclude obvious non-opportunity links.
const EXCLUDE_HREF =
  /mailto:|^#|tel:|cdn-cgi\/l\/email|\/login|facebook\.com|twitter\.com|x\.com|instagram\.com|youtube\.com|linkedin\.com/i;

function extractDate(text: string): string | null {
  const monthDay = text.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4}/i,
  );
  if (monthDay) return parseLooseDate(monthDay[0]);
  const numeric = text.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\b/);
  if (numeric) return parseLooseDate(numeric[0]);
  return null;
}

function extractSolicitationNumber(text: string): string | null {
  const m = text.match(/\b(RFP|RFQ|IFB|ITB|CSP|BID)[\s\-#]*([0-9]{2,4}[\-\/]?[0-9]{1,5}[A-Z]?)\b/i);
  if (!m) return null;
  return `${m[1].toUpperCase()}-${m[2]}`;
}

export const dfwAirportAdapter: SourceAdapter = {
  id: 'dfw-airport',
  type: 'registered',
  description:
    'DFW International Airport Procurement — contracts-and-procurement page (HTML scrape with phase-enrichment).',

  async poll(opts): Promise<SourceEvent[]> {
    try {
      let $: Awaited<ReturnType<typeof pfFetchHtml>>;
      try {
        $ = await pfFetchHtml(ENDPOINT, { fetchImpl: opts.fetch });
      } catch {
        return [];
      }

      $(NAV_STRIP_SELECTOR).remove();

      const init = initialPhaseTagging();

      type Row = {
        sourceEventId: string;
        title: string;
        sourceUrl: string;
        postedDate: string | null;
        responseDeadline: string | null;
        solicitationNumber: string | null;
      };
      const seen = new Set<string>();
      const rows: Row[] = [];

      $(ROW_SELECTOR).each((_, el) => {
        const $a = $(el);
        const rawHref = $a.attr('href');
        if (!rawHref) return;
        if (EXCLUDE_HREF.test(rawHref)) return;
        if (!PROCUREMENT_HREF.test(rawHref)) return;

        const text = $a.text().trim().replace(/\s+/g, ' ');
        if (!text || text.length < 4) return;

        let absoluteUrl: string;
        try {
          absoluteUrl = new URL(rawHref, ENDPOINT).toString();
        } catch {
          return;
        }

        // Skip the landing page itself if the page links back to itself.
        if (
          absoluteUrl.replace(/\/$/, '') === ENDPOINT.replace(/\/$/, '')
        ) {
          return;
        }

        const solicitationNumber = extractSolicitationNumber(text);
        const stableKey = solicitationNumber
          ? `${AGENCY}|${solicitationNumber}`
          : `${AGENCY}|${text}|${absoluteUrl}`;
        const sourceEventId = hashId(stableKey);
        if (seen.has(sourceEventId)) return;
        seen.add(sourceEventId);

        const extracted = extractDate(text);
        const lower = text.toLowerCase();
        const looksLikeDue = /(due|close|deadline|opens|closing)/.test(lower);

        rows.push({
          sourceEventId,
          title: text,
          sourceUrl: absoluteUrl,
          postedDate: looksLikeDue ? null : extracted,
          responseDeadline: looksLikeDue ? extracted : null,
          solicitationNumber,
        });
      });

      if (rows.length === 0) return [];

      const geofenced = rows.filter(() => isInZedcorGeofence(STATE));
      if (geofenced.length === 0) return [];

      // Top-5 for detail enrichment — prefer HTML rows over PDFs, then
      // sort by posted_date desc.
      const htmlRows = geofenced.filter(
        (r) => !/\.(pdf|docx?|xlsx?)$/i.test(r.sourceUrl),
      );
      const sortedForEnrichment = [...htmlRows].sort((a, b) => {
        const ad = a.postedDate ?? '';
        const bd = b.postedDate ?? '';
        if (ad === bd) return 0;
        if (!ad) return 1;
        if (!bd) return -1;
        return bd.localeCompare(ad);
      });
      const top = sortedForEnrichment.slice(0, 5);
      const detailUrls = top.map((r) => r.sourceUrl);
      const postedDates: Record<string, string | null> = {};
      for (const r of top) postedDates[r.sourceUrl] = r.postedDate;

      let upgrades: Map<string, {
        phase: BidLifecyclePhase;
        confidence: number;
        buy_window_open: boolean;
        evidence: string;
      }> = new Map();
      if (detailUrls.length > 0) {
        const result = await enrichDetailPages({
          detail_urls: detailUrls,
          fetchImpl: opts.fetch,
          posted_dates: postedDates,
        });
        upgrades = result.upgrades;
      }

      const events: SourceEvent[] = [];
      for (const r of geofenced) {
        let payload: Record<string, unknown> = {
          agency: AGENCY,
          city: CITY,
          county: COUNTY,
          state: STATE,
          source_url: r.sourceUrl,
          response_deadline: r.responseDeadline,
          estimated_value: null,
          source_authority: 'airport_authority',
          project_stage: init.project_stage,
          phase_confidence: init.phase_confidence,
          buy_window_open: init.buy_window_open,
          solicitation_number: r.solicitationNumber,
          listing_page_url: ENDPOINT,
          link_kind: /\.(pdf|docx?|xlsx?)$/i.test(r.sourceUrl) ? 'pdf' : 'page',
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
