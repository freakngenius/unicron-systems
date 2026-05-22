// lib/adapters/sources/usaspending-recipients.ts
//
// USAspending recipients adapter — Internal onboarding Stage 5.
//
// Endpoint: https://api.usaspending.gov/api/v2/recipient/duns/
// Auth: none (public API).
// Method: POST with a JSON body containing keyword + page/limit. The
//   /recipient/duns/ endpoint returns federal-contract recipients keyed
//   by DUNS / UEI with rolled-up award amounts. Internal uses these as
//   construction-vertical company signals: a recipient that has received
//   federal construction contracts is by definition active in the space.
//
// Filter strategy: keyword search per construction NAICS family
// (e.g. "236 construction", "238 specialty trade"). USAspending's
// /recipient/duns/ endpoint does not accept a direct NAICS filter; we
// rely on the keyword search and then a NAICS-based qualifier downstream.
//
// Spec: Pathfinder/Pathfinder-Internal-Blueprint.md §8.
//       Pathfinder/docs/PLAN-internal-onboarding.md §"Stage 5".
// Live-verified 2026-05-22 against https://api.usaspending.gov/.

import type { SourceAdapter, SourcePollOptions, SourceEvent } from './types';
import { INTERNAL_UA } from './_internal-shared';

const ENDPOINT = 'https://api.usaspending.gov/api/v2/recipient/duns/';

// Keyword set covers all four construction NAICS families. Each query
// returns roughly the same top recipients (by total awarded amount) for
// that vertical slice; we de-dupe by UEI.
const CONSTRUCTION_KEYWORDS = [
  'construction',
  'contractor',
  'specialty trade',
  'equipment rental',
];

interface UsaSpendingRecipient {
  id?: string;
  duns?: string | null;
  uei?: string | null;
  name?: string;
  recipient_level?: 'P' | 'C' | 'R';
  amount?: number;
}

interface UsaSpendingResponse {
  page_metadata?: {
    page?: number;
    total?: number;
    limit?: number;
    next?: number | null;
    previous?: number | null;
    hasNext?: boolean;
    hasPrevious?: boolean;
  };
  results?: UsaSpendingRecipient[];
}

async function search(
  keyword: string,
  limit: number,
  fetchImpl: typeof fetch,
): Promise<UsaSpendingRecipient[]> {
  const body = {
    order: 'desc',
    sort: 'amount',
    page: 1,
    limit,
    keyword,
  };
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': INTERNAL_UA,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`usaspending fetch failed: ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`);
  }
  const json = (await res.json()) as UsaSpendingResponse;
  return json.results ?? [];
}

export const usaspendingRecipientsAdapter: SourceAdapter = {
  id: 'usaspending',
  type: 'registered',
  description:
    'USAspending recipient/awardee search — construction-vertical federal contract recipients ranked by total awarded amount.',

  async poll(opts: SourcePollOptions): Promise<SourceEvent[]> {
    const fetchImpl = opts.fetch ?? globalThis.fetch;
    const limit = Number(opts.config?.limit ?? 25);
    const events: SourceEvent[] = [];
    const seen = new Set<string>();

    for (const keyword of CONSTRUCTION_KEYWORDS) {
      let results: UsaSpendingRecipient[];
      try {
        results = await search(keyword, limit, fetchImpl);
      } catch (err) {
        console.error(`[usaspending] keyword="${keyword}" error:`,
          err instanceof Error ? err.message : err);
        continue;
      }
      for (const r of results) {
        // Recipients show up at three levels (P=parent, C=child, R=raw);
        // we prefer parent rows for ranking but keep the recipient id
        // distinct per level to avoid cross-level merge collisions.
        const uei = r.uei ?? r.duns ?? r.id;
        if (!uei) continue;
        const key = `${uei}:${r.recipient_level ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // Skip non-parent rows when the parent already landed; this
        // keeps the dedup tight for the projects insert.
        if (r.recipient_level && r.recipient_level !== 'P') {
          const parentKey = `${uei}:P`;
          if (seen.has(parentKey)) continue;
        }
        events.push({
          source_event_id: `usaspending:${uei}:${r.recipient_level ?? 'X'}`,
          title: r.name ?? `Recipient ${uei}`,
          summary: `Federal contract recipient · keyword "${keyword}" · level ${r.recipient_level ?? 'unknown'}${
            typeof r.amount === 'number' ? ` · $${Math.round(r.amount).toLocaleString()} awarded` : ''
          }`,
          posted_date: null,
          raw_payload: {
            uei,
            duns: r.duns ?? null,
            name: r.name ?? null,
            recipient_level: r.recipient_level ?? null,
            amount: r.amount ?? null,
            keyword,
            internal_federal_registration: 'federal-awardee',
          },
          city: null,
          state: null,
          country: 'USA',
        });
      }
    }
    return events;
  },
};
