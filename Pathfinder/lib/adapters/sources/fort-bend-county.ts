// lib/adapters/sources/fort-bend-county.ts
//
// Sprint Z12 rewrite — Fort Bend County Purchasing.
//
// SOURCE CONTEXT (re-verified 2026-05-28):
//   Fort Bend County migrated active solicitations off the
//   fortbendcountytx.gov landing page (which now renders "No results" in
//   the current-bids table) to Euna Procurement (Bonfire) at
//     https://fortbendcountytx.bonfirehub.com/portal/?tab=openOpportunities
//
//   The pre-Z12 adapter scraped the county landing page as a fallback and
//   matched any table that contained the words "starting" / "closing" /
//   "status" in its header. That selector pulled in historical
//   "Tabulations" archive rows, "Doing business with Fort Bend"
//   navigation tiles, and assorted page-nav links — all with
//   project_stage='unknown' and titles that are not real opportunities.
//
// Z12 strategy: mirror galveston-county.ts gold standard exactly.
//   1) Hit the Bonfire public-portal JSON. Emit one event per open
//      opportunity, shape matched to galveston-county.ts so downstream
//      ranking + enrichment paths see identical structure.
//   2) If Bonfire is empty or throws, return [] — no landing-page
//      fallback. The county itself has stopped publishing solicitations
//      on the landing page, so any rows scraped from it would be garbage
//      by definition.
//
// Geofence: Fort Bend County is in TX → inside the Zedcor primary set.
// The orchestrator's geofence runs upstream of this adapter; we still
// tag the rows with state=TX so the geofence accounting matches.

import type { SourceAdapter, SourceEvent } from './types';
import { buildEvent, hashId, parseLooseDate, pfFetchJson } from './_zedcor-shared';

const BONFIRE_PORTAL = 'fortbendcountytx.bonfirehub.com';
const ENDPOINT = `https://${BONFIRE_PORTAL}/portal/api/portal/v1/opportunities?status=open`;

interface BonfireOpp {
  id?: number | string;
  identifier?: string | null;
  title?: string | null;
  publishDate?: string | null;
  closeDate?: string | null;
  buyerName?: string | null;
}

interface BonfireList {
  data?: BonfireOpp[];
  opportunities?: BonfireOpp[];
}

export const fortBendCountyAdapter: SourceAdapter = {
  id: 'fort-bend-county',
  type: 'registered',
  description:
    'Fort Bend County Purchasing — Bonfire public portal only. Landing-page fallback removed in Z12 (county stopped publishing solicitations there).',

  async poll(opts): Promise<SourceEvent[]> {
    let payload: BonfireList;
    try {
      payload = await pfFetchJson<BonfireList>(ENDPOINT, { fetchImpl: opts.fetch });
    } catch {
      return [];
    }
    const rows = payload.data ?? payload.opportunities ?? [];
    return rows.map((opp) => {
      const sourceEventId = String(opp.identifier ?? opp.id ?? hashId(opp.title ?? ''));
      const sourceUrl = `https://${BONFIRE_PORTAL}/portal/?tab=openOpportunities&opportunityId=${encodeURIComponent(String(opp.id ?? sourceEventId))}`;
      return buildEvent({
        source_event_id: sourceEventId,
        title: (opp.title ?? '').trim() || `Fort Bend County opportunity ${sourceEventId}`,
        summary: null,
        posted_date: parseLooseDate(opp.publishDate ?? null),
        raw_payload: {
          agency: opp.buyerName ?? 'Fort Bend County Purchasing',
          city: 'Richmond',
          county: 'Fort Bend County',
          state: 'TX',
          source_url: sourceUrl,
          response_deadline: parseLooseDate(opp.closeDate ?? null),
          estimated_value: null,
          source_authority: 'county_purchasing',
          project_stage: 'solicitation',
          bonfire_raw: opp,
        },
      });
    });
  },
};
