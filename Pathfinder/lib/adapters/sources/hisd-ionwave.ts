// lib/adapters/sources/hisd-ionwave.ts
//
// Sprint Z3 adapter — Houston ISD (IonWave public solicitations portal).
// Endpoint: https://houstonisd.ionwave.net/SourcingEvents.aspx?SourceType=1
//
// PORTAL NOTE (verified 2026-05-28):
//   The documented marketing URL `/CurrentSolicitations.aspx` is NOT a real
//   page on the HISD IonWave skin — it returns the IonWave "Invalid Address
//   Requested" placeholder. The actual public-solicitation landing redirects
//   from `/` → `/Login.aspx`, and the unauthenticated bid grid lives at
//   `/SourcingEvents.aspx?SourceType=1` (linked from the Login page).
//
// SELECTOR NOTE (verified 2026-05-28):
//   The bid list is a Telerik RadGrid rendered with master-table id
//   `ctl00_mainContent_rgBidList_ctl00`. Data rows are `<tr class="rgRow">`
//   and `<tr class="rgAltRow">` with ids matching `ctl00_..._ctl00__\d+`.
//   Columns (in DOM order):
//     [0] view-icon, [1] Bid Number, [2] Bid Title, [3] Bid Type,
//     [4] Organization (display:none), [5] Bid Issue Date,
//     [6] Bid Close Date/Time.
//
//   IonWave does NOT emit per-row anchor tags — clicking a row triggers a
//   Telerik client-side postback that requires an authenticated vendor
//   session to view bid detail. Per-row BidIDs are exposed in the
//   `_clientKeyValues` ClientState JSON blob (e.g. {"0":{"BidID":"2223"}}).
//   We harvest those IDs and build a stable canonical source_url of the
//   form `SourcingEvents.aspx?SourceType=1&BidID=<id>` — this points back
//   to the same public listing page (with BidID as a deep-link hint) and
//   gives the orchestrator's enricher a stable URL per opportunity. No
//   public per-bid detail page exists; detail enrichment therefore re-reads
//   the listing page for the top-5 rows.
//
// Geofence: HISD = Harris County, TX.

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

const ENDPOINT = 'https://houstonisd.ionwave.net/SourcingEvents.aspx?SourceType=1';
const PORTAL_ORIGIN = 'https://houstonisd.ionwave.net';

// Telerik RadGrid master-table — data rows.
const ROW_SELECTOR =
  'table#ctl00_mainContent_rgBidList_ctl00 tr.rgRow, table#ctl00_mainContent_rgBidList_ctl00 tr.rgAltRow';

// IonWave error-page signature; if the portal serves this instead of the
// grid we degrade to an empty event list (orchestrator records the run as
// 0-rows rather than failed).
const IONWAVE_ERROR = /invalid address requested|invalid request/i;

interface ParsedRow {
  rowIndex: number;
  sourceEventId: string;
  bidId: string | null;
  bidNumber: string;
  title: string;
  bidType: string;
  organization: string;
  postedDate: string | null;       // ISO date (YYYY-MM-DD)
  responseDeadline: string | null; // ISO date (YYYY-MM-DD)
  sourceUrl: string;
}

/**
 * Extract per-row BidIDs from the Telerik ClientState JSON. The blob lives
 * inside `"_clientKeyValues":{ "0":{"BidID":"2223"}, "1":{...}, ... }`. The
 * BidID literal only appears in that section, so we can match all entries
 * directly without trying to balance braces. Returns an empty map on any
 * parse failure (defensive — the rest of the adapter still emits rows).
 */
function extractBidIdsByRowIndex(rawHtml: string): Record<number, string> {
  const out: Record<number, string> = {};
  // Match: "<digits>":{"BidID":"<digits>"}
  const re = /"(\d+)"\s*:\s*\{\s*"BidID"\s*:\s*"(\d+)"\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawHtml)) !== null) {
    out[Number(m[1])] = m[2];
  }
  return out;
}

export const hisdIonwaveAdapter: SourceAdapter = {
  id: 'hisd-ionwave',
  type: 'registered',
  description:
    'Houston ISD IonWave public solicitations grid (Telerik RadGrid scrape) — bid number, title, type, issue/close dates.',

  async poll(opts): Promise<SourceEvent[]> {
    try {
      // Fetch the listing page. We also need the raw HTML (not just cheerio)
      // to parse the Telerik ClientState JSON for per-row BidIDs.
      const res = await (opts.fetch ?? fetch)(ENDPOINT, {
        headers: {
          'User-Agent':
            'PathfinderZedcor/1.0 (Houston procurement crawler; kyle@freakngenius.com)',
          Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return [];
      const rawHtml = await res.text();
      if (IONWAVE_ERROR.test(rawHtml.slice(0, 4000))) return [];

      const $ = await pfFetchHtml(ENDPOINT, { fetchImpl: opts.fetch }).catch(
        () => null,
      );
      if (!$) return [];

      const init = initialPhaseTagging();
      const bidIdsByRowIndex = extractBidIdsByRowIndex(rawHtml);

      const rows: ParsedRow[] = [];

      $(ROW_SELECTOR).each((rowIndex, tr) => {
        const cells = $(tr).find('td').toArray();
        // Need at least: icon, number, title, type, [org-hidden], issue, close = 7
        if (cells.length < 6) return;

        // Cells with display:none (the Organization column) still appear in
        // the DOM, so we can index positionally.
        const bidNumber = $(cells[1]).text().trim();
        const title = $(cells[2]).text().trim();
        const bidType = $(cells[3]).text().trim();
        const organization = $(cells[4]).text().trim();
        const issueRaw = $(cells[5]).text().trim();
        // Close cell text looks like "5/28/2026 12:00:00 PM (CT)" — parseLooseDate
        // handles the date portion; strip the trailing "(CT)" timezone hint.
        const closeRaw = $(cells[6]).text().trim().replace(/\s*\(CT\)\s*$/i, '');

        if (!title || /^bid\s+title$/i.test(title)) return;

        const bidId = bidIdsByRowIndex[rowIndex] ?? null;
        const sourceUrl = bidId
          ? `${PORTAL_ORIGIN}/SourcingEvents.aspx?SourceType=1&BidID=${encodeURIComponent(bidId)}`
          : ENDPOINT;

        // Prefer the human bid number for the source_event_id (stable across
        // cycles); fall back to BidID, then a hash of bidNumber|title.
        const sourceEventId =
          bidNumber || bidId || hashId(`${bidNumber}|${title}`);

        rows.push({
          rowIndex,
          sourceEventId,
          bidId,
          bidNumber,
          title,
          bidType,
          organization,
          postedDate: parseLooseDate(issueRaw),
          responseDeadline: parseLooseDate(closeRaw),
          sourceUrl,
        });
      });

      if (rows.length === 0) return [];

      // Geofence: all HISD bids are Harris County, TX. Filter defensively.
      const geofenced = rows.filter(() => isInZedcorGeofence('TX'));

      // Top-5 most-recently-posted for detail enrichment. Rows without a
      // posted_date sort last.
      const ranked = [...geofenced].sort((a, b) => {
        const ad = a.postedDate ?? '';
        const bd = b.postedDate ?? '';
        if (ad === bd) return 0;
        return ad < bd ? 1 : -1;
      });
      const detailUrls = ranked.slice(0, 5).map((r) => r.sourceUrl);
      const postedDates: Record<string, string | null> = {};
      for (const r of ranked.slice(0, 5)) postedDates[r.sourceUrl] = r.postedDate;

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
          agency: 'Houston ISD',
          city: 'Houston',
          county: 'Harris County',
          state: 'TX',
          source_url: r.sourceUrl,
          response_deadline: r.responseDeadline,
          estimated_value: null,
          source_authority: 'school_district',
          ionwave_bid_id: r.bidId,
          ionwave_bid_number: r.bidNumber,
          ionwave_bid_type: r.bidType,
          ionwave_organization: r.organization || null,
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
            summary: r.bidType || null,
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
