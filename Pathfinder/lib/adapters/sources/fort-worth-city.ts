// lib/adapters/sources/fort-worth-city.ts
//
// Sprint Z10 adapter — City of Fort Worth Purchasing (Bonfire public portal).
// Endpoint: https://fortworthtx.bonfirehub.com/portal/?tab=openOpportunities
//
// ENDPOINT DISCOVERY (verified 2026-05-28 from repo notes):
//   Fort Worth uses the same Bonfire public-portal SPA pattern as Harris
//   County. The open-opportunities table is bootstrapped via an XHR to
//   `/PublicPortal/getOpenPublicOpportunitiesSectionData`, returning JSON
//   of shape `{ success, message, payload: { projects: {<id>:{...}}, departments: [] } }`.
//
//   Per-project fields mirror the Harris County subdomain: ProjectID,
//   PrivateProjectID, ReferenceID, ProjectStatusID, ProjectSubStatusID,
//   ProjectVisibilityID, ProjectName, DateClose, DepartmentID. No publish
//   date is exposed on this payload, so posted_date is emitted as null and
//   detail-enrichment ordering is by soonest-closing as a proxy for the
//   most active live solicitations.
//
// FALLBACK STRATEGY:
//   If the JSON section endpoint shifts shape or returns non-2xx, we fall
//   back to fetching the City of Fort Worth bids landing page
//   (/departments/finance/purchasing/bids-current) and surfacing direct
//   opportunity anchors. If both routes fail, return [] so the
//   orchestrator records `source_empty` / `parser_drift` rather than
//   crashing the run.
//
// Detail-page enrichment:
//   Detail URLs are `/opportunities/<ProjectID>`. Per shared enrichment
//   policy, the top-5 (sorted by soonest DateClose) are fetched and run
//   through the phase-signals regex. Cloudflare/per-URL errors are
//   swallowed by the shared helper.
//
// Geofence: Fort Worth → Tarrant County, TX → in-region.

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

const PORTAL = 'fortworthtx.bonfirehub.com';
const ENDPOINT = `https://${PORTAL}/PublicPortal/getOpenPublicOpportunitiesSectionData`;
const PORTAL_URL = `https://${PORTAL}/portal/?tab=openOpportunities`;
const HTML_FALLBACK_URL =
  'https://www.fortworthtexas.gov/departments/finance/purchasing/bids-current';

const AGENCY = 'City of Fort Worth Purchasing';
const CITY = 'Fort Worth';
const COUNTY = 'Tarrant County';
const STATE = 'TX';

interface BonfireProject {
  ProjectID?: string | number | null;
  PrivateProjectID?: string | null;
  ReferenceID?: string | null;
  ProjectStatusID?: string | null;
  ProjectSubStatusID?: string | null;
  ProjectVisibilityID?: string | null;
  ProjectName?: string | null;
  DateClose?: string | null;
  DepartmentID?: string | null;
}

interface BonfireResponse {
  success?: number | boolean;
  message?: string;
  payload?: {
    projects?: Record<string, BonfireProject> | BonfireProject[];
    departments?: unknown;
  };
}

type Upgrade = {
  phase: BidLifecyclePhase;
  confidence: number;
  buy_window_open: boolean;
  evidence: string;
};

type Candidate = {
  sourceEventId: string;
  title: string;
  sourceUrl: string;
  detailUrl: string;
  responseDeadline: string | null;
  postedDate: string | null;
  raw: unknown;
};

export const fortWorthCityAdapter: SourceAdapter = {
  id: 'fort-worth-city',
  type: 'registered',
  description:
    'City of Fort Worth Purchasing — Bonfire public portal (getOpenPublicOpportunitiesSectionData JSON, HTML fallback to bids-current).',

  async poll(opts): Promise<SourceEvent[]> {
    try {
      let candidates: Candidate[] = [];

      // Primary path: Bonfire JSON section endpoint.
      try {
        const payload = await pfFetchJson<BonfireResponse>(ENDPOINT, {
          fetchImpl: opts.fetch,
        });
        const projectsBlob = payload?.payload?.projects;
        const rows: BonfireProject[] = Array.isArray(projectsBlob)
          ? projectsBlob
          : projectsBlob && typeof projectsBlob === 'object'
            ? Object.values(projectsBlob)
            : [];

        candidates = rows.map((opp) => {
          const projectId = opp.ProjectID != null ? String(opp.ProjectID) : '';
          const sourceEventId = String(
            opp.ReferenceID?.trim() ||
              projectId ||
              hashId(opp.ProjectName ?? ''),
          );
          const sourceUrl = projectId
            ? `${PORTAL_URL}&opportunityId=${encodeURIComponent(projectId)}`
            : PORTAL_URL;
          const detailUrl = projectId
            ? `https://${PORTAL}/opportunities/${encodeURIComponent(projectId)}`
            : PORTAL_URL;
          const title =
            (opp.ProjectName ?? '').trim() ||
            `Fort Worth opportunity ${sourceEventId}`;
          return {
            sourceEventId,
            title,
            sourceUrl,
            detailUrl,
            responseDeadline: parseLooseDate(opp.DateClose ?? null),
            postedDate: null,
            raw: opp,
          };
        });
      } catch {
        // JSON path failed — try HTML fallback.
        candidates = [];
      }

      // HTML fallback: scrape the bids-current landing page for anchors
      // that point to opportunity detail pages. Only used when the JSON
      // path returned zero rows.
      if (candidates.length === 0) {
        try {
          const $ = await pfFetchHtml(HTML_FALLBACK_URL, {
            fetchImpl: opts.fetch,
          });
          $('header, nav, footer').remove();
          const seen = new Set<string>();
          $('a[href]').each((_, el) => {
            const $a = $(el);
            const rawHref = $a.attr('href');
            if (!rawHref) return;
            // Look for anchors that point to a Bonfire opportunity or to a
            // Fort Worth bid detail page. Skip nav / mail / anchor jumps.
            if (/^#|mailto:/i.test(rawHref)) return;
            if (
              !/bonfirehub\.com\/(opportunities|portal)|\/bids?-current\/.+|\/purchasing\/.+\.(pdf|html?)$/i.test(
                rawHref,
              )
            )
              return;
            const text = $a.text().trim().replace(/\s+/g, ' ');
            if (!text || text.length < 4) return;
            let absoluteUrl: string;
            try {
              absoluteUrl = new URL(rawHref, HTML_FALLBACK_URL).toString();
            } catch {
              return;
            }
            const sourceEventId = hashId(`${AGENCY}|${text}|${absoluteUrl}`);
            if (seen.has(sourceEventId)) return;
            seen.add(sourceEventId);
            candidates.push({
              sourceEventId,
              title: text,
              sourceUrl: absoluteUrl,
              detailUrl: absoluteUrl,
              responseDeadline: null,
              postedDate: null,
              raw: { fallback: 'html', href: absoluteUrl, text },
            });
          });
        } catch {
          // Both routes failed → degrade to empty.
          return [];
        }
      }

      if (candidates.length === 0) return [];

      // Geofence: every Fort Worth row is TX. Defensive filter.
      const geofenced = candidates.filter(() => isInZedcorGeofence(STATE));
      if (geofenced.length === 0) return [];

      const init = initialPhaseTagging();

      // Top-5 for detail enrichment. Prefer soonest-closing.
      const withDeadline = [...geofenced]
        .filter((c) => !!c.responseDeadline)
        .sort((a, b) =>
          (a.responseDeadline ?? '').localeCompare(b.responseDeadline ?? ''),
        )
        .slice(0, 5);
      const detailQueue =
        withDeadline.length > 0 ? withDeadline : geofenced.slice(0, 5);

      const detailUrls = detailQueue.map((c) => c.detailUrl);
      const postedDates: Record<string, string | null> = {};
      for (const c of detailQueue) postedDates[c.detailUrl] = c.postedDate;

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
      for (const c of geofenced) {
        let payloadOut: Record<string, unknown> = {
          agency: AGENCY,
          city: CITY,
          county: COUNTY,
          state: STATE,
          source_url: c.sourceUrl,
          response_deadline: c.responseDeadline,
          estimated_value: null,
          source_authority: 'city_purchasing',
          project_stage: init.project_stage,
          phase_confidence: init.phase_confidence,
          buy_window_open: init.buy_window_open,
          bonfire_raw: c.raw,
        };
        const upgrade = upgrades.get(c.detailUrl);
        if (upgrade) {
          payloadOut = applyEnrichmentToPayload(payloadOut, upgrade);
        }
        events.push(
          buildEvent({
            source_event_id: c.sourceEventId,
            title: c.title,
            summary: null,
            posted_date: c.postedDate,
            raw_payload: payloadOut,
          }),
        );
      }

      return events;
    } catch {
      return [];
    }
  },
};
