// lib/adapters/sources/irving-city.ts
//
// Sprint Z10 adapter — City of Irving Purchasing (DFW suburb, Dallas County).
// Endpoint: https://www.cityofirving.org/372/Purchasing (CivicPlus CMS)
//
// ENDPOINT DISCOVERY (2026-05-28):
//   Irving runs on CivicPlus. Per the standard CivicPlus pattern, the
//   /372/Purchasing page renders substantive copy inside `.fr-view` or
//   `.content` regions containing anchor lists for current open
//   solicitations. Irving typically points links at the
//   /DocumentCenter/View/{id} PDF document handler (CivicPlus's stock
//   document download route) and at the BidNet Direct / IonWave /
//   Bonfire portals.
//
//   ROW SELECTOR: `a[href]` scoped to `.fr-view, .content,
//   #ContentPlaceHolder1` when present; otherwise the body after
//   header/nav/footer pruning. Anchors are kept when they look like a
//   solicitation gateway (PDF, /DocumentCenter/View/, BidNet, IonWave,
//   Bonfire, RFP/RFQ/IFB path). Adjacent text is scanned for closing-
//   date phrases so the response_deadline carries through.
//
// FALLBACK STRATEGY:
//   If the CivicPlus page returns non-2xx (WAF / 403) or zero anchors
//   match, we return [] so the orchestrator records `source_empty` /
//   `parser_drift` rather than crashing.
//
// Detail-page enrichment:
//   Top-5 (by soonest closing date when parseable, else first 5) flow
//   through the shared enrichDetailPages helper. PDF detail URLs are
//   skipped (DocumentCenter/View returns binary PDFs). Cloudflare /
//   per-URL failures are swallowed.
//
// Geofence: Irving → Dallas County, TX → in-region.

import type { CheerioAPI } from 'cheerio';
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

const ENDPOINT = 'https://www.cityofirving.org/372/Purchasing';

const AGENCY = 'City of Irving Purchasing';
const CITY = 'Irving';
const COUNTY = 'Dallas County';
const STATE = 'TX';

const NAV_STRIP_SELECTOR =
  'header, nav, footer, .main-menu, .site-header, .site-footer, .skip-link, #cpHeader, #cpFooter, .cpHeader, .cpFooter, .breadcrumb';
const CONTENT_SCOPE_SELECTOR = '.fr-view, .content, #ContentPlaceHolder1, main';

const PROCUREMENT_HREF =
  /\.(pdf|docx?)($|\?)|\/DocumentCenter\/View\/|bidnetdirect\.com|ionwave\.net|periscopeholdings\.com|bonfirehub\.com|publicpurchase\.com|\/bid|\/rfp|\/rfq|\/ifb|\/itb|\/solicitation|\/purchasing\/.+/i;

const EXCLUDE_HREF =
  /mailto:|^tel:|^#|javascript:|cdn-cgi\/l\/email|title-vi|accessibility|privacy|sitemap|facebook\.com|twitter\.com|youtube\.com|instagram\.com|linkedin\.com|nextdoor\.com/i;

function extractDeadline(text: string): string | null {
  const cleaned = text.replace(/\s+/g, ' ');
  const monthDay = cleaned.match(
    /(due|close[sd]?|closing|response\s*deadline|deadline|bid\s*opening)[^.\n]*?(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4}/i,
  );
  if (monthDay) {
    const m = monthDay[0].match(
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4}/i,
    );
    if (m) return parseLooseDate(m[0]);
  }
  const numeric = cleaned.match(
    /(due|close[sd]?|closing|response\s*deadline|deadline|bid\s*opening)[^.\n]*?(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/i,
  );
  if (numeric) {
    const m = numeric[0].match(/(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/);
    if (m) return parseLooseDate(m[0]);
  }
  return null;
}

function extractSolicitationId(text: string, url: string): string | null {
  const fromText = text.match(
    /\b(?:RFP|RFQ|IFB|ITB|Bid|Solicitation)[\s#:-]*([A-Z0-9][A-Z0-9._\-/]{3,})/i,
  );
  if (fromText) return fromText[1].toUpperCase();
  // CivicPlus DocumentCenter/View/<numeric id> is stable per document.
  const fromDocCenter = url.match(/\/DocumentCenter\/View\/(\d+)/i);
  if (fromDocCenter) return `DOC-${fromDocCenter[1]}`;
  const fromUrl = url.match(
    /(?:[?&]bidId=|\/opportunities?\/|\/bid\/|\/rfp\/|\/document\/)([A-Z0-9][A-Z0-9._\-]{2,})/i,
  );
  if (fromUrl) return fromUrl[1].toUpperCase();
  return null;
}

type Upgrade = {
  phase: BidLifecyclePhase;
  confidence: number;
  buy_window_open: boolean;
  evidence: string;
};

export const irvingCityAdapter: SourceAdapter = {
  id: 'irving-city',
  type: 'registered',
  description:
    'City of Irving Purchasing — CivicPlus /372/Purchasing landing-page scrape (anchor + nearby date text, with detail-page phase enrichment).',

  async poll(opts): Promise<SourceEvent[]> {
    try {
      let $: CheerioAPI;
      try {
        $ = await pfFetchHtml(ENDPOINT, { fetchImpl: opts.fetch });
      } catch {
        return [];
      }

      $(NAV_STRIP_SELECTOR).remove();
      const $scope = $(CONTENT_SCOPE_SELECTOR).first();
      const $root = $scope.length > 0 ? $scope : $('body');

      const init = initialPhaseTagging();
      const seen = new Set<string>();

      type Row = {
        sourceEventId: string;
        title: string;
        sourceUrl: string;
        responseDeadline: string | null;
        postedDate: string | null;
        raw: Record<string, unknown>;
      };
      const rows: Row[] = [];

      $root.find('a[href]').each((_, el) => {
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

        const $row = $a.closest('li, tr, p, div').first();
        const contextText = ($row.text() || text).replace(/\s+/g, ' ').trim();
        const deadline = extractDeadline(contextText);

        const solicitationId = extractSolicitationId(text, absoluteUrl);
        const sourceEventId =
          solicitationId ?? hashId(`${AGENCY}|${text}|${absoluteUrl}`);
        if (seen.has(sourceEventId)) return;
        seen.add(sourceEventId);

        rows.push({
          sourceEventId,
          title: text.slice(0, 480),
          sourceUrl: absoluteUrl,
          responseDeadline: deadline,
          postedDate: null,
          raw: {
            href: absoluteUrl,
            anchor_text: text,
            context_text: contextText.slice(0, 400),
            solicitation_id: solicitationId,
          },
        });
      });

      if (rows.length === 0) return [];

      const geofenced = rows.filter(() => isInZedcorGeofence(STATE));
      if (geofenced.length === 0) return [];

      const enrichable = geofenced.filter(
        (r) =>
          !/\.pdf($|\?)/i.test(r.sourceUrl) &&
          !/\/DocumentCenter\/View\//i.test(r.sourceUrl),
      );
      const withDeadline = [...enrichable]
        .filter((r) => !!r.responseDeadline)
        .sort((a, b) =>
          (a.responseDeadline ?? '').localeCompare(b.responseDeadline ?? ''),
        )
        .slice(0, 5);
      const detailQueue =
        withDeadline.length > 0 ? withDeadline : enrichable.slice(0, 5);

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
        const isPdfLike =
          /\.pdf($|\?)/i.test(r.sourceUrl) ||
          /\/DocumentCenter\/View\//i.test(r.sourceUrl);
        let payload: Record<string, unknown> = {
          agency: AGENCY,
          city: CITY,
          county: COUNTY,
          state: STATE,
          source_url: r.sourceUrl,
          response_deadline: r.responseDeadline,
          estimated_value: null,
          source_authority: 'city_purchasing',
          project_stage: init.project_stage,
          phase_confidence: init.phase_confidence,
          buy_window_open: init.buy_window_open,
          listing_page_url: ENDPOINT,
          link_kind: isPdfLike ? 'pdf' : 'page',
          irving_raw: r.raw,
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
