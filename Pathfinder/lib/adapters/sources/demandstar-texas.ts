// lib/adapters/sources/demandstar-texas.ts
//
// Sprint Z13 — DemandStar Texas aggregator.
//
// DemandStar aggregates ~8,000 Texas government procurement opportunities
// (cities, counties, school districts, state agencies). The free public
// search at https://www.demandstar.com/search?state=TX returns paginated
// JSON when called with Accept: application/json against the v2 API:
//   https://api.demandstar.com/v2/buyer/notices?state=TX&pageSize=100
//
// Authoritative-quality solicitation source, not awards. project_stage
// defaults to 'solicitation' with buy_window_open=true; the orchestrator's
// phase-signals re-evaluates if the response_deadline indicates the
// window already closed.
//
// Mirror of galveston-county.ts gold standard: thin adapter, fall back
// to landing-page scrape when the API returns 4xx (login wall) — which
// happens when DemandStar rotates their public-search policy.

import * as cheerio from 'cheerio';
import type { SourceAdapter, SourceEvent } from './types';
import { buildEvent, hashId, parseLooseDate, pfFetchHtml, pfFetchJson } from './_zedcor-shared';

const API = 'https://api.demandstar.com/v2/buyer/notices?state=TX&pageSize=100';
const LANDING = 'https://www.demandstar.com/search?state=TX';

interface DemandstarNotice {
  id?: string | number;
  noticeId?: string | number;
  title?: string | null;
  summary?: string | null;
  publishDate?: string | null;
  dueDate?: string | null;
  buyerName?: string | null;
  state?: string | null;
  url?: string | null;
}

interface DemandstarListResponse {
  notices?: DemandstarNotice[];
  data?: DemandstarNotice[];
}

export const demandstarTexasAdapter: SourceAdapter = {
  id: 'demandstar-texas',
  type: 'registered',
  description:
    'DemandStar Texas notices aggregator (~8k TX govt opportunities). Primary: v2 API JSON; fallback: landing-page scrape.',

  async poll(opts): Promise<SourceEvent[]> {
    // 1) JSON API path.
    try {
      const payload = await pfFetchJson<DemandstarListResponse>(API, { fetchImpl: opts.fetch });
      const list = payload.notices ?? payload.data ?? [];
      if (list.length > 0) {
        return list.flatMap((n) => {
          const id = String(n.noticeId ?? n.id ?? '').trim();
          const title = (n.title ?? '').trim();
          if (!id || !title) return [] as SourceEvent[];
          const url = n.url && /^https?:\/\//.test(n.url)
            ? n.url
            : `https://www.demandstar.com/notice/${encodeURIComponent(id)}`;
          return [buildEvent({
            source_event_id: id,
            title,
            summary: (n.summary ?? '').trim() || null,
            posted_date: parseLooseDate(n.publishDate ?? null),
            raw_payload: {
              agency: n.buyerName ?? null,
              state: 'TX',
              source_url: url,
              source_authority: 'public_construction',
              project_stage: 'solicitation',
              phase_confidence: 0.85,
              buy_window_open: true,
              response_deadline: parseLooseDate(n.dueDate ?? null),
              demandstar_raw: n,
            },
          })];
        });
      }
    } catch {
      // fall through to HTML fallback
    }

    // 2) HTML fallback.
    let $: cheerio.CheerioAPI;
    try {
      $ = await pfFetchHtml(LANDING, { fetchImpl: opts.fetch });
    } catch {
      return [];
    }

    const events: SourceEvent[] = [];
    $('.notice-card, .result-card, article.notice, tr.notice-row').each((_idx, el) => {
      const $el = $(el);
      const titleEl = $el.find('a.title, h3 a, .notice-title a').first();
      const title = titleEl.text().trim().replace(/\s+/g, ' ');
      if (!title || title.length < 4) return;
      const href = titleEl.attr('href');
      if (!href) return;
      let sourceUrl: string;
      try { sourceUrl = new URL(href, LANDING).toString(); } catch { return; }
      const agency = $el.find('.buyer, .agency, .notice-buyer').first().text().trim() || null;
      const dueRaw = $el.find('.due-date, .closing, time.due').first().text().trim() || null;
      events.push(buildEvent({
        source_event_id: hashId(sourceUrl),
        title,
        summary: null,
        posted_date: null,
        raw_payload: {
          agency,
          state: 'TX',
          source_url: sourceUrl,
          source_authority: 'public_construction',
          project_stage: 'solicitation',
          phase_confidence: 0.7,
          buy_window_open: true,
          response_deadline: parseLooseDate(dueRaw),
        },
      }));
    });

    return events;
  },
};
