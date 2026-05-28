// lib/adapters/sources/brazoria-county.ts
//
// Sprint Z3 adapter — Brazoria County Purchasing.
//
// ENDPOINT DISCOVERY (verified 2026-05-28):
//   The county landing page (https://www.brazoriacountytx.gov/departments/purchasing)
//   returns HTTP 403 to non-browser User-Agents (Cloudflare/WAF). The county
//   actually runs Bonfire under the subdomain `brazoriacounty.bonfirehub.com`
//   (note: NOT `brazoriacountytx.bonfirehub.com`, which is NXDOMAIN). The
//   modern `/portal/api/portal/v1/opportunities?status=open` Bonfire schema
//   used by Galveston/Harris returns 404 here — Brazoria's tenant runs the
//   older PublicPortal endpoint:
//     GET /PublicPortal/getOpenPublicOpportunitiesSectionData
//   which returns { success, message, payload: { projects: { <ProjectID>: {
//     ProjectID, ReferenceID, ProjectName, DateClose, ProjectVisibilityID,
//     PrivateProjectID, DepartmentID, ProjectStatusID, ProjectSubStatusID
//   } }, departments: [] } }.
//
//   Posted date is NOT present in the listing payload (Bonfire's older
//   schema). The detail page URL is `/opportunities/{ProjectID}` (or
//   `/opportunities/private/{PrivateProjectID}` for visibility=PRIVATE).
//   Detail pages 403 without an authenticated session, so enrichment will
//   almost always swallow per-URL errors — this is expected, and the
//   adapter still emits useful rows from the listing.
//
// Geofence: Brazoria County, TX — Angleton is the county seat. state='TX'.

import type { SourceAdapter, SourceEvent } from './types';
import {
  applyEnrichmentToPayload,
  buildEvent,
  enrichDetailPages,
  initialPhaseTagging,
  isInZedcorGeofence,
  parseLooseDate,
  pfFetchJson,
} from './_zedcor-shared';

const PORTAL = 'brazoriacounty.bonfirehub.com';
const LISTING_ENDPOINT = `https://${PORTAL}/PublicPortal/getOpenPublicOpportunitiesSectionData`;

// Bonfire ProjectVisibilityID for public-listed projects. The portal JS
// (verified in /tmp/brazoria-bonfire-portal.html line 812) uses
// `BFConstants.PROJECT_VISIBILITY_PRIVATE` for private; everything else maps
// to the standard /opportunities/{ProjectID} URL. Value `1` is the public
// visibility used by every row returned by the listing endpoint.
const PROJECT_VISIBILITY_PRIVATE = 2;

interface BrazoriaProject {
  ProjectID?: string | number;
  PrivateProjectID?: string | null;
  ReferenceID?: string | null;
  ProjectStatusID?: string | number | null;
  ProjectSubStatusID?: string | number | null;
  ProjectVisibilityID?: string | number | null;
  ProjectName?: string | null;
  DateClose?: string | null;
  DepartmentID?: string | number | null;
}

interface BrazoriaListResponse {
  success?: number;
  message?: string;
  payload?: {
    projects?: Record<string, BrazoriaProject> | BrazoriaProject[];
    departments?: unknown;
  };
}

function buildProjectUrl(p: BrazoriaProject): string {
  const visibility = Number(p.ProjectVisibilityID ?? 1);
  if (visibility === PROJECT_VISIBILITY_PRIVATE && p.PrivateProjectID) {
    return `https://${PORTAL}/opportunities/private/${p.PrivateProjectID}`;
  }
  return `https://${PORTAL}/opportunities/${p.ProjectID}`;
}

export const brazoriaCountyAdapter: SourceAdapter = {
  id: 'brazoria-county',
  type: 'registered',
  description:
    'Brazoria County Purchasing — Bonfire public portal at brazoriacounty.bonfirehub.com (PublicPortal/getOpenPublicOpportunitiesSectionData JSON).',

  async poll(opts): Promise<SourceEvent[]> {
    try {
      let payload: BrazoriaListResponse;
      try {
        payload = await pfFetchJson<BrazoriaListResponse>(LISTING_ENDPOINT, {
          fetchImpl: opts.fetch,
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
      } catch {
        // Endpoint shape may have shifted, or Bonfire flipped the tenant
        // to the newer /portal/api/portal/v1 schema. Either way, record
        // empty and let the orchestrator surface source_empty / parser_drift.
        return [];
      }

      const projectsRaw = payload.payload?.projects ?? {};
      const projects: BrazoriaProject[] = Array.isArray(projectsRaw)
        ? projectsRaw
        : Object.values(projectsRaw);

      if (projects.length === 0) return [];

      const init = initialPhaseTagging();

      type Row = {
        sourceEventId: string;
        title: string;
        sourceUrl: string;
        postedDate: string | null;
        responseDeadline: string | null;
        raw: BrazoriaProject;
      };

      const rows: Row[] = [];
      for (const p of projects) {
        const projectId = p.ProjectID != null ? String(p.ProjectID) : null;
        if (!projectId) continue;
        const reference = (p.ReferenceID ?? '').toString().trim();
        const name = (p.ProjectName ?? '').toString().trim();
        if (!name) continue;
        const title = reference ? `${reference} — ${name}` : name;
        const sourceEventId = reference || projectId;
        const sourceUrl = buildProjectUrl(p);
        // Listing payload has no posted date (Bonfire older schema). Leave
        // null; aging logic in enrichDetailPages handles missing posted_date.
        rows.push({
          sourceEventId,
          title,
          sourceUrl,
          postedDate: null,
          responseDeadline: parseLooseDate(p.DateClose ?? null),
          raw: p,
        });
      }

      if (rows.length === 0) return [];

      // Defensive geofence — every row here is Brazoria County, TX.
      const geofenced = rows.filter(() => isInZedcorGeofence('TX'));

      // Top-5 by deadline soonest (no posted_date available, so deadline is
      // the closest proxy for "most active right now"). Tie-break by title.
      const sortedForEnrichment = [...geofenced].sort((a, b) => {
        const ad = a.responseDeadline ?? '9999';
        const bd = b.responseDeadline ?? '9999';
        if (ad !== bd) return ad < bd ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
      const detailUrls = sortedForEnrichment.slice(0, 5).map((r) => r.sourceUrl);
      const postedDates: Record<string, string | null> = {};
      for (const r of sortedForEnrichment.slice(0, 5)) postedDates[r.sourceUrl] = r.postedDate;

      let upgrades = new Map<
        string,
        {
          phase: import('./_zedcor-shared').BidLifecyclePhase;
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
        let rawPayload: Record<string, unknown> = {
          agency: 'Brazoria County Purchasing',
          city: 'Angleton',
          county: 'Brazoria County',
          state: 'TX',
          source_url: r.sourceUrl,
          response_deadline: r.responseDeadline,
          estimated_value: null,
          source_authority: 'county_purchasing',
          project_stage: init.project_stage,
          phase_confidence: init.phase_confidence,
          buy_window_open: init.buy_window_open,
          bonfire_raw: r.raw,
        };
        const upgrade = upgrades.get(r.sourceUrl);
        if (upgrade) {
          rawPayload = applyEnrichmentToPayload(rawPayload, upgrade);
        }

        events.push(
          buildEvent({
            source_event_id: r.sourceEventId,
            title: r.title,
            summary: null,
            posted_date: r.postedDate,
            raw_payload: rawPayload,
          }),
        );
      }

      return events;
    } catch {
      return [];
    }
  },
};
