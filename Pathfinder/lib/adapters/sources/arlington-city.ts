// lib/adapters/sources/arlington-city.ts
//
// Sprint Z10 adapter — City of Arlington Purchasing (DFW suburb).
// Endpoint: https://www.arlingtontx.gov/city_hall/departments/financial_services/purchasing/current_bids
//
// ENDPOINT DISCOVERY (2026-05-28):
//   Arlington publishes "Current Bids" as an HTML page under
//   /city_hall/departments/financial_services/purchasing/current_bids on
//   the main municipal site. The site is a custom Drupal/CMS instance
//   (not CivicPlus), but the layout is conceptually the same: a main
//   content region containing anchor lists for each open solicitation,
//   typically pointing to a PDF (the bid document) or to a vendor
//   portal (BidNet / IonWave / Periscope) detail page. The page also
//   commonly includes pre-bid meeting and closing-date text adjacent to
//   each anchor.
//
//   ROW SELECTOR: `a[href]` scoped to the main content region after
//   nav/header/footer pruning. Anchors are kept when they look like a
//   solicitation: a PDF, a BidNet/IonWave/Periscope opportunity URL, or
//   an internal "bids/" detail path. Noise links (mailto, anchor jumps,
//   social, accessibility, Title VI) are excluded.
//
//   For each emitted row we try to extract a closing-date string from
//   text near the anchor (looking up to the parent <li>/<tr>/<p>) so
//   the response_deadline carries through to the orchestrator.
//
// FALLBACK STRATEGY:
//   If the page returns non-2xx (WAF / 403) or zero anchors match, we
//   return [] so the orchestrator records `source_empty` / `parser_drift`
//   rather than crashing.
//
// Detail-page enrichment:
//   Top-5 (by soonest closing date when parseable, else first 5) are
//   passed to the shared enrichDetailPages helper. PDF detail URLs are
//   skipped (the helper would just see binary content). Cloudflare /
//   per-URL failures are swallowed by the helper.
//
// Geofence: Arlington → Tarrant County, TX → in-region.

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

const ENDPOINT =
  'https://www.arlingtontx.gov/city_hall/departments/financial_services/purchasing/current_bids';

const AGENCY = 'City of Arlington Purchasing';
const CITY = 'Arlington';
const COUNTY = 'Tarrant County';
const STATE = 'TX';

const NAV_STRIP_SELECTOR =
  'header, nav, footer, .main-menu, .site-header, .site-footer, .skip-link, .breadcrumb';

// Positive filter — anchor must look like a solicitation gateway.
const PROCUREMENT_HREF =
  /\.(pdf|docx?)($|\?)|bidnetdirect\.com|ionwave\.net|periscopeholdings\.com|bonfirehub\.com|publicpurchase\.com|\/bid|\/rfp|\/rfq|\/solicitation|\/current_bids?\//i;

// Hard exclude obvious chrome / non-opportunity links.
const EXCLUDE_HREF =
  /mailto:|^tel:|^#|javascript:|cdn-cgi\/l\/email|title-vi|accessibility|privacy|sitemap|facebook\.com|twitter\.com|youtube\.com|instagram\.com|linkedin\.com/i;

// Recover a closing/due date out of text adjacent to the anchor.
function extractDeadline(text: string): string | null {
  const cleaned = text.replace(/\s+/g, ' ');
  // "Due: March 15, 2026" or "Closes 03/15/2026" or "Closing Date: 2026-03-15"
  const monthDay = cleaned.match(
    /(due|close[sd]?|closing|response\s*deadline|deadline)[^.\n]*?(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4}/i,
  );
  if (monthDay) {
    const m = monthDay[0].match(
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4}/i,
    );
    if (m) return parseLooseDate(m[0]);
  }
  const numeric = cleaned.match(
    /(due|close[sd]?|closing|response\s*deadline|deadline)[^.\n]*?(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/i,
  );
  if (numeric) {
    const m = numeric[0].match(/(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/);
    if (m) return parseLooseDate(m[0]);
  }
  return null;
}

// Try to recover a solicitation/bid # from anchor text or URL so we get a
// stable source_event_id even when the page reorders rows.
function extractSolicitationId(text: string, url: string): string | null {
  const fromText = text.match(/\b(?:RFP|RFQ|IFB|ITB|Bid|Solicitation)[\s#:-]*([A-Z0-9][A-Z0-9._\-/]{3,})/i);
  if (fromText) return fromText[1].toUpperCase();
  const fromUrl = url.match(/\/([A-Z]{2,5}[-_]?\d{2,}[-_A-Z0-9.]*)(?:\.pdf|\/|$)/i);
  if (fromUrl) return fromUrl[1].toUpperCase();
  return null;
}

type Upgrade = {
  phase: BidLifecyclePhase;
  confidence: number;
  buy_window_open: boolean;
  evidence: string;
};

export const arlingtonCityAdapter: SourceAdapter = {
  id: 'arlington-city',
  type: 'registered',
  description:
    'City of Arlington Purchasing — Current Bids landing-page scrape (anchor + nearby date text, with detail-page phase enrichment).',

  async poll(opts): Promise<SourceEvent[]> {
    try {
      let $: CheerioAPI;
      try {
        $ = await pfFetchHtml(ENDPOINT, { fetchImpl: opts.fetch });
      } catch {
        return [];
      }

      $(NAV_STRIP_SELECTOR).remove();

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

      $('a[href]').each((_, el) => {
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

        // Pull surrounding text for date extraction.
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

      // Top-5 for detail enrichment: soonest closing first; skip PDFs since
      // the enricher works on HTML body text.
      const enrichable = geofenced.filter(
        (r) => !/\.pdf($|\?)/i.test(r.sourceUrl),
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
          link_kind: /\.pdf($|\?)/i.test(r.sourceUrl) ? 'pdf' : 'page',
          arlington_raw: r.raw,
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
