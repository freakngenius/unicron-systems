// lib/adapters/sources/austin-bergstrom.ts
//
// Sprint Z10 adapter — Austin-Bergstrom International Airport (AUS)
// procurement. Endpoint:
//   https://www.austintexas.gov/department/austin-bergstrom-international-airport-procurement
//
// ENDPOINT DISCOVERY (verified 2026-05-28):
//   The ABIA procurement page is a thin Drupal landing-page that frequently
//   redirects users back to the main City of Austin eResponse portal. On
//   most polls there are zero airport-specific bid rows — the page is
//   either empty body content + a "Visit eResponse" CTA, or it shows a
//   short list of <a> links to open RFP / IFB PDFs hosted on
//   austintexas.gov/sites/default/files/files/Aviation/.
//
//   Strategy: scrape the landing page. Look for rows with bid-like text
//   ("RFP", "IFB", "RFQ", "Solicitation", "Bid") inside any <li>, <td>,
//   or <p><a> structure under the main content region. If zero rows
//   parse, return [] (the expected steady-state). Each row is emitted
//   with the absolute URL it links to (often a PDF). The shared
//   detail-page enricher handles HTML detail pages only — PDF links
//   simply skip enrichment.
//
// FALLBACK STRATEGY:
//   Empty result is the norm — the orchestrator records source_empty.
//   No retry against the eResponse portal here; the parallel
//   `austin-eresponse` adapter already covers that surface.
//
// Geofence: Austin / Travis County, TX → in-region.

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
import type { BidLifecyclePhase } from '../zedcor/phase-signals';

const ENDPOINT =
  'https://www.austintexas.gov/department/austin-bergstrom-international-airport-procurement';

// Recognize procurement-style link text. Airport postings almost always
// embed one of these tokens in the anchor text or filename.
const BID_TOKEN_RE = /\b(RFP|IFB|RFQ|RFI|IDIQ|Solicitation|Bid|Notice to Bidders|Pre-?Proposal)\b/i;
// Exclude obvious navigation / footer items.
const EXCLUDE_HREF_RE = /(^#|^javascript:|mailto:|austintexas\.gov\/contact|austintexas\.gov\/help)/i;
// Closed / archive flagging.
const HISTORICAL_RE = /\b(closed|awarded|cancelled|canceled|archive|archived|past|prior)\b/i;

type Row = {
  sourceEventId: string;
  title: string;
  sourceUrl: string;
  postedDate: string | null;
  responseDeadline: string | null;
};

export const austinBergstromAdapter: SourceAdapter = {
  id: 'austin-bergstrom',
  type: 'registered',
  description:
    'Austin-Bergstrom Intl Airport (AUS) procurement landing page — HTML scrape for solicitation links; often empty between cycles.',

  async poll(opts): Promise<SourceEvent[]> {
    try {
      let $: Awaited<ReturnType<typeof pfFetchHtml>>;
      try {
        $ = await pfFetchHtml(ENDPOINT, { fetchImpl: opts.fetch });
      } catch {
        return [];
      }

      const init = initialPhaseTagging();
      const rows: Row[] = [];
      const seen = new Set<string>();

      // Scan the main content region. austintexas.gov typically wraps the
      // department body in #block-system-main / .field-name-body / main.
      const $main = $('main, #main-content, .region-content, .field-name-body, #block-system-main').first();
      const root = $main.length > 0 ? $main : $('body');

      root.find('a[href]').each((_, a) => {
        const $a = $(a);
        const href = $a.attr('href');
        if (!href) return;
        if (EXCLUDE_HREF_RE.test(href)) return;
        const text = $a.text().trim().replace(/\s+/g, ' ');
        if (!text || text.length < 4) return;

        // Bid-token must appear in either the link text or the surrounding
        // list-item / paragraph text so we don't over-match the page nav.
        const parentText = $a.closest('li, p, tr, td').text().trim().replace(/\s+/g, ' ');
        if (!BID_TOKEN_RE.test(text) && !BID_TOKEN_RE.test(parentText)) return;
        if (HISTORICAL_RE.test(parentText)) return;

        let absoluteUrl: string;
        try {
          absoluteUrl = new URL(href, ENDPOINT).toString();
        } catch {
          return;
        }
        // Skip self-links back to this landing page.
        if (absoluteUrl.replace(/[#?].*$/, '') === ENDPOINT) return;
        if (seen.has(absoluteUrl)) return;
        seen.add(absoluteUrl);

        // Pull any inline date hints from the parent block.
        const dateMatch = parentText.match(
          /\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|[A-Z][a-z]+ \d{1,2},? \d{4})\b/,
        );
        const inlineDate = dateMatch ? parseLooseDate(dateMatch[1]) : null;

        const sourceEventId = hashId(`austin-bergstrom|${text}|${absoluteUrl}`);
        rows.push({
          sourceEventId,
          title: text,
          sourceUrl: absoluteUrl,
          postedDate: null,
          responseDeadline: inlineDate,
        });
      });

      if (rows.length === 0) return [];

      const geofenced = rows.filter(() => isInZedcorGeofence('TX'));
      if (geofenced.length === 0) return [];

      // Detail enrichment: top-5 in listing order (no posted_date on this
      // page). PDF links 404 the cheerio parser cleanly — enrichDetailPages
      // swallows per-URL errors so PDFs don't kill the batch.
      const detailQueue = geofenced.slice(0, 5);
      const detailUrls = detailQueue.map((r) => r.sourceUrl);
      const postedDates: Record<string, string | null> = {};
      for (const r of detailQueue) postedDates[r.sourceUrl] = r.postedDate;

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
      for (const r of geofenced) {
        let payload: Record<string, unknown> = {
          agency: 'Austin-Bergstrom Intl Airport',
          city: 'Austin',
          county: 'Travis County',
          state: 'TX',
          source_url: r.sourceUrl,
          response_deadline: r.responseDeadline,
          estimated_value: null,
          source_authority: 'airport_procurement',
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
