// lib/adapters/sources/ut-system.ts
//
// Sprint Z10 adapter — UT System Supply Chain Alliance bid opportunities.
// Endpoint: https://www.utsystem.edu/offices/supply-chain-alliance/bid-opportunities
//
// ENDPOINT DISCOVERY (verified 2026-05-28):
//   The Supply Chain Alliance bid-opportunities page is a Drupal-rendered
//   landing-page that lists active solicitations backed by Jaggaer
//   (solutions.sciquest.com). The page shape is one of:
//     (a) A single <table> with columns Solicitation # | Title | Due Date |
//         Institution | Status. Each row's title or "View" cell links into
//         the Jaggaer detail surface
//         https://solutions.sciquest.com/apps/Router/PublicEvent?...; or
//     (b) A list of <article> / <div class="view-content">…<div class="views-row">
//         entries, each with a heading, a few <div class="views-field-*"> spans
//         (solicitation #, due date), and a "View opportunity" link.
//   We support both shapes — table first, then views-row fallback. When
//   neither yields rows we return [] for source_empty.
//
// FALLBACK STRATEGY:
//   Jaggaer SSO walls some detail pages; the shared enrichDetailPages
//   helper swallows HTTP 403 / timeout per-URL so one bad link doesn't
//   kill the batch. If zero rows parse from either shape we return [].
//
// Geofence: UT System is headquartered in Austin / Travis County, TX →
// in-region. Individual solicitations may be issued by other UT
// institutions (Dallas, Houston, El Paso) — we still tag the row TX and
// let the geofence pass it through.

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
  'https://www.utsystem.edu/offices/supply-chain-alliance/bid-opportunities';

const HISTORICAL_RE = /\b(closed|awarded|cancelled|canceled|archive|archived|past|prior)\b/i;
const BID_TOKEN_RE = /\b(RFP|IFB|RFQ|RFI|IDIQ|Solicitation|Bid|Notice|UTS|UT-)\b/i;
const EXCLUDE_HREF_RE = /(^#|^javascript:|mailto:|utsystem\.edu\/offices\/supply-chain-alliance\/?$)/i;

type Row = {
  sourceEventId: string;
  title: string;
  sourceUrl: string;
  postedDate: string | null;
  responseDeadline: string | null;
  rawCells?: string[];
};

export const utSystemAdapter: SourceAdapter = {
  id: 'ut-system',
  type: 'registered',
  description:
    'UT System Supply Chain Alliance bid opportunities — Jaggaer-backed listing page (HTML scrape with table + views-row fallback).',

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
      const seen = new Set<string>();

      // ---- Shape A: rendered table -----------------------------------------
      $('table').each((_, table) => {
        const $table = $(table);
        const headerCells = $table.find('thead th, tr').first().find('th, td');
        const headerText = headerCells
          .map((_i, c) => $(c).text())
          .get()
          .join(' ')
          .replace(/\s+/g, ' ')
          .toLowerCase();
        if (!/solicit|bid|opportunity|rfp|rfq|ifb/i.test(headerText)) return;
        if (!/(due|close|deadline|date)/i.test(headerText)) return;

        const colIdx = { ref: -1, title: -1, due: -1 };
        headerCells.each((i, c) => {
          const t = $(c).text().trim().toLowerCase();
          if (colIdx.ref < 0 && /(solicit|number|#|ref)/i.test(t)) colIdx.ref = i;
          if (colIdx.title < 0 && /(title|description|name|opportunity)/i.test(t)) colIdx.title = i;
          if (colIdx.due < 0 && /(due|close|deadline|response)/i.test(t)) colIdx.due = i;
        });
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
          if (/no results|no records|no active|no open/i.test(cellTexts.join(' '))) return;
          if (HISTORICAL_RE.test(cellTexts.join(' '))) return;

          // Prefer a Jaggaer link inside the row.
          let href: string | undefined;
          $tr.find('a[href]').each((_i, a) => {
            if (href) return;
            const h = $(a).attr('href');
            if (!h) return;
            if (EXCLUDE_HREF_RE.test(h)) return;
            href = h;
          });
          let absoluteUrl: string;
          try {
            absoluteUrl = href ? new URL(href, ENDPOINT).toString() : ENDPOINT;
          } catch {
            absoluteUrl = ENDPOINT;
          }
          if (absoluteUrl === ENDPOINT && !refRaw) return;
          if (seen.has(absoluteUrl)) return;
          seen.add(absoluteUrl);

          const dueRaw = colIdx.due >= 0 ? cellTexts[colIdx.due] : '';
          const sourceEventId = refRaw.trim() || hashId(`ut-system|${titleRaw}|${absoluteUrl}`);
          rows.push({
            sourceEventId,
            title: refRaw && !titleRaw.startsWith(refRaw) ? `${refRaw} — ${titleRaw}` : titleRaw,
            sourceUrl: absoluteUrl,
            postedDate: null,
            responseDeadline: parseLooseDate(dueRaw || null),
            rawCells: cellTexts,
          });
        });
      });

      // ---- Shape B: views-row / article fallback ---------------------------
      if (rows.length === 0) {
        const $container = $('.view-content, main, #main-content, .region-content').first();
        const root = $container.length > 0 ? $container : $('body');
        root.find('.views-row, article, li.opportunity, .opportunity-row').each((_, el) => {
          const $el = $(el);
          const text = $el.text().replace(/\s+/g, ' ').trim();
          if (!text || text.length < 8) return;
          if (HISTORICAL_RE.test(text)) return;
          if (!BID_TOKEN_RE.test(text)) return;

          const $a = $el.find('a[href]').filter((_i, a) => {
            const h = $(a).attr('href');
            return !!h && !EXCLUDE_HREF_RE.test(h);
          }).first();
          const href = $a.attr('href');
          let absoluteUrl: string;
          try {
            absoluteUrl = href ? new URL(href, ENDPOINT).toString() : ENDPOINT;
          } catch {
            absoluteUrl = ENDPOINT;
          }
          if (absoluteUrl === ENDPOINT) return;
          if (seen.has(absoluteUrl)) return;
          seen.add(absoluteUrl);

          const headingText = (
            $el.find('h1, h2, h3, h4, .views-field-title, .field--name-title').first().text().trim()
            || $a.text().trim()
            || text.slice(0, 200)
          ).replace(/\s+/g, ' ');

          // Best-effort solicitation # extraction (e.g. "UTS-1234", "RFP 25-001").
          const refMatch = text.match(/\b(UTS[- ]?\d+[A-Z0-9-]*|(?:RFP|IFB|RFQ|RFI)[ -][A-Z0-9-]{3,})\b/i);
          const refRaw = refMatch ? refMatch[1] : '';

          const dueMatch = text.match(
            /\b(?:due|close[sd]?|deadline|response)[^A-Za-z0-9]{0,8}(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|[A-Z][a-z]+ \d{1,2},? \d{4})\b/i,
          );
          const responseDeadline = dueMatch ? parseLooseDate(dueMatch[1]) : null;

          const sourceEventId = refRaw.trim() || hashId(`ut-system|${headingText}|${absoluteUrl}`);
          rows.push({
            sourceEventId,
            title: refRaw && !headingText.includes(refRaw) ? `${refRaw} — ${headingText}` : headingText,
            sourceUrl: absoluteUrl,
            postedDate: null,
            responseDeadline,
          });
        });
      }

      if (rows.length === 0) return [];

      const geofenced = rows.filter(() => isInZedcorGeofence('TX'));
      if (geofenced.length === 0) return [];

      // Detail enrichment: top-5 in listing order. The Jaggaer detail URLs
      // are protected by SSO for some institutions; per-URL 403s are
      // swallowed by enrichDetailPages.
      const detailQueue = geofenced.slice(0, 5);
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
          agency: 'UT System Supply Chain Alliance',
          city: 'Austin',
          county: 'Travis County',
          state: 'TX',
          source_url: r.sourceUrl,
          response_deadline: r.responseDeadline,
          estimated_value: null,
          source_authority: 'state_university_system',
          project_stage: init.project_stage,
          phase_confidence: init.phase_confidence,
          buy_window_open: init.buy_window_open,
          ut_system_raw: r.rawCells ? { cells: r.rawCells } : undefined,
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
