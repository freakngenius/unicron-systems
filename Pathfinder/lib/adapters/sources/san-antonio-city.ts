// lib/adapters/sources/san-antonio-city.ts
//
// Sprint Z10 adapter — City of San Antonio Purchasing (Bid & Contract Opportunities).
// Endpoint: https://webapp1.sanantonio.gov/BidContractOpps/Default.aspx
//
// ENDPOINT DISCOVERY (Sprint Z10):
//   The City of San Antonio Purchasing department lists active bids and
//   contract opportunities through an ASP.NET WebForms app at
//   `webapp1.sanantonio.gov/BidContractOpps/Default.aspx`. There is no public
//   JSON API — opportunities are rendered server-side as a table whose rows
//   each link to a detail page of the form
//   `Content.aspx?id=<ID>&page=Default`.
//
// SELECTOR STRATEGY:
//   The bid grid is an ASP.NET GridView rendered as a `<table>` whose data
//   rows contain an anchor pointing at `Content.aspx?id=...`. We harvest one
//   row per such anchor, treating the anchor text as the title and the row's
//   sibling cells (or anchor metadata when sibling cells are absent) as the
//   solicitation id + close date when present. WebForms markup is brittle, so
//   we parse the anchor-based shape directly rather than locking onto a
//   specific `<table>` id — if zero anchors match the
//   `Content.aspx?id=` pattern, we return [] (the orchestrator records
//   source_empty).
//
// DETAIL ENRICHMENT:
//   Each opportunity has a direct detail URL at
//   `Content.aspx?id=<ID>&page=Default` containing the solicitation
//   description, due date, and any addenda. We run the shared
//   `enrichDetailPages` helper on the top-5 rows so phase-signals like
//   "addendum", "pre-bid conference", or "award" upgrade the project_stage.
//
// Geofence: San Antonio is in Bexar County, TX → in-region.
// source_event_id: solicitation id parsed from the detail anchor when
// available; fallback `hashId(title)` for cross-cycle stability.

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

const ENDPOINT = 'https://webapp1.sanantonio.gov/BidContractOpps/Default.aspx';
const PORTAL_ORIGIN = 'https://webapp1.sanantonio.gov/BidContractOpps';

// Detail anchors look like `Content.aspx?id=12345&page=Default`. We match the
// id query param to derive a stable source_event_id.
const DETAIL_HREF_RE = /Content\.aspx\?id=([^&"'#]+)/i;

type Upgrade = {
  phase: BidLifecyclePhase;
  confidence: number;
  buy_window_open: boolean;
  evidence: string;
};

export const sanAntonioCityAdapter: SourceAdapter = {
  id: 'san-antonio-city',
  type: 'registered',
  description:
    'City of San Antonio Purchasing — Bid & Contract Opportunities (ASP.NET HTML scrape, with detail-page phase enrichment).',

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

      // Iterate every anchor whose href targets the detail-page route. Each
      // matched anchor corresponds to one opportunity row in the GridView.
      $('a[href*="Content.aspx?id="]').each((_, a) => {
        const href = $(a).attr('href');
        if (!href) return;
        const m = href.match(DETAIL_HREF_RE);
        if (!m) return;
        const solicitationId = decodeURIComponent(m[1]).trim();
        if (!solicitationId || seenIds.has(solicitationId)) return;

        const text = $(a).text().replace(/\s+/g, ' ').trim();
        if (!text || text.length < 3) return;

        let absoluteUrl: string;
        try {
          absoluteUrl = new URL(href, `${PORTAL_ORIGIN}/`).toString();
        } catch {
          return;
        }

        // Walk the containing row for sibling cells. When the anchor lives in
        // a <td>, the closest <tr> gives us neighboring cells (close date,
        // bid type, etc.). Treat any cell containing a parseable date as a
        // candidate response_deadline.
        const $row = $(a).closest('tr');
        let responseDeadline: string | null = null;
        if ($row.length) {
          $row.find('td').each((__, td) => {
            const cellText = $(td).text().replace(/\s+/g, ' ').trim();
            const parsed = parseLooseDate(cellText);
            if (parsed && !responseDeadline) responseDeadline = parsed;
          });
        }

        seenIds.add(solicitationId);
        rows.push({
          sourceEventId: solicitationId,
          title: text,
          sourceUrl: absoluteUrl,
          responseDeadline,
          postedDate: null,
        });
      });

      if (rows.length === 0) return [];

      const geofenced = rows.filter(() => isInZedcorGeofence('TX'));
      if (geofenced.length === 0) return [];

      // Top-5 detail-page enrichment. Sort by soonest-closing as a proxy for
      // most-active live solicitation (the listing has no posted-date column).
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
          agency: 'City of San Antonio Purchasing',
          city: 'San Antonio',
          county: 'Bexar County',
          state: 'TX',
          source_url: r.sourceUrl,
          response_deadline: r.responseDeadline,
          estimated_value: null,
          source_authority: 'city_purchasing',
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
