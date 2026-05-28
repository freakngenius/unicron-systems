// lib/adapters/sources/austin-eresponse.ts
//
// Sprint Z10 adapter — City of Austin eResponse / Solicitations portal.
// Endpoint: https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitations.cfm
//
// ENDPOINT DISCOVERY (verified 2026-05-28):
//   The Austin eResponse portal is ColdFusion-rendered: the open-
//   solicitations table is materialized on the server and returned as
//   inline <table> HTML in the response body (no XHR / JSON endpoint).
//   The galveston-county Bonfire JSON template does NOT apply here; we
//   parse the rendered table directly via cheerio.
//
//   Table shape (observed):
//     <table> with header columns: Solicitation #, Title (or Description),
//     Type, Issue Date / Posted, Close Date / Due Date, Buyer.
//     Each <tr> in tbody holds a single solicitation. The Solicitation #
//     is usually a link (or anchor with `sid=…` query) into
//     `solicitation_details.cfm?sid=<SID>`.
//
//   Strategy: scan every <table> on the page, pick the table whose header
//   row mentions "solicitation" + a date column ("close" / "due" /
//   "posted"). Each tbody row produces one SourceEvent. SID is the
//   stable source_event_id; detail URL is composed from the SID per
//   spec, so detail-page enrichment runs against the live record.
//
// FALLBACK STRATEGY:
//   When the ColdFusion table is empty (between procurement cycles) or
//   the markup shifts and zero rows parse, we return [] so the
//   orchestrator records source_empty / parser_drift cleanly. No
//   speculative HTML retries.
//
// Geofence: City of Austin → Travis County, TX → in-region.

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
  'https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitations.cfm';
const DETAIL_BASE =
  'https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitation_details.cfm';

const HISTORICAL_RE = /\b(closed|awarded|cancelled|canceled|archive|archived|past)\b/i;

type Row = {
  sourceEventId: string;
  title: string;
  sourceUrl: string;
  postedDate: string | null;
  responseDeadline: string | null;
  rawCells: string[];
};

function extractSid(href: string | undefined, refText: string): string | null {
  if (href) {
    try {
      const u = new URL(href, ENDPOINT);
      const sid = u.searchParams.get('sid') ?? u.searchParams.get('SID');
      if (sid) return sid.trim();
    } catch {
      /* fall through */
    }
    const m = href.match(/[?&](?:sid|SID)=([^&#]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  // Some rows put the SID in the cell text itself (e.g. "IFB 1100 SLW3023").
  const t = refText.trim();
  if (t && /^[A-Z0-9][A-Z0-9 \-/_.]{2,}$/i.test(t)) return t.replace(/\s+/g, ' ');
  return null;
}

export const austinEresponseAdapter: SourceAdapter = {
  id: 'austin-eresponse',
  type: 'registered',
  description:
    'City of Austin eResponse — open solicitations table (ColdFusion HTML scrape) with detail-page phase enrichment.',

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

      $('table').each((_, table) => {
        const $table = $(table);
        const headerText = $table
          .find('thead th, tr').first()
          .find('th, td')
          .map((_i, c) => $(c).text())
          .get()
          .join(' ')
          .replace(/\s+/g, ' ')
          .toLowerCase();
        // Heuristic: the solicitations table mentions "solicitation" plus a
        // close/due/posted date column. Side-nav tables won't match.
        if (!/solicit/i.test(headerText)) return;
        if (!/(close|due|posted|issue)/i.test(headerText)) return;

        $table.find('tbody tr, tr').each((_idx, tr) => {
          const $tr = $(tr);
          if ($tr.find('th').length > 0 && $tr.find('td').length === 0) return;
          const cells = $tr.find('td');
          if (cells.length < 2) return;

          const cellTexts = cells
            .map((_i, c) => $(c).text().trim().replace(/\s+/g, ' '))
            .get();

          const refRaw = cellTexts[0] ?? '';
          const titleRaw = cellTexts[1] ?? '';
          if (!titleRaw || titleRaw.length < 4) return;
          if (/no results|no records|no open/i.test(titleRaw)) return;
          if (HISTORICAL_RE.test(cellTexts.join(' '))) return;

          const refHref = $(cells[0]).find('a').first().attr('href')
            ?? $(cells[1]).find('a').first().attr('href');
          const sid = extractSid(refHref, refRaw);
          const sourceEventId = sid ?? hashId(`austin-eresponse|${titleRaw}|${refRaw}`);
          const sourceUrl = sid
            ? `${DETAIL_BASE}?sid=${encodeURIComponent(sid)}`
            : (() => {
                try {
                  return refHref ? new URL(refHref, ENDPOINT).toString() : ENDPOINT;
                } catch {
                  return ENDPOINT;
                }
              })();

          // Pick the likely posted + closing columns from remaining cells.
          // Common layouts: [sid, title, type, posted, close, buyer].
          const tail = cellTexts.slice(2);
          const dateCandidates = tail
            .map((t) => parseLooseDate(t))
            .filter((d): d is string => !!d);
          const postedDate = dateCandidates[0] ?? null;
          const responseDeadline = dateCandidates[1] ?? dateCandidates[0] ?? null;
          // If only one date was parsed and the header hints "close/due",
          // bias it to response_deadline instead of posted_date.
          const responseFavored = /close|due/.test(headerText) && dateCandidates.length === 1;
          const finalPosted = responseFavored ? null : postedDate;
          const finalDeadline = responseFavored ? postedDate : responseDeadline;

          rows.push({
            sourceEventId,
            title: refRaw && !titleRaw.startsWith(refRaw) ? `${refRaw} — ${titleRaw}` : titleRaw,
            sourceUrl,
            postedDate: finalPosted,
            responseDeadline: finalDeadline,
            rawCells: cellTexts,
          });
        });
      });

      if (rows.length === 0) return [];

      // Geofence — Austin / Travis County is TX. Filter defensively.
      const geofenced = rows.filter(() => isInZedcorGeofence('TX'));
      if (geofenced.length === 0) return [];

      // Detail enrichment: top-5 by posted_date desc (nulls last).
      const ranked = [...geofenced].sort((a, b) => {
        const av = a.postedDate ?? '';
        const bv = b.postedDate ?? '';
        return bv.localeCompare(av);
      });
      const detailQueue = ranked.slice(0, 5);
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
          agency: 'City of Austin Procurement',
          city: 'Austin',
          county: 'Travis County',
          state: 'TX',
          source_url: r.sourceUrl,
          response_deadline: r.responseDeadline,
          estimated_value: null,
          source_authority: 'city_purchasing',
          project_stage: init.project_stage,
          phase_confidence: init.phase_confidence,
          buy_window_open: init.buy_window_open,
          austin_eresponse_raw: { cells: r.rawCells },
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
