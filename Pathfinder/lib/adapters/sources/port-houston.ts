// lib/adapters/sources/port-houston.ts
//
// Sprint Z3 adapter — Port of Houston Authority
// (Workday Strategic Sourcing public portal).
//
// Endpoint: https://port-of-houston-authority.public-portal.us.workdayspend.com/
//
// FETCH STATUS (verified 2026-05-28):
//   Workday public portals are JS-rendered; server-side fetch returns a
//   shell HTML only (~1.5KB, a single `<div class="jsRootElementPlaceholder">`
//   plus a single ES-module bundle at /assets/webpack/assets/index-*.js).
//   The server is a catch-all SPA: every path (including every plausible
//   API guess like /api/portal/events, /api/opportunities,
//   /api/portal/v1/opportunities, /wday/cxs/.../opportunities, etc.) returns
//   the same 1489-byte SPA shell with content-type text/html. The real
//   opportunity data is loaded by lazy-loaded JS chunks after page render,
//   gated by an XSRF cookie (_pp_xsrf) and an authenticated session
//   (_pp_session) set on first browser load.
//
//   Deferred to Z4 with headless browser (Playwright) or a vendor-specific
//   Workday Strategic Sourcing Public Portal API key.
//
// Behavior: this adapter attempts a small set of plausible JSON endpoints
// first (so it self-activates if Workday ever exposes one), falls back to
// HTML scrape, and otherwise returns [] cleanly so the orchestrator records
// source_empty instead of source_failed.
//
// Geofence: Port of Houston Authority is Houston / Harris County / TX.

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
  type BidLifecyclePhase,
} from './_zedcor-shared';

const PORTAL_HOST = 'port-of-houston-authority.public-portal.us.workdayspend.com';
const PORTAL_ORIGIN = `https://${PORTAL_HOST}`;

// Candidate JSON endpoints. None of these are documented; we probe a small
// set of common Workday Strategic Sourcing Public Portal paths so the
// adapter self-activates if/when the vendor exposes one.
const JSON_ENDPOINTS = [
  `${PORTAL_ORIGIN}/api/portal/events?status=open`,
  `${PORTAL_ORIGIN}/api/portal/v1/opportunities?status=open`,
  `${PORTAL_ORIGIN}/api/opportunities`,
  `${PORTAL_ORIGIN}/api/events`,
];

const AGENCY = 'Port of Houston Authority';
const CITY = 'Houston';
const COUNTY = 'Harris County';
const STATE = 'TX';

interface WorkdayEvent {
  id?: string | number | null;
  externalReference?: string | null;
  reference?: string | null;
  title?: string | null;
  name?: string | null;
  publishedAt?: string | null;
  publishDate?: string | null;
  postedDate?: string | null;
  responseDueDate?: string | null;
  closeDate?: string | null;
  dueDate?: string | null;
  organizationName?: string | null;
  detailUrl?: string | null;
  url?: string | null;
}

interface WorkdayList {
  data?: WorkdayEvent[];
  events?: WorkdayEvent[];
  opportunities?: WorkdayEvent[];
  results?: WorkdayEvent[];
}

interface ParsedRow {
  sourceEventId: string;
  title: string;
  sourceUrl: string;
  postedDate: string | null;
  responseDeadline: string | null;
}

function normalizeWorkdayEvent(ev: WorkdayEvent): ParsedRow | null {
  const title = (ev.title ?? ev.name ?? '').trim();
  if (!title) return null;
  const rawId = ev.externalReference ?? ev.reference ?? ev.id ?? null;
  const sourceEventId = rawId != null ? String(rawId) : hashId(title);
  const detailHint = ev.detailUrl ?? ev.url ?? null;
  let sourceUrl: string;
  if (detailHint) {
    try {
      sourceUrl = new URL(detailHint, PORTAL_ORIGIN).toString();
    } catch {
      sourceUrl = `${PORTAL_ORIGIN}/event/${encodeURIComponent(String(rawId ?? sourceEventId))}`;
    }
  } else {
    sourceUrl = `${PORTAL_ORIGIN}/event/${encodeURIComponent(String(rawId ?? sourceEventId))}`;
  }
  return {
    sourceEventId,
    title,
    sourceUrl,
    postedDate: parseLooseDate(ev.publishedAt ?? ev.publishDate ?? ev.postedDate ?? null),
    responseDeadline: parseLooseDate(ev.responseDueDate ?? ev.closeDate ?? ev.dueDate ?? null),
  };
}

async function tryJsonEndpoints(fetchImpl?: typeof fetch): Promise<ParsedRow[]> {
  for (const url of JSON_ENDPOINTS) {
    try {
      const payload = await pfFetchJson<WorkdayList>(url, { fetchImpl });
      const rows = payload.data ?? payload.events ?? payload.opportunities ?? payload.results ?? [];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const parsed = rows.map(normalizeWorkdayEvent).filter((r): r is ParsedRow => r !== null);
      if (parsed.length > 0) return parsed;
    } catch {
      // Try next candidate. Workday catch-all SPA returns 200 text/html for
      // every path, so pfFetchJson throws on JSON.parse — that's the signal.
    }
  }
  return [];
}

async function tryHtmlScrape(fetchImpl?: typeof fetch): Promise<ParsedRow[]> {
  try {
    const $ = await pfFetchHtml(PORTAL_ORIGIN, { fetchImpl });
    // The SPA shell renders <div class="jsRootElementPlaceholder"></div> with
    // no rows. If Workday ever serves SSR'd rows, we scan for plausible
    // anchors pointing at /event/ or /opportunity/ paths.
    const rows: ParsedRow[] = [];
    $('a[href*="/event/"], a[href*="/opportunity/"]').each((_, a) => {
      const href = $(a).attr('href');
      const text = $(a).text().trim().replace(/\s+/g, ' ');
      if (!href || !text || text.length < 4) return;
      let absoluteUrl: string;
      try {
        absoluteUrl = new URL(href, PORTAL_ORIGIN).toString();
      } catch {
        return;
      }
      rows.push({
        sourceEventId: hashId(`${AGENCY}|${text}`),
        title: text,
        sourceUrl: absoluteUrl,
        postedDate: null,
        responseDeadline: null,
      });
    });
    return rows;
  } catch {
    return [];
  }
}

export const portHoustonAdapter: SourceAdapter = {
  id: 'port-houston',
  type: 'registered',
  description:
    'Port of Houston Authority — Workday Strategic Sourcing public portal (JSON probe; HTML fallback; deferred to Z4 headless render when both empty).',

  async poll(opts): Promise<SourceEvent[]> {
    try {
      // Geofence — Port Houston is TX. Defensive guard only.
      if (!isInZedcorGeofence(STATE)) return [];

      let parsed = await tryJsonEndpoints(opts.fetch);
      if (parsed.length === 0) {
        parsed = await tryHtmlScrape(opts.fetch);
      }
      if (parsed.length === 0) {
        // Expected outcome on the current Workday SPA. Return cleanly so
        // the orchestrator records source_empty rather than source_failed.
        return [];
      }

      const init = initialPhaseTagging();

      // Top-5 most-recent (posted_date desc, nulls last) for detail enrichment.
      const ranked = parsed
        .slice()
        .sort((a, b) => {
          if (a.postedDate && b.postedDate) return b.postedDate.localeCompare(a.postedDate);
          if (a.postedDate) return -1;
          if (b.postedDate) return 1;
          return 0;
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
      for (const r of parsed) {
        let payload: Record<string, unknown> = {
          agency: AGENCY,
          city: CITY,
          county: COUNTY,
          state: STATE,
          source_url: r.sourceUrl,
          response_deadline: r.responseDeadline,
          estimated_value: null,
          source_authority: 'public_construction',
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
