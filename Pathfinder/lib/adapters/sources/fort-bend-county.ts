// lib/adapters/sources/fort-bend-county.ts
//
// Sprint Z3 adapter — Fort Bend County Purchasing.
//
// SOURCE CONTEXT (verified 2026-05-28):
//   The county landing page at
//     https://www.fortbendcountytx.gov/government/departments/purchasing-agent/current-bids-rfps-rfqs-quotes
//   shows a "current bids" table that currently renders "No results" — the
//   county has migrated active solicitations to Euna Procurement (Bonfire) at
//     https://fortbendcountytx.bonfirehub.com/portal/?tab=openOpportunities
//
//   The previous adapter scanned `table tr, .accordion-item, li, .panel` and
//   matched any text containing rfp|rfq|bid|ifb. That selector pulled in 23
//   historical "Tabulations" links (e.g. "2025 Bid/RFP/RFQ Tabulations",
//   "2022 Quote Tabulations") — these are closed-bid archive pages, not
//   current opportunities.
//
//   Strategy:
//   1) Primary: hit the Bonfire public-portal JSON (same shape as
//      galveston-county.ts / harris-county-bonfire.ts) and emit one event per
//      open opportunity.
//   2) Fallback: scrape the county landing page, but ONLY rows in the
//      current-bids table — explicitly skip any link whose text or href
//      contains "tabulation", "historical", "closed", "past", or a 4-digit
//      year alone, which is how the archive links are named.
//
//   Geofence: Fort Bend County is TX → all rows are inside the Zedcor
//   geofence. Filter defensively via isInZedcorGeofence.

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
  pfFetchJson,
} from './_zedcor-shared';
import type { BidLifecyclePhase } from '../zedcor/phase-signals';

const COUNTY_LANDING =
  'https://www.fortbendcountytx.gov/government/departments/purchasing-agent/current-bids-rfps-rfqs-quotes';
const BONFIRE_PORTAL = 'fortbendcountytx.bonfirehub.com';
const BONFIRE_ENDPOINT = `https://${BONFIRE_PORTAL}/portal/api/portal/v1/opportunities?status=open`;

interface BonfireOpp {
  id?: number | string;
  identifier?: string | null;
  title?: string | null;
  publishDate?: string | null;
  closeDate?: string | null;
  buyerName?: string | null;
}

interface BonfireListResponse {
  data?: BonfireOpp[];
  opportunities?: BonfireOpp[];
}

// Historical / archive markers — never treat these as current opportunities.
const HISTORICAL_RE = /\b(tabulation|tabulations|historical|closed|past|archive|archived|prior|previous)\b/i;
// 4-digit year alone (e.g. "2024 Bid/RFP/RFQ Tabulations") — the county lists
// archive folders this way. Combined with HISTORICAL_RE this is belt+suspenders.
const YEAR_ARCHIVE_RE = /^\s*(?:19|20)\d{2}\b/;
// Z11 hardening — site-navigation phrases that shouldn't show up in a real
// RFP title. Catches sidebar / breadcrumb / page-header text that survived
// previous adapter passes.
const NAV_PHRASE_RE =
  /\b(about us|doing business( with)?( the)? county|disadvantaged business|term contract schedule|surplus property|sealed bid sale|conflict of interest|fta funded procurements|state requirements|business record research|new business information|w[-\s]?9|home|contact|sitemap|breadcrumb)\b/i;
// Z11 hardening — real RFP titles are rarely longer than ~150 chars. Long
// strings tend to be concatenated nav blobs ("Purchasing Agent About Us
// Surplus Property Auction Current Bids..."). Cap defensively.
const MAX_TITLE_LEN = 200;
// Z11 hardening — at least one of these tokens has to appear in a title for
// us to accept it as an opportunity row. Filters out pure category/section
// names like "Purchasing Agent" while still admitting "RFP - Foo Bar".
const OPPORTUNITY_TOKEN_RE = /\b(rfp|rfq|ifb|itb|rsq|qrf|bid|quote|solicitation|proposal|construction|services?)\b/i;

type Row = {
  sourceEventId: string;
  title: string;
  sourceUrl: string;
  postedDate: string | null;
  responseDeadline: string | null;
  bonfireRaw?: BonfireOpp;
};

async function pollBonfire(opts: { fetch?: typeof fetch }): Promise<Row[]> {
  let payload: BonfireListResponse;
  try {
    payload = await pfFetchJson<BonfireListResponse>(BONFIRE_ENDPOINT, {
      fetchImpl: opts.fetch,
    });
  } catch {
    return [];
  }
  const opps = payload.data ?? payload.opportunities ?? [];
  return opps.map((opp) => {
    const sourceEventId = String(opp.identifier ?? opp.id ?? hashId(opp.title ?? ''));
    const sourceUrl = `https://${BONFIRE_PORTAL}/portal/?tab=openOpportunities&opportunityId=${encodeURIComponent(
      String(opp.id ?? sourceEventId),
    )}`;
    return {
      sourceEventId,
      title: (opp.title ?? '').trim() || `Fort Bend County opportunity ${sourceEventId}`,
      sourceUrl,
      postedDate: parseLooseDate(opp.publishDate ?? null),
      responseDeadline: parseLooseDate(opp.closeDate ?? null),
      bonfireRaw: opp,
    };
  });
}

async function pollLandingFallback(opts: { fetch?: typeof fetch }): Promise<Row[]> {
  let $: Awaited<ReturnType<typeof pfFetchHtml>>;
  try {
    $ = await pfFetchHtml(COUNTY_LANDING, { fetchImpl: opts.fetch });
  } catch {
    return [];
  }

  const rows: Row[] = [];

  // The current-bids table is the page's primary <table>. Each row's first
  // <td> holds the RFP/IFB number; the second holds the title (often linked);
  // STARTING/CLOSING are 3rd/4th. Any cell may be empty when "No results".
  $('table').each((_, table) => {
    const $table = $(table);
    const $headerCells = $table.find('thead th, tr').first().find('th, td');
    const headerText = $headerCells.text().replace(/\s+/g, ' ').toLowerCase();
    // Only consider tables that look like the current-bids table —
    // header should mention starting/closing/status. This excludes any
    // sidebar nav / footer tables.
    if (
      !/starting/i.test(headerText) &&
      !/closing/i.test(headerText) &&
      !/status/i.test(headerText)
    ) {
      return;
    }

    $table.find('tbody tr, tr').each((_idx, tr) => {
      const $tr = $(tr);
      // Skip header rows
      if ($tr.find('th').length > 0 && $tr.find('td').length === 0) return;
      const cells = $tr.find('td');
      if (cells.length < 2) return;

      const refRaw = $(cells[0]).text().trim().replace(/\s+/g, ' ');
      const titleCell = $(cells[1]);
      const titleRaw = titleCell.text().trim().replace(/\s+/g, ' ');
      if (!titleRaw || titleRaw.length < 4) return;
      if (/no results/i.test(titleRaw) || /no results/i.test(refRaw)) return;

      // Reject historical / tabulation rows defensively.
      if (HISTORICAL_RE.test(titleRaw) || HISTORICAL_RE.test(refRaw)) return;
      if (YEAR_ARCHIVE_RE.test(titleRaw)) return;

      // Z11 hardening — reject nav-blob titles and over-long concatenations.
      if (titleRaw.length > MAX_TITLE_LEN) return;
      if (NAV_PHRASE_RE.test(titleRaw)) return;
      // Title MUST carry at least one opportunity-shaped token. Catches pure
      // section names ("Purchasing Agent", "Auction Sealed Bid Sale") that
      // slipped past previous filters; combined with the table-header sniff
      // above this drops the entire page-nav class.
      if (!OPPORTUNITY_TOKEN_RE.test(`${refRaw} ${titleRaw}`)) return;

      const href = titleCell.find('a').first().attr('href');
      let absoluteUrl: string;
      try {
        absoluteUrl = href
          ? new URL(href, COUNTY_LANDING).toString()
          : COUNTY_LANDING;
      } catch {
        absoluteUrl = COUNTY_LANDING;
      }

      // STARTING is typically column 3, CLOSING column 4 (0-indexed: 2,3).
      const startRaw = cells.length > 2 ? $(cells[2]).text().trim() : '';
      const closeRaw = cells.length > 3 ? $(cells[3]).text().trim() : '';

      const sourceEventId = refRaw || hashId(`${titleRaw}|${absoluteUrl}`);
      rows.push({
        sourceEventId,
        title: refRaw ? `${refRaw} — ${titleRaw}` : titleRaw,
        sourceUrl: absoluteUrl,
        postedDate: parseLooseDate(startRaw || null),
        responseDeadline: parseLooseDate(closeRaw || null),
      });
    });
  });

  return rows;
}

export const fortBendCountyAdapter: SourceAdapter = {
  id: 'fort-bend-county',
  type: 'registered',
  description:
    'Fort Bend County Purchasing — Bonfire public portal (primary) with current-bids landing-page fallback. Sprint Z3.',

  async poll(opts): Promise<SourceEvent[]> {
    try {
      const init = initialPhaseTagging();

      // 1) Primary path: Bonfire JSON.
      let rows = await pollBonfire(opts);
      // 2) Fallback: current-bids table on the county landing page, with
      // strict historical-row filtering.
      if (rows.length === 0) {
        rows = await pollLandingFallback(opts);
      }
      if (rows.length === 0) return [];

      // Geofence — Fort Bend County is in TX. Filter defensively.
      const geofenced = rows.filter(() => isInZedcorGeofence('TX'));
      if (geofenced.length === 0) return [];

      // Detail enrichment: top-5 by posted_date desc (nulls last). Mirrors
      // houston-obo / Sprint Z3 shape.
      const ranked = [...geofenced].sort((a, b) => {
        const av = a.postedDate ?? '';
        const bv = b.postedDate ?? '';
        return bv.localeCompare(av);
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
          agency: 'Fort Bend County Purchasing',
          city: 'Richmond',
          county: 'Fort Bend County',
          state: 'TX',
          source_url: r.sourceUrl,
          response_deadline: r.responseDeadline,
          estimated_value: null,
          source_authority: 'county_purchasing',
          project_stage: init.project_stage,
          phase_confidence: init.phase_confidence,
          buy_window_open: init.buy_window_open,
        };
        if (r.bonfireRaw) {
          payload.bonfire_raw = r.bonfireRaw;
        }
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
