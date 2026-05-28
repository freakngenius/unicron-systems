// lib/adapters/sources/hisd-ionwave.ts
//
// Sprint Z1A adapter — Houston ISD (IonWave public portal).
// The portal endpoint historically requires a valid session/token; on
// 2026-05-27 the unauthenticated request returned "Invalid Address
// Requested". We attempt the documented page; if the body is unparseable
// HTML or contains the IonWave error fragment, return empty.

import type { SourceAdapter, SourceEvent } from './types';
import { buildEvent, hashId, parseLooseDate, pfFetchHtml } from './_zedcor-shared';

const ENDPOINT = 'https://houstonisd.ionwave.net/CurrentSolicitations.aspx';

export const hisdIonwaveAdapter: SourceAdapter = {
  id: 'hisd-ionwave',
  type: 'registered',
  description: 'Houston ISD IonWave current solicitations (HTML scrape).',

  async poll(opts): Promise<SourceEvent[]> {
    let $: ReturnType<typeof Function> & any;
    try {
      $ = await pfFetchHtml(ENDPOINT, { fetchImpl: opts.fetch });
    } catch {
      return [];
    }
    if (/invalid address requested/i.test($('body').text() ?? '')) return [];

    const events: SourceEvent[] = [];

    // IonWave renders the solicitation list as a server-rendered table.
    // Most IonWave skins use a grid with id=gvSolicitations or class=grid.
    $('table tr').each((_: unknown, el: unknown) => {
      const cells = $(el).find('td').toArray();
      if (cells.length < 3) return;
      const title = $(cells[0]).text().trim();
      if (!title || /reference|description|solicitation/i.test(title)) return;
      const ref = cells[1] ? $(cells[1]).text().trim() : '';
      const closeText = cells[cells.length - 1] ? $(cells[cells.length - 1]).text().trim() : null;
      const link = $(cells[0]).find('a').first().attr('href') ?? null;
      const absoluteUrl = link ? new URL(link, ENDPOINT).toString() : ENDPOINT;
      const sourceEventId = ref || hashId(title);
      events.push(
        buildEvent({
          source_event_id: sourceEventId,
          title,
          summary: null,
          posted_date: null,
          raw_payload: {
            agency: 'Houston ISD',
            city: 'Houston',
            county: 'Harris County',
            state: 'TX',
            source_url: absoluteUrl,
            response_deadline: parseLooseDate(closeText),
            estimated_value: null,
            ionwave_ref: ref,
          },
        }),
      );
    });
    return events;
  },
};
