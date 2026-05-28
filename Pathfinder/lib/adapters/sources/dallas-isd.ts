// lib/adapters/sources/dallas-isd.ts
//
// Sprint Z10 adapter — Dallas Independent School District Procurement.
// Endpoint: https://www.dallasisd.org/Page/2243 (HTML scrape — no public JSON).
//
// ENDPOINT DISCOVERY (verified 2026-05-28 from sprint notes):
//   Dallas ISD publishes their open solicitations on a Blackboard-CMS page
//   at /Page/2243 (the "Procurement Services — Current Bids" page). There
//   is no public JSON feed; the page renders a static list of anchor tags
//   pointing to either:
//     1. PDF bid documents under /cms/lib/TX01001475/... (relative paths),
//     2. Direct links to vendor portals / detail pages,
//     3. Internal Blackboard CMS subpages with sub-listings.
//
//   ROW SELECTOR: `a[href]` scoped to the main content (after pruning
//   `header, nav, footer`). Each anchor is positive-filtered on its href —
//   only anchors that point at `/cms/lib`, a bid PDF, an explicit
//   solicitation/RFP/RFQ/ITB keyword, or an external procurement portal
//   are surfaced.
//
//   Per-row source_event_id is hashId(`${AGENCY}|${title}|${href}`) so the
//   same anchor dedupes cleanly across cycles even as Blackboard rolls
//   over individual PDF filenames.
//
// FALLBACK STRATEGY:
//   If /Page/2243 returns non-2xx or no qualifying anchors parse, return
//   [] so the orchestrator records source_empty / parser_drift.
//
// Detail-page enrichment:
//   Detail URLs are the absolute href of each anchor (PDF or detail page).
//   PDFs will not produce useful HTML; the shared enrichDetailPages
//   helper swallows the parse miss and the row keeps its default phase
//   tagging. HTML detail pages run through the phase-signals regex.
//
// Geofence: Dallas ISD → Dallas County, TX → in-region.
//
// SOURCE_AUTHORITY: school_district.

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

const ENDPOINT = 'https://www.dallasisd.org/Page/2243';
const NAV_STRIP_SELECTOR =
  'header, nav, footer, .ax-main-menu, .ax-channel-bar, .ax-footer, #ax-footer, #ax-header, script, style';
const ROW_SELECTOR = 'a[href]';

const AGENCY = 'Dallas ISD Procurement';
const CITY = 'Dallas';
const COUNTY = 'Dallas County';
const STATE = 'TX';

// Positive filter: only treat an anchor as a procurement opportunity if it
// points at a CMS-hosted bid PDF, a numbered solicitation, or contains an
// RFP/RFQ/ITB/CSP/bid keyword path component.
const PROCUREMENT_HREF =
  /\/cms\/lib\/|\.(pdf|docx?|xlsx?)$|(rfp|rfq|itb|csp|bid|solicitation)[\-_/]/i;

// Hard-exclude common non-opportunity links that appear in CMS sidebars.
const EXCLUDE_HREF =
  /mailto:|^#|tel:|cdn-cgi\/l\/email|\/login|\/Page\/1\b|\/Page\/2\b|facebook\.com|twitter\.com|instagram\.com|youtube\.com/i;

// Heuristic: pull a date out of anchor text — e.g. "RFP 25-046 — Due 06/15/2025"
// → 2025-06-15. Falls back to null.
function extractDate(text: string): string | null {
  const monthDay = text.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4}/i,
  );
  if (monthDay) return parseLooseDate(monthDay[0]);
  const numeric = text.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\b/);
  if (numeric) return parseLooseDate(numeric[0]);
  return null;
}

// Pull a solicitation number out of anchor text — e.g. "RFP 25-046 ...".
// Used as a stability anchor for the source_event_id when present.
function extractSolicitationNumber(text: string): string | null {
  const m = text.match(/\b(RFP|RFQ|ITB|CSP|BID)[\s\-#]*([0-9]{2,4}[\-\/]?[0-9]{1,5}[A-Z]?)\b/i);
  if (!m) return null;
  return `${m[1].toUpperCase()}-${m[2]}`;
}

export const dallasIsdAdapter: SourceAdapter = {
  id: 'dallas-isd',
  type: 'registered',
  description:
    'Dallas ISD Procurement — Blackboard CMS bids page (HTML scrape with phase-enrichment).',

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

        const solicitationNumber = extractSolicitationNumber(text);
        const stableKey = solicitationNumber
          ? `${AGENCY}|${solicitationNumber}`
          : `${AGENCY}|${text}|${absoluteUrl}`;
        const sourceEventId = hashId(stableKey);
        if (seen.has(sourceEventId)) return;
        seen.add(sourceEventId);

        // Date heuristics — text may carry either a posted date or a due
        // date. We can't distinguish without per-row context; emit it as
        // response_deadline if the anchor text contains "due" / "close" /
        // "deadline", else as posted_date.
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

      // Top-5 for detail enrichment: prefer rows whose detail URL is HTML
      // (not a PDF — phase-signals regex needs text), then sort by posted
      // date desc.
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
          source_authority: 'school_district',
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
