// lib/adapters/sources/northside-isd.ts
//
// Sprint Z10 adapter — Northside Independent School District (San Antonio) Purchasing.
// Endpoint: https://www.nisd.net/departments/purchasing
//
// ENDPOINT DISCOVERY (Sprint Z10):
//   Northside ISD's purchasing department surfaces current solicitations on
//   the departmental page at `nisd.net/departments/purchasing`. Active
//   procurements are typically listed as links to:
//     - PDF solicitation packets hosted under `nisd.net/cms/...`
//     - External state portals (TXSmartBuy.com, ESC bid co-ops)
//     - Vendor-portal listings on third-party hosts
//   There is no per-bid JSON endpoint; the page itself is the source of
//   truth.
//
// SELECTOR STRATEGY:
//   Scan anchors inside the main content area whose anchor text or
//   surrounding paragraph mentions an opportunity keyword (RFP, RFQ, IFB,
//   Bid, Proposal, Solicitation). Page navigation, sidebars, and footer
//   links are filtered by an exclude regex. Each matched anchor becomes one
//   opportunity row.
//
// DETAIL ENRICHMENT:
//   Most opportunity targets are PDFs (no phase-signal upgrade — the enricher
//   gracefully no-ops on non-HTML responses). External portals (TXSmartBuy,
//   ESC) return HTML which the shared `enrichDetailPages` helper will scan
//   for phase signals; per-URL failures degrade silently.
//
// Geofence: Northside ISD = Bexar County, TX → in-region.
// source_event_id: stable `hashId(title|href)`.

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

const ENDPOINT = 'https://www.nisd.net/departments/purchasing';

const OPPORTUNITY_KW =
  /\b(rfp|rfq|ifb|bid|proposal|solicitation|invitation\s+to\s+bid|request\s+for|csp|competitive\s+sealed)\b/i;

const EXCLUDE_HREF =
  /^#|mailto:|tel:|facebook\.com|twitter\.com|youtube\.com|instagram\.com|linkedin\.com|\.jpg$|\.png$|\.gif$|\.css$|\.js$/i;
const EXCLUDE_TEXT =
  /^(home|contact|about|departments|menu|skip\s+to|search|login|staff\s+directory|sign\s+in)$/i;

type Upgrade = {
  phase: BidLifecyclePhase;
  confidence: number;
  buy_window_open: boolean;
  evidence: string;
};

export const northsideIsdAdapter: SourceAdapter = {
  id: 'northside-isd',
  type: 'registered',
  description:
    'Northside ISD Purchasing — departmental page HTML scrape (links to PDFs and external portals; detail-page phase enrichment when HTML).',

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

      const scope = $('main').length ? $('main a') : $('a');

      scope.each((_, a) => {
        const href = $(a).attr('href');
        if (!href) return;
        if (EXCLUDE_HREF.test(href)) return;
        const text = $(a).text().replace(/\s+/g, ' ').trim();
        if (!text || text.length < 4) return;
        if (EXCLUDE_TEXT.test(text)) return;

        const parentText =
          $(a).closest('li,tr,p,div').first().text().replace(/\s+/g, ' ').trim() || text;
        if (!OPPORTUNITY_KW.test(text) && !OPPORTUNITY_KW.test(parentText)) return;

        let absoluteUrl: string;
        try {
          absoluteUrl = new URL(href, ENDPOINT).toString();
        } catch {
          return;
        }
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
          agency: 'Northside ISD Purchasing',
          city: 'San Antonio',
          county: 'Bexar County',
          state: 'TX',
          source_url: r.sourceUrl,
          response_deadline: null,
          estimated_value: null,
          source_authority: 'k12_purchasing',
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
