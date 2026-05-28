// lib/adapters/sources/harris-county-bonfire.ts
//
// Sprint Z3 adapter — Harris County Purchasing (Bonfire public portal).
// Endpoint: https://harriscountytx.bonfirehub.com/portal/?tab=openOpportunities
//
// ENDPOINT DISCOVERY (verified 2026-05-28):
//   The Bonfire portal SPA bootstraps the open-opportunities table via an
//   XHR to `/PublicPortal/getOpenPublicOpportunitiesSectionData`, which
//   returns JSON of shape `{ success, message, payload: { projects: {<id>:{...}}, departments: [] } }`.
//
//   The galveston-county template targets `/portal/api/portal/v1/opportunities?status=open`,
//   but that path returns HTTP 404 on the Harris County subdomain — the
//   public-portal section endpoint is the live route. Per-project fields are:
//     ProjectID, PrivateProjectID, ReferenceID,
//     ProjectStatusID, ProjectSubStatusID, ProjectVisibilityID,
//     ProjectName, DateClose, DepartmentID
//   There is no publish/posted date in this payload — `posted_date` is
//   emitted as null. For detail-enrichment ordering we use the soonest-
//   closing 5 projects as a proxy for "most active" since the SPEC's
//   publishDate field is unavailable on this subdomain.
//
// FALLBACK STRATEGY:
//   If the `getOpenPublicOpportunitiesSectionData` route ever changes
//   shape, we return [] so the orchestrator records `source_empty` /
//   `parser_drift`. A future Sprint may add an HTML fallback that
//   parses the rendered table after a headless browser pass; the public
//   portal's static HTML does not contain the opportunity rows.
//
// Detail-page enrichment:
//   Detail URLs are `/opportunities/<ProjectID>`. Detail pages are often
//   Cloudflare-protected (HTTP 403); the shared `enrichDetailPages`
//   helper swallows per-URL errors so a Cloudflare block on one detail
//   does not kill the run. Successful pages still flow through the
//   phase-signals regex for `pre-bid conference`, `addendum`, `award
//   notice`, etc.
//
// Geofence: Harris County is in TX → in-region.

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

const PORTAL = 'harriscountytx.bonfirehub.com';
const ENDPOINT = `https://${PORTAL}/PublicPortal/getOpenPublicOpportunitiesSectionData`;
const PORTAL_URL = `https://${PORTAL}/portal/?tab=openOpportunities`;

interface HCBonfireProject {
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

interface HCBonfireResponse {
  success?: number | boolean;
  message?: string;
  payload?: {
    projects?: Record<string, HCBonfireProject> | HCBonfireProject[];
    departments?: unknown;
  };
}

type Upgrade = {
  phase: BidLifecyclePhase;
  confidence: number;
  buy_window_open: boolean;
  evidence: string;
};

export const harrisCountyBonfireAdapter: SourceAdapter = {
  id: 'harris-county-bonfire',
  type: 'registered',
  description:
    'Harris County Purchasing — Bonfire public portal (getOpenPublicOpportunitiesSectionData JSON, with detail-page phase enrichment).',

  async poll(opts): Promise<SourceEvent[]> {
    try {
      let payload: HCBonfireResponse;
      try {
        payload = await pfFetchJson<HCBonfireResponse>(ENDPOINT, { fetchImpl: opts.fetch });
      } catch {
        // Endpoint shape / route may have shifted. Surface as source_empty.
        return [];
      }

      const projectsBlob = payload?.payload?.projects;
      const rows: HCBonfireProject[] = Array.isArray(projectsBlob)
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
        postedDate: string | null; // always null on this subdomain
        raw: HCBonfireProject;
      };

      const candidates: Candidate[] = rows.map((opp) => {
        const projectId = opp.ProjectID != null ? String(opp.ProjectID) : '';
        const sourceEventId = String(
          opp.ReferenceID?.trim() ||
            projectId ||
            hashId(opp.ProjectName ?? ''),
        );
        // Public listing URL surfaces the opportunity inside the portal SPA.
        const sourceUrl = projectId
          ? `${PORTAL_URL}&opportunityId=${encodeURIComponent(projectId)}`
          : PORTAL_URL;
        // Direct opportunity detail page — used for phase enrichment.
        const detailUrl = projectId
          ? `https://${PORTAL}/opportunities/${encodeURIComponent(projectId)}`
          : PORTAL_URL;
        const title = (opp.ProjectName ?? '').trim() || `Harris County opportunity ${sourceEventId}`;
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

      // Geofence: every row is Harris County, TX — defensive filter anyway.
      const geofenced = candidates.filter(() => isInZedcorGeofence('TX'));
      if (geofenced.length === 0) return [];

      // Top-5 for detail enrichment. The payload exposes no publishDate, so
      // we sort by soonest-closing (DateClose asc) as a proxy for the most
      // active live solicitations — these are the rows most likely to carry
      // pre-bid / addendum / award-notice phase signals on their detail page.
      const enrichmentTargets = [...geofenced]
        .filter((c) => !!c.responseDeadline)
        .sort((a, b) => (a.responseDeadline ?? '').localeCompare(b.responseDeadline ?? ''))
        .slice(0, 5);
      // Fallback when none have parseable DateClose: take first 5.
      const detailQueue =
        enrichmentTargets.length > 0 ? enrichmentTargets : geofenced.slice(0, 5);

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
          agency: 'Harris County Purchasing',
          city: 'Houston',
          county: 'Harris County',
          state: 'TX',
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
