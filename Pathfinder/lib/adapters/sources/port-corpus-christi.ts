// lib/adapters/sources/port-corpus-christi.ts
//
// Sprint Z10 adapter — Port of Corpus Christi Authority Procurement.
// Endpoint: https://portofcc.com/about/procurement/
//
// ENDPOINT DISCOVERY:
//   The Port of Corpus Christi publishes "Current Opportunities" as a
//   server-rendered list on /about/procurement/ — typically a WordPress
//   page with anchor links to bid spec PDFs, addenda, and occasional
//   subpages like /procurement/<slug>/ for larger projects. No public JSON
//   API is exposed.
//
// PARSE STRATEGY:
//   Scan all anchors and keep those whose href looks like a solicitation:
//   `.pdf`, `/procurement/`, `/bid`, `/rfp`, `/rfq`, `/ifb`, `/solicitation`.
//   Filter out navigation, mailto:, tel:, and self-references back to the
//   procurement index page. Each kept anchor's visible text is the title.
//   Return [] when zero rows parsed so the orchestrator records
//   source_empty.
//
//   Only HTML detail pages flow through enrichDetailPages — direct PDF
//   anchors are skipped because the helper strips HTML via cheerio and
//   binary PDF content produces noise rather than phase signals.
//
// Geofence: Port of Corpus Christi Authority sits in Nueces County, TX.

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

const ENDPOINT = 'https://portofcc.com/about/procurement/';

const AGENCY = 'Port of Corpus Christi Authority';
const CITY = 'Corpus Christi';
const COUNTY = 'Nueces County';
const STATE = 'TX';

const OPPORTUNITY_HREF =
  /(\.pdf(\?|#|$)|\/procurement\/[^\/?#]+|\/bids?\/|\/rfp|\/rfq|\/ifb|solicitation)/i;
const EXCLUDE_HREF = /^#|^mailto:|^tel:|javascript:|\/wp-admin\/|\/wp-login/i;
// Filter the index page itself out so the page doesn't emit itself.
const SELF_INDEX = /\/about\/procurement\/?$/i;

interface Row {
  sourceEventId: string;
  title: string;
  sourceUrl: string;
  isPdf: boolean;
}

export const portCorpusChristiAdapter: SourceAdapter = {
  id: 'port-corpus-christi',
  type: 'registered',
  description:
    'Port of Corpus Christi Authority — current procurement opportunities scraped from portofcc.com /about/procurement/ (HTML).',

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
        if (SELF_INDEX.test(new URL(absoluteUrl).pathname)) return;
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
          source_authority: 'port_authority',
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
