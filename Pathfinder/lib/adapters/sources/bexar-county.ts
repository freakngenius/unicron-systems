// lib/adapters/sources/bexar-county.ts
//
// Sprint Z10 adapter — Bexar County Purchasing.
// Endpoint: https://www.bexar.org/Bid
//
// ENDPOINT DISCOVERY (Sprint Z10):
//   Bexar County publishes solicitations through the CivicPlus "Bid Postings"
//   module at `bexar.org/Bid`. The module renders an HTML index of open bids
//   in a table where each row's primary anchor points to a per-bid detail
//   page (typically `/Bid.aspx?BidID=<n>` on the same origin). Some
//   deployments of the CivicPlus module return an empty index until a
//   category filter is appended; if the bare page yields zero rows we
//   degrade to source_empty (the SPEC explicitly flags this adapter as a
//   SCAFFOLD-acceptable case).
//
// SELECTOR STRATEGY:
//   CivicPlus markup is brittle and version-skewed across deployments. We
//   anchor on the explicit BidID hrefs (`Bid.aspx?BidID=`) which are stable
//   across CivicPlus skins. Each matched anchor becomes one opportunity row.
//   Close-date columns sit in the same `<tr>` when present and are parsed via
//   `parseLooseDate`.
//
// DETAIL ENRICHMENT:
//   Per-bid detail pages include the solicitation description, addenda, and
//   due-date table. The shared `enrichDetailPages` helper runs on the top-5
//   rows (soonest-closing) so phase signals upgrade `project_stage`.
//
// Geofence: Bexar County is in TX → in-region.
// source_event_id: BidID query param; fallback `hashId(title)`.

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

const ENDPOINT = 'https://www.bexar.org/Bid';
const BASE_ORIGIN = 'https://www.bexar.org';

// CivicPlus Bid Postings detail-page anchor signature.
const DETAIL_HREF_RE = /BidID=(\d+)/i;

type Upgrade = {
  phase: BidLifecyclePhase;
  confidence: number;
  buy_window_open: boolean;
  evidence: string;
};

export const bexarCountyAdapter: SourceAdapter = {
  id: 'bexar-county',
  type: 'registered',
  description:
    'Bexar County Purchasing — CivicPlus Bid Postings HTML scrape (with detail-page phase enrichment).',

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
        responseDeadline: string | null;
        postedDate: string | null;
      };
      const rows: Row[] = [];
      const seenIds = new Set<string>();

      $('a[href*="BidID="]').each((_, a) => {
        const href = $(a).attr('href');
        if (!href) return;
        const m = href.match(DETAIL_HREF_RE);
        if (!m) return;
        const bidId = m[1];
        if (!bidId || seenIds.has(bidId)) return;

        const text = $(a).text().replace(/\s+/g, ' ').trim();
        if (!text || text.length < 3) return;

        let absoluteUrl: string;
        try {
          absoluteUrl = new URL(href, BASE_ORIGIN).toString();
        } catch {
          return;
        }

        // Sibling cells in the bid grid sometimes carry close-date columns.
        const $row = $(a).closest('tr');
        let responseDeadline: string | null = null;
        let postedDate: string | null = null;
        if ($row.length) {
          const cells: string[] = [];
          $row.find('td').each((__, td) => {
            cells.push($(td).text().replace(/\s+/g, ' ').trim());
          });
          // Heuristic: first parseable date is the close date; second is publish.
          for (const cell of cells) {
            const parsed = parseLooseDate(cell);
            if (!parsed) continue;
            if (!responseDeadline) {
              responseDeadline = parsed;
            } else if (!postedDate) {
              postedDate = parsed;
            }
          }
        }

        seenIds.add(bidId);
        rows.push({
          sourceEventId: bidId,
          title: text,
          sourceUrl: absoluteUrl,
          responseDeadline,
          postedDate,
        });
      });

      if (rows.length === 0) return [];

      const geofenced = rows.filter(() => isInZedcorGeofence('TX'));
      if (geofenced.length === 0) return [];

      const enrichmentTargets = [...geofenced]
        .filter((r) => !!r.responseDeadline)
        .sort((a, b) => (a.responseDeadline ?? '').localeCompare(b.responseDeadline ?? ''))
        .slice(0, 5);
      const detailQueue =
        enrichmentTargets.length > 0 ? enrichmentTargets : geofenced.slice(0, 5);

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
          agency: 'Bexar County Purchasing',
          city: 'San Antonio',
          county: 'Bexar County',
          state: 'TX',
          source_url: r.sourceUrl,
          response_deadline: r.responseDeadline,
          estimated_value: null,
          source_authority: 'county_purchasing',
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
            source_event_id: r.sourceEventId || hashId(r.title),
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
