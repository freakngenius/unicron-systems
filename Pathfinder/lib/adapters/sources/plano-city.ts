// lib/adapters/sources/plano-city.ts
//
// Sprint Z10 adapter — City of Plano Purchasing (DFW suburb, Collin County).
// Primary endpoint: https://www.plano.gov/189/Purchasing (CivicPlus CMS)
// Fallback endpoint: https://www.publicpurchase.com/gems/buyer/public/home?syndicatedOrgId=5493&region=TX
//
// ENDPOINT DISCOVERY (2026-05-28):
//   Plano runs on CivicPlus. CivicPlus pages put their substantive
//   content inside `.fr-view` or `.content` regions. The /189/Purchasing
//   page typically lists current solicitations as anchor lists pointing
//   to PublicPurchase.com opportunity pages, BidNet listings, or local
//   PDF documents. Each row's nearby text frequently includes a closing
//   date, due-date, and a solicitation/RFP number.
//
//   Anchor scope: `a[href]` restricted to the `.fr-view, .content,
//   #ContentPlaceHolder1` regions when present; otherwise the whole body
//   after pruning header/nav/footer. Anchors are kept when they look
//   like a solicitation gateway (PublicPurchase, BidNet, IonWave,
//   Bonfire, PDF, RFP/RFQ/IFB/ITB path).
//
//   If the CivicPlus listing returns zero rows (the city sometimes
//   embeds the live list via iframe to PublicPurchase), we try the
//   PublicPurchase syndicated-org landing page for Plano as a broader
//   fallback. PublicPurchase has no public unauth JSON, but its public
//   HTML lists open bids for the syndicated org.
//
// FALLBACK STRATEGY:
//   - CivicPlus page non-2xx → try PublicPurchase fallback.
//   - Both routes fail or yield zero rows → return [] so the
//     orchestrator records `source_empty` / `parser_drift`.
//
// Detail-page enrichment:
//   Top-5 (by soonest closing date when available, else first 5) flow
//   through the shared enrichDetailPages helper. PDF detail URLs are
//   skipped because the helper reads HTML body text. Cloudflare /
//   per-URL failures are swallowed.
//
// Geofence: Plano → Collin County, TX → in-region.

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

const PRIMARY_ENDPOINT = 'https://www.plano.gov/189/Purchasing';
const FALLBACK_ENDPOINT =
  'https://www.publicpurchase.com/gems/buyer/public/home?syndicatedOrgId=5493&region=TX';

const AGENCY = 'City of Plano Purchasing';
const CITY = 'Plano';
const COUNTY = 'Collin County';
const STATE = 'TX';

const NAV_STRIP_SELECTOR =
  'header, nav, footer, .main-menu, .site-header, .site-footer, .skip-link, #cpHeader, #cpFooter, .cpHeader, .cpFooter, .breadcrumb';
const CONTENT_SCOPE_SELECTOR = '.fr-view, .content, #ContentPlaceHolder1, main';

const PROCUREMENT_HREF =
  /\.(pdf|docx?)($|\?)|publicpurchase\.com|bidnetdirect\.com|ionwave\.net|periscopeholdings\.com|bonfirehub\.com|\/bid|\/rfp|\/rfq|\/ifb|\/itb|\/solicitation|\/purchasing\/.+/i;

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

type Row = {
  sourceEventId: string;
  title: string;
  sourceUrl: string;
  responseDeadline: string | null;
  postedDate: string | null;
  pageUrl: string;
  raw: Record<string, unknown>;
};

function scrapeRows($: CheerioAPI, pageUrl: string): Row[] {
  $(NAV_STRIP_SELECTOR).remove();
  // Prefer scoped content if it exists; otherwise scan the body.
  const $scope = $(CONTENT_SCOPE_SELECTOR).first();
  const $root = $scope.length > 0 ? $scope : $('body');

  const seen = new Set<string>();
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
      absoluteUrl = new URL(rawHref, pageUrl).toString();
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
      pageUrl,
      raw: {
        href: absoluteUrl,
        anchor_text: text,
        context_text: contextText.slice(0, 400),
        solicitation_id: solicitationId,
      },
    });
  });

  return rows;
}

export const planoCityAdapter: SourceAdapter = {
  id: 'plano-city',
  type: 'registered',
  description:
    'City of Plano Purchasing — CivicPlus /189/Purchasing landing-page scrape with PublicPurchase syndicated-org fallback.',

  async poll(opts): Promise<SourceEvent[]> {
    try {
      let rows: Row[] = [];

      // Primary: CivicPlus listing.
      try {
        const $ = await pfFetchHtml(PRIMARY_ENDPOINT, { fetchImpl: opts.fetch });
        rows = scrapeRows($, PRIMARY_ENDPOINT);
      } catch {
        rows = [];
      }

      // Fallback: PublicPurchase syndicated-org page.
      if (rows.length === 0) {
        try {
          const $ = await pfFetchHtml(FALLBACK_ENDPOINT, {
            fetchImpl: opts.fetch,
          });
          rows = scrapeRows($, FALLBACK_ENDPOINT);
        } catch {
          return [];
        }
      }

      if (rows.length === 0) return [];

      const geofenced = rows.filter(() => isInZedcorGeofence(STATE));
      if (geofenced.length === 0) return [];

      const init = initialPhaseTagging();

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
          listing_page_url: r.pageUrl,
          link_kind: /\.pdf($|\?)/i.test(r.sourceUrl) ? 'pdf' : 'page',
          plano_raw: r.raw,
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
