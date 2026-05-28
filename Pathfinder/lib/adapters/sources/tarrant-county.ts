// lib/adapters/sources/tarrant-county.ts
//
// Sprint Z10 adapter — Tarrant County Purchasing (Bonfire public portal).
// Endpoint: https://tarrantcounty.bonfirehub.com/portal/?tab=openOpportunities
//
// ENDPOINT DISCOVERY (verified 2026-05-28 from repo notes):
//   Tarrant County uses the same Bonfire public-portal SPA pattern as
//   Harris County and Fort Worth. The open-opportunities table is
//   bootstrapped via XHR to
//   `/PublicPortal/getOpenPublicOpportunitiesSectionData`, returning JSON
//   of shape `{ success, message, payload: { projects: {<id>:{...}}, departments: [] } }`.
//
//   Per-project fields: ProjectID, PrivateProjectID, ReferenceID,
//   ProjectStatusID, ProjectSubStatusID, ProjectVisibilityID,
//   ProjectName, DateClose, DepartmentID. There is no publishDate on this
//   payload — posted_date is emitted as null and the enrichment queue is
//   sorted by soonest DateClose as a proxy for live activity.
//
// FALLBACK STRATEGY:
//   If the JSON section endpoint shifts shape we return [] so the
//   orchestrator records source_empty / parser_drift. The public portal
//   SPA HTML at PORTAL_URL does not contain the opportunity rows pre-
//   hydration so an HTML scrape of the portal URL would produce nothing.
//
// Detail-page enrichment:
//   Detail URLs are `/opportunities/<ProjectID>`. Top-5 (soonest closing)
//   are run through the shared enrichDetailPages helper; per-URL errors
//   are swallowed.
//
// Geofence: Tarrant County, TX → in-region.

import type { SourceAdapter, SourceEvent } from './types';
import {
  applyEnrichmentToPayload,
  buildEvent,
  enrichDetailPages,
  hashId,
  initialPhaseTagging,
  isInZedcorGeofence,
  parseLooseDate,
  pfFetchJson,
  type BidLifecyclePhase,
} from './_zedcor-shared';

const PORTAL = 'tarrantcounty.bonfirehub.com';
const ENDPOINT = `https://${PORTAL}/PublicPortal/getOpenPublicOpportunitiesSectionData`;
const PORTAL_URL = `https://${PORTAL}/portal/?tab=openOpportunities`;

const AGENCY = 'Tarrant County Purchasing';
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

export const tarrantCountyAdapter: SourceAdapter = {
  id: 'tarrant-county',
  type: 'registered',
  description:
    'Tarrant County Purchasing — Bonfire public portal (getOpenPublicOpportunitiesSectionData JSON, with detail-page phase enrichment).',

  async poll(opts): Promise<SourceEvent[]> {
    try {
      let payload: BonfireResponse;
      try {
        payload = await pfFetchJson<BonfireResponse>(ENDPOINT, {
          fetchImpl: opts.fetch,
        });
      } catch {
        return [];
      }

      const projectsBlob = payload?.payload?.projects;
      const rows: BonfireProject[] = Array.isArray(projectsBlob)
        ? projectsBlob
        : projectsBlob && typeof projectsBlob === 'object'
          ? Object.values(projectsBlob)
          : [];
      if (rows.length === 0) return [];

      const init = initialPhaseTagging();

      type Candidate = {
        sourceEventId: string;
        title: string;
        sourceUrl: string;
        detailUrl: string;
        responseDeadline: string | null;
        postedDate: string | null;
        raw: BonfireProject;
      };

      const candidates: Candidate[] = rows.map((opp) => {
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
          `Tarrant County opportunity ${sourceEventId}`;
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

      const geofenced = candidates.filter(() => isInZedcorGeofence(STATE));
      if (geofenced.length === 0) return [];

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
          source_authority: 'county_purchasing',
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
