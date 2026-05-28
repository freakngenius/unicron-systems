// lib/adapters/sources/houston-public-works.ts
//
// Sprint Z3 adapter — Houston Public Works / Office of Business Opportunity.
//
// SELECTOR NOTE (verified 2026-05-28):
//   The OBO landing page at /office-business-opportunity is an informational
//   directory — it explicitly links readers to the canonical "current
//   opportunities" sub-page /contracting-services for actual construction
//   bid sets and advertised bids. The previous adapter scanned <a> tags on
//   the OBO landing page with a keyword regex and surfaced nav text instead
//   of real opportunities.
//
//   The /contracting-services page distributes its substantive links across
//   two Drupal Cohesion component types: `div.coh-wysiwyg` (rich-text
//   blocks holding the Forecast PDF link) and `div.coh-ce-cpt_link` (the
//   button-style link to CivCast). To capture both — and the OBO landing
//   page's analogous Vendor Portal anchor — the selector is a broad
//   `a[href]` scoped to main content (after pruning header/nav/footer).
//
//   HPW exposes these distinct opportunity gateways:
//     1. CivCast publisher portal — the live bid-set, RFP, and bid-tab feed
//        (civcastusa.com/publishers/{HPW publisher id}). CivCast itself is
//        an Angular SPA with no public unauth JSON endpoint; we surface the
//        gateway URL so the detail-page enricher can scan its rendered
//        markup for phase signals on the next visit.
//     2. The quarterly "12 Months Advertisement Forecast" PDF
//        (/sites/g/files/nwywnm456/files/doc/...advertisement_report*.pdf)
//        which lists every upcoming HPW construction advertisement with a
//        planned advertise date and dollar estimate.
//     3. The City of Houston "Purchasing Houston" vendor portal
//        (purchasinghouston.org) — formal bids and RFP postings.
//
//   ROW SELECTOR: `a[href]` (after pruning `header, nav, footer,
//   .main-menu, .menu-level-2, .menu-level-3` from the document).
//   The href is then matched against PROCUREMENT_HREF (positive filter)
//   to drop noise links (Title VI policy, social, OBO landing, etc.).
//
//   Per-row source_event_id is hashId(`${agency}|${title}|${href}`) so
//   the same gateway dedupes cleanly across cycles even when the PDF
//   filename rolls over each quarter (the visible title carries the
//   date range; same date range = same id).
//
// Geofence: every row is Houston / Harris County / TX.
//
// SOURCE_AUTHORITY: public_construction.

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
} from './_zedcor-shared';

const ENDPOINT = 'https://www.houstonpublicworks.org/office-business-opportunity';
const CONTRACTING_SUBPAGE = 'https://www.houstonpublicworks.org/contracting-services';
const NAV_STRIP_SELECTOR =
  'header, nav, footer, .main-menu, .menu-level-2, .menu-level-3, .coh-style-site-header, .coh-style-site-footer';
const ROW_SELECTOR = 'a[href]';

const AGENCY = 'Houston Public Works';
const CITY = 'Houston';
const COUNTY = 'Harris County';
const STATE = 'TX';

// Positive filter — an anchor must look like a procurement gateway to be
// emitted. Drops nav, footer, Title VI, mailto:, anchor jumps, and the
// non-procurement "vendor portal" landing.
const PROCUREMENT_HREF =
  /(civcastusa\.com\/publishers\/|advertisement_report|advertisement_forecast|construction_bid|bid_set|capital_projects_forecast|purchasinghouston\.org)/i;

// Hard-exclude obvious non-opportunity links that happen to live in the
// WYSIWYG block alongside the real gateways.
const EXCLUDE_HREF = /mailto:|^#|cdn-cgi\/l\/email|title-vi/i;

// Heuristic: try to recover a "as of" or date range from the anchor text
// (e.g. "12 Months Advertisement Forecast: March 01, 2025 – February 28, 2026")
// and treat the START date as the row's posted_date. Falls back to null.
function extractPostedDate(text: string): string | null {
  // Match either "Month DD, YYYY" or "MM/DD/YYYY" or "YYYY-MM-DD" — earliest first.
  const monthDay = text.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4}/i,
  );
  if (monthDay) return parseLooseDate(monthDay[0]);
  const numeric = text.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\b/);
  if (numeric) return parseLooseDate(numeric[0]);
  return null;
}

export const houstonPublicWorksAdapter: SourceAdapter = {
  id: 'houston-public-works',
  type: 'registered',
  description:
    'Houston Public Works Office of Business Opportunity — construction-bid gateways scraped from /contracting-services (HTML scrape).',

  async poll(opts): Promise<SourceEvent[]> {
    try {
      // The OBO landing page is informational. The actual opportunity
      // gateways live on /contracting-services. We fetch both pages so we
      // can union anchors in case HPW moves the gateway pointers around.
      const pages: Array<{ url: string; $: Awaited<ReturnType<typeof pfFetchHtml>> }> = [];
      try {
        const $obo = await pfFetchHtml(ENDPOINT, { fetchImpl: opts.fetch });
        pages.push({ url: ENDPOINT, $: $obo });
      } catch {
        // Landing page failure is non-fatal — the sub-page is the
        // canonical source of opportunities.
      }
      try {
        const $sub = await pfFetchHtml(CONTRACTING_SUBPAGE, { fetchImpl: opts.fetch });
        pages.push({ url: CONTRACTING_SUBPAGE, $: $sub });
      } catch {
        // If the sub-page also fails we bail rather than returning
        // noise from the landing-page nav.
        if (pages.length === 0) return [];
      }

      const init = initialPhaseTagging();

      type Row = {
        sourceEventId: string;
        title: string;
        sourceUrl: string;
        pageUrl: string;
        postedDate: string | null;
      };
      const seen = new Set<string>();
      const rows: Row[] = [];

      for (const { url: pageUrl, $ } of pages) {
        // Strip site chrome so we don't surface nav anchors as opportunities.
        $(NAV_STRIP_SELECTOR).remove();
        $(ROW_SELECTOR).each((_, el) => {
          const $a = $(el);
          const rawHref = $a.attr('href');
          if (!rawHref) return;
          if (EXCLUDE_HREF.test(rawHref)) return;
          if (!PROCUREMENT_HREF.test(rawHref)) return;

          const text = $a.text().trim().replace(/\s+/g, ' ');
          if (!text || text.length < 3) return;

          let absoluteUrl: string;
          try {
            absoluteUrl = new URL(rawHref, pageUrl).toString();
          } catch {
            return;
          }

          const sourceEventId = hashId(`${AGENCY}|${text}|${absoluteUrl}`);
          if (seen.has(sourceEventId)) return;
          seen.add(sourceEventId);

          rows.push({
            sourceEventId,
            title: text,
            sourceUrl: absoluteUrl,
            pageUrl,
            postedDate: extractPostedDate(text),
          });
        });
      }

      if (rows.length === 0) return [];

      // Geofence: every row is Houston / TX. Defensive filter.
      const geofenced = rows.filter(() => isInZedcorGeofence(STATE));

      // Top-5 by posted_date desc (nulls last) for detail-page enrichment.
      const sortedForEnrichment = [...geofenced].sort((a, b) => {
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

      let upgrades: Awaited<ReturnType<typeof enrichDetailPages>>['upgrades'] = new Map();
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
          response_deadline: null,
          estimated_value: null,
          source_authority: 'public_construction',
          project_stage: init.project_stage,
          phase_confidence: init.phase_confidence,
          buy_window_open: init.buy_window_open,
          listing_page_url: r.pageUrl,
          link_kind: r.sourceUrl.toLowerCase().endsWith('.pdf')
            ? 'pdf'
            : /civcastusa\.com/i.test(r.sourceUrl)
              ? 'portal'
              : 'page',
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
