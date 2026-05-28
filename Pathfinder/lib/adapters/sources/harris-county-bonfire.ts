// lib/adapters/sources/harris-county-bonfire.ts
//
// Sprint Z1A adapter — Harris County (Bonfire public portal).
// harriscountytx.bonfirehub.com is a client-side SPA; the HTML root
// contains no opportunity rows. We attempt the documented Bonfire
// public-portal JSON endpoint; if it shifts, this adapter returns empty
// with a structured note so the orchestrator records source_empty.
//
// Follow-up: Sprint Z2 may swap to Playwright / headless render if the
// JSON endpoint changes again.

import type { SourceAdapter, SourceEvent } from './types';
import { buildEvent, hashId, parseLooseDate, pfFetchJson } from './_zedcor-shared';

const PORTAL = 'harriscountytx.bonfirehub.com';
const ENDPOINT = `https://${PORTAL}/portal/api/portal/v1/opportunities?status=open`;

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

export const harrisCountyBonfireAdapter: SourceAdapter = {
  id: 'harris-county-bonfire',
  type: 'registered',
  description: 'Harris County Bonfire public portal (JSON API; SPA fallback).',

  async poll(opts): Promise<SourceEvent[]> {
    let payload: BonfireListResponse;
    try {
      payload = await pfFetchJson<BonfireListResponse>(ENDPOINT, { fetchImpl: opts.fetch });
    } catch {
      // Endpoint shape may have changed; record empty and let the
      // orchestrator surface 'source_empty' / 'parser_drift'. Follow-up
      // work owns endpoint rediscovery.
      return [];
    }
    const rows = payload.data ?? payload.opportunities ?? [];
    return rows.map((opp) => {
      const sourceEventId = String(opp.identifier ?? opp.id ?? hashId(opp.title ?? ''));
      const sourceUrl = `https://${PORTAL}/portal/?tab=openOpportunities&opportunityId=${encodeURIComponent(String(opp.id ?? sourceEventId))}`;
      return buildEvent({
        source_event_id: sourceEventId,
        title: (opp.title ?? '').trim() || `Harris County opportunity ${sourceEventId}`,
        summary: null,
        posted_date: parseLooseDate(opp.publishDate ?? null),
        raw_payload: {
          agency: opp.buyerName ?? 'Harris County',
          city: 'Houston',
          county: 'Harris County',
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
