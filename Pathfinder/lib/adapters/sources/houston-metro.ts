// lib/adapters/sources/houston-metro.ts
//
// Sprint Z3 adapter — METRO Houston (Metropolitan Transit Authority of
// Harris County) procurement opportunities.
// Endpoint: https://www.ridemetro.org/about/business-to-business/procurement-opportunities
//
// SELECTOR NOTE (verified 2026-05-28):
//   The "Open Procurements" section embeds a single dedicated HTML table
//   identified by `title="Open Procurements Table"` (class
//   `metro-table metro-table--md-flex`). Each <tr> in <tbody> is one open
//   solicitation with exactly three columns:
//
//     <td><a href="https://ridemetro.bonfirehub.com/opportunities/{id}">{reference}</a></td>
//     <td>{title}</td>
//     <td>{close-date, e.g. "June 24, 2026 2 PM"}</td>
//
//   Detail pages live on the Bonfire portal (`ridemetro.bonfirehub.com`).
//   The page also renders "Anticipated Procurements", "Past Solicitations",
//   and several non-bid `metro-table` instances; we scope strictly to the
//   `title="Open Procurements Table"` element to avoid the prior
//   indiscriminate `table tr, .views-row, .card` selector that produced
//   ~50% junk.
//
//   posted_date is not exposed on the listing page (only the response
//   deadline). It remains null at the adapter level; the detail-page
//   enricher may surface it later. response_deadline is parsed from the
//   "Close Date" cell via parseLooseDate (date-only ISO slice).
//
//   source_event_id = the reference text from <td><a>...</a></td>
//   (e.g. "IFB Doc 1961886621", "2026000007"). Stable across cycles.
//
// Geofence: METRO is Harris County, TX. All rows force state='TX'.
// Source authority: 'public_construction'.

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
import type { BidLifecyclePhase } from './_zedcor-shared';

const ENDPOINT =
  'https://www.ridemetro.org/about/business-to-business/procurement-opportunities';

// Strictly the Open Procurements table — the page contains several other
// `metro-table` elements (anticipated procurements, definitions, etc.) we
// must not match.
const ROW_SELECTOR = 'table[title="Open Procurements Table"] tbody > tr';

export const houstonMetroAdapter: SourceAdapter = {
  id: 'houston-metro',
  type: 'registered',
  description:
    'METRO Houston procurement opportunities — Open Procurements table on ridemetro.org (HTML scrape, links to Bonfire detail pages).',

  async poll(opts): Promise<SourceEvent[]> {
    try {
      const $ = await pfFetchHtml(ENDPOINT, { fetchImpl: opts.fetch });
      const init = initialPhaseTagging();

      type Row = {
        sourceEventId: string;
        title: string;
        sourceUrl: string;
        reference: string;
        postedDate: string | null;
        responseDeadline: string | null;
        closeDateRaw: string | null;
      };
      const rows: Row[] = [];

      $(ROW_SELECTOR).each((_, tr) => {
        const $tds = $(tr).find('td');
        if ($tds.length < 3) return;

        const $refCell = $tds.eq(0);
        const $a = $refCell.find('a').first();
        const reference = $refCell.text().trim().replace(/\s+/g, ' ');
        const rawHref = $a.attr('href') ?? null;
        const title = $tds.eq(1).text().trim().replace(/\s+/g, ' ');
        const closeDateRaw = $tds.eq(2).text().trim().replace(/\s+/g, ' ') || null;

        if (!title || title.length < 4) return;
        if (!reference) return;

        let absoluteUrl: string;
        try {
          absoluteUrl = rawHref ? new URL(rawHref, ENDPOINT).toString() : ENDPOINT;
        } catch {
          absoluteUrl = ENDPOINT;
        }

        // Strip the trailing time-of-day ("2 PM") so parseLooseDate gets a
        // clean "Month D, YYYY". If that fails, fall back to the raw string.
        let deadlineIso: string | null = null;
        if (closeDateRaw) {
          const dateOnly = closeDateRaw.replace(/\s+\d{1,2}\s*(AM|PM)\b.*$/i, '').trim();
          deadlineIso = parseLooseDate(dateOnly) ?? parseLooseDate(closeDateRaw);
        }

        const sourceEventId = reference || hashId(`${title}|${absoluteUrl}`);

        rows.push({
          sourceEventId,
          title,
          sourceUrl: absoluteUrl,
          reference,
          postedDate: null,
          responseDeadline: deadlineIso,
          closeDateRaw,
        });
      });

      if (rows.length === 0) return [];

      // Geofence: every Open Procurements row is METRO (Harris County, TX).
      const geofenced = rows.filter(() => isInZedcorGeofence('TX'));

      // Top-5 by posted_date desc. Listing has no posted_date, so order
      // falls back to original DOM order (METRO lists soonest-closing first).
      const detailUrls = geofenced
        .slice(0, 5)
        .map((r) => r.sourceUrl)
        .filter((u) => u !== ENDPOINT);

      const postedDates: Record<string, string | null> = {};
      for (const r of geofenced.slice(0, 5)) postedDates[r.sourceUrl] = r.postedDate;

      let upgrades = new Map<
        string,
        {
          phase: BidLifecyclePhase;
          confidence: number;
          buy_window_open: boolean;
          evidence: string;
        }
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
          agency: 'METRO Houston',
          city: 'Houston',
          county: 'Harris County',
          state: 'TX',
          source_url: r.sourceUrl,
          response_deadline: r.responseDeadline,
          response_deadline_raw: r.closeDateRaw,
          estimated_value: null,
          source_authority: 'public_construction',
          reference_number: r.reference,
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
