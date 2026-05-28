// lib/adapters/sources/corpus-christi-city.ts
//
// Sprint Z10 adapter — City of Corpus Christi, Contracts & Procurement.
// Landing page: https://www.cctexas.com/departments/contracts-and-procurement
//
// ENDPOINT DISCOVERY:
//   The City of Corpus Christi routes open solicitations through a Bonfire
//   public portal at corpuschristi.bonfirehub.com. The harris-county-bonfire
//   adapter is the template — Bonfire SPAs bootstrap the open-opportunities
//   table via an XHR to
//   `/PublicPortal/getOpenPublicOpportunitiesSectionData`, returning JSON
//   shape `{ success, message, payload: { projects: {<id>:{...}}, departments: [] } }`.
//
//   Per-project fields mirror the Harris County subdomain: ProjectID,
//   ReferenceID, ProjectName, DateClose, DepartmentID, etc. There is no
//   publish/posted date in this payload — `posted_date` is emitted null.
//   For detail-enrichment ordering we use soonest-closing 5 projects as a
//   proxy for "most active" live solicitations.
//
// FALLBACK STRATEGY:
//   If the Bonfire JSON route 404s or shifts shape, we fall back to scraping
//   the cctexas.com landing page for any `bonfirehub.com` anchors that point
//   directly into the public portal. If both pathways yield zero rows we
//   return [] so the orchestrator records source_empty / parser_drift.
//
// Detail-page enrichment:
//   Detail URLs are `/opportunities/<ProjectID>`. enrichDetailPages swallows
//   per-URL Cloudflare/timeout errors so a single failure doesn't kill the
//   run. Successful detail pages still flow through the phase-signals regex.
//
// Geofence: Corpus Christi sits in Nueces County, TX → in-region.

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

const PORTAL = 'corpuschristi.bonfirehub.com';
const ENDPOINT = `https://${PORTAL}/PublicPortal/getOpenPublicOpportunitiesSectionData`;
const PORTAL_URL = `https://${PORTAL}/portal/?tab=openOpportunities`;
const LANDING_URL = 'https://www.cctexas.com/departments/contracts-and-procurement';

const AGENCY = 'City of Corpus Christi Contracts & Procurement';
const CITY = 'Corpus Christi';
const COUNTY = 'Nueces County';
const STATE = 'TX';

interface CCBonfireProject {
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

interface CCBonfireResponse {
  success?: number | boolean;
  message?: string;
  payload?: {
    projects?: Record<string, CCBonfireProject> | CCBonfireProject[];
    departments?: unknown;
  };
}

type Upgrade = {
  phase: BidLifecyclePhase;
  confidence: number;
  buy_window_open: boolean;
  evidence: string;
};

interface ParsedRow {
  sourceEventId: string;
  title: string;
  sourceUrl: string;
  detailUrl: string;
  postedDate: string | null;
  responseDeadline: string | null;
  raw: Record<string, unknown>;
}

async function tryBonfireJson(fetchImpl?: typeof fetch): Promise<ParsedRow[]> {
  try {
    const payload = await pfFetchJson<CCBonfireResponse>(ENDPOINT, { fetchImpl });
    const projectsBlob = payload?.payload?.projects;
    const rows: CCBonfireProject[] = Array.isArray(projectsBlob)
      ? projectsBlob
      : projectsBlob && typeof projectsBlob === 'object'
        ? Object.values(projectsBlob)
        : [];
    if (rows.length === 0) return [];

    return rows.map((opp) => {
      const projectId = opp.ProjectID != null ? String(opp.ProjectID) : '';
      const sourceEventId = String(
        opp.ReferenceID?.trim() || projectId || hashId(opp.ProjectName ?? ''),
      );
      const sourceUrl = projectId
        ? `${PORTAL_URL}&opportunityId=${encodeURIComponent(projectId)}`
        : PORTAL_URL;
      const detailUrl = projectId
        ? `https://${PORTAL}/opportunities/${encodeURIComponent(projectId)}`
        : PORTAL_URL;
      const title =
        (opp.ProjectName ?? '').trim() || `Corpus Christi opportunity ${sourceEventId}`;
      return {
        sourceEventId,
        title,
        sourceUrl,
        detailUrl,
        postedDate: null,
        responseDeadline: parseLooseDate(opp.DateClose ?? null),
        raw: { bonfire_raw: opp },
      };
    });
  } catch {
    return [];
  }
}

async function tryLandingHtml(fetchImpl?: typeof fetch): Promise<ParsedRow[]> {
  try {
    const $ = await pfFetchHtml(LANDING_URL, { fetchImpl });
    const rows: ParsedRow[] = [];
    $('a[href*="bonfirehub.com"]').each((_, a) => {
      const href = $(a).attr('href');
      const text = $(a).text().trim().replace(/\s+/g, ' ');
      if (!href || !text || text.length < 4) return;
      let absoluteUrl: string;
      try {
        absoluteUrl = new URL(href, LANDING_URL).toString();
      } catch {
        return;
      }
      rows.push({
        sourceEventId: hashId(`${AGENCY}|${text}`),
        title: text,
        sourceUrl: absoluteUrl,
        detailUrl: absoluteUrl,
        postedDate: null,
        responseDeadline: null,
        raw: { landing_anchor_href: href, landing_anchor_text: text },
      });
    });
    return rows;
  } catch {
    return [];
  }
}

export const corpusChristiCityAdapter: SourceAdapter = {
  id: 'corpus-christi-city',
  type: 'registered',
  description:
    'City of Corpus Christi Contracts & Procurement — Bonfire public portal (getOpenPublicOpportunitiesSectionData JSON; cctexas.com landing HTML fallback).',

  async poll(opts): Promise<SourceEvent[]> {
    try {
      if (!isInZedcorGeofence(STATE)) return [];

      let parsed = await tryBonfireJson(opts.fetch);
      if (parsed.length === 0) {
        parsed = await tryLandingHtml(opts.fetch);
      }
      if (parsed.length === 0) return [];

      const init = initialPhaseTagging();

      // Soonest-closing first (no posted_date available on Bonfire JSON).
      const enrichmentTargets = [...parsed]
        .filter((c) => !!c.responseDeadline)
        .sort((a, b) => (a.responseDeadline ?? '').localeCompare(b.responseDeadline ?? ''))
        .slice(0, 5);
      const detailQueue =
        enrichmentTargets.length > 0 ? enrichmentTargets : parsed.slice(0, 5);

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
      for (const c of parsed) {
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
          ...c.raw,
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
