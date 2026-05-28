// lib/adapters/sources/travis-county.ts
//
// Sprint Z10 adapter — Travis County Purchasing.
// Endpoint: https://www.traviscountytx.gov/purchasing/solicitations
//
// ENDPOINT DISCOVERY (verified 2026-05-28):
//   The Travis County purchasing site is server-rendered (no JSON
//   API). The /purchasing/solicitations page lists active
//   solicitations in a single table — header columns observed are:
//     Solicitation # | Title | Type | Opens / Open Date | Closes / Close Date | Status
//   Each row's first cell holds the solicitation number, usually as
//   a link into a detail page under
//     /purchasing/solicitations/<solicitation-number>
//   When the table is empty the page shows "No active solicitations".
//
//   Strategy: scan every <table>, pick the one whose header mentions
//   "solicitation" plus a date column ("open" / "close" / "due").
//   Emit one event per tbody row. source_event_id prefers the
//   solicitation number text, falling back to hashId.
//
// FALLBACK STRATEGY:
//   Empty table or HTML drift → return []. The orchestrator records
//   source_empty / parser_drift. No speculative retries.
//
// Geofence: Travis County is TX → in-region.

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

const ENDPOINT = 'https://www.traviscountytx.gov/purchasing/solicitations';

const HISTORICAL_RE = /\b(closed|awarded|cancelled|canceled|archive|archived|past|prior|tabulation)\b/i;

type Row = {
  sourceEventId: string;
  title: string;
  sourceUrl: string;
  postedDate: string | null;
  responseDeadline: string | null;
  rawCells: string[];
};

export const travisCountyAdapter: SourceAdapter = {
  id: 'travis-county',
  type: 'registered',
  description:
    'Travis County Purchasing — active solicitations table (HTML scrape) with detail-page phase enrichment.',

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
        // The solicitations table mentions solicitation + an open/close column.
        if (!/solicit/i.test(headerText)) return;
        if (!/(open|close|due|post)/i.test(headerText)) return;

        // Index the columns so we can route the right cell to posted vs deadline.
        const headerCells = $table.find('thead th, tr').first().find('th, td');
        const colIdx = {
          ref: -1,
          title: -1,
          posted: -1,
          deadline: -1,
        };
        headerCells.each((i, c) => {
          const t = $(c).text().trim().toLowerCase();
          if (colIdx.ref < 0 && /(solicit|number|#|ref)/i.test(t)) colIdx.ref = i;
          if (colIdx.title < 0 && /(title|description|name)/i.test(t)) colIdx.title = i;
          if (colIdx.posted < 0 && /(open|post|issue|publish)/i.test(t)) colIdx.posted = i;
          if (colIdx.deadline < 0 && /(close|due|deadline)/i.test(t)) colIdx.deadline = i;
        });
        // Defaults if header is non-standard.
        if (colIdx.ref < 0) colIdx.ref = 0;
        if (colIdx.title < 0) colIdx.title = 1;

        $table.find('tbody tr, tr').each((_idx, tr) => {
          const $tr = $(tr);
          if ($tr.find('th').length > 0 && $tr.find('td').length === 0) return;
          const cells = $tr.find('td');
          if (cells.length < 2) return;

          const cellTexts = cells
            .map((_i, c) => $(c).text().trim().replace(/\s+/g, ' '))
            .get();

          const refRaw = cellTexts[colIdx.ref] ?? cellTexts[0] ?? '';
          const titleRaw = cellTexts[colIdx.title] ?? cellTexts[1] ?? '';
          if (!titleRaw || titleRaw.length < 4) return;
          if (/no active|no results|no records/i.test(cellTexts.join(' '))) return;
          if (HISTORICAL_RE.test(cellTexts.join(' '))) return;

          const refHref =
            $(cells[colIdx.ref] ?? cells[0]).find('a').first().attr('href') ??
            $(cells[colIdx.title] ?? cells[1]).find('a').first().attr('href');
          let absoluteUrl: string;
          try {
            absoluteUrl = refHref ? new URL(refHref, ENDPOINT).toString() : ENDPOINT;
          } catch {
            absoluteUrl = ENDPOINT;
          }

          const postedRaw = colIdx.posted >= 0 ? cellTexts[colIdx.posted] : '';
          const deadlineRaw = colIdx.deadline >= 0 ? cellTexts[colIdx.deadline] : '';

          const sourceEventId = refRaw.trim() || hashId(`travis-county|${titleRaw}|${absoluteUrl}`);
          rows.push({
            sourceEventId,
            title: refRaw && !titleRaw.startsWith(refRaw) ? `${refRaw} — ${titleRaw}` : titleRaw,
            sourceUrl: absoluteUrl,
            postedDate: parseLooseDate(postedRaw || null),
            responseDeadline: parseLooseDate(deadlineRaw || null),
            rawCells: cellTexts,
          });
        });
      });

      if (rows.length === 0) return [];

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
          agency: 'Travis County Purchasing',
          city: 'Austin',
          county: 'Travis County',
          state: 'TX',
          source_url: r.sourceUrl,
          response_deadline: r.responseDeadline,
          estimated_value: null,
          source_authority: 'county_purchasing',
          project_stage: init.project_stage,
          phase_confidence: init.phase_confidence,
          buy_window_open: init.buy_window_open,
          travis_county_raw: { cells: r.rawCells },
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
