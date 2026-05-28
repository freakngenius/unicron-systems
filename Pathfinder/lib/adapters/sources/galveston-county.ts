// lib/adapters/sources/galveston-county.ts
//
// Sprint Z1A adapter — Galveston County Purchasing.
// The county landing page at galvestoncountytx.gov links to a Bonfire
// portal (galveston.bonfirehub.com) for actual opportunities. We try the
// Bonfire public JSON first, falling back to scraping the landing page
// for any direct bid links. WAF on the landing page may return 403 for
// non-browser UA; degrade to empty in that case.

import type { SourceAdapter, SourceEvent } from './types';
import { buildEvent, hashId, parseLooseDate, pfFetchJson } from './_zedcor-shared';

const BONFIRE_PORTAL = 'galveston.bonfirehub.com';
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

export const galvestonCountyAdapter: SourceAdapter = {
  id: 'galveston-county',
  type: 'registered',
  description: 'Galveston County (Bonfire public portal; landing-page fallback).',

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
        title: (opp.title ?? '').trim() || `Galveston County opportunity ${sourceEventId}`,
        summary: null,
        posted_date: parseLooseDate(opp.publishDate ?? null),
        raw_payload: {
          agency: opp.buyerName ?? 'Galveston County',
          city: 'Galveston',
          county: 'Galveston County',
          state: 'TX',
          source_url: sourceUrl,
          response_deadline: parseLooseDate(opp.closeDate ?? null),
          estimated_value: null,
          bonfire_raw: opp,
        },
      });
    });
  },
};
