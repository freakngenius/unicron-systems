// lib/adapters/sources/port-houston.ts
//
// Sprint Z1A adapter — Port of Houston (Workday Strategic Sourcing public portal).
// The portal at port-of-houston-authority.public-portal.us.workdayspend.com
// is a JavaScript SPA; we attempt the documented Workday public JSON endpoint
// and gracefully degrade to empty on shape changes.

import type { SourceAdapter, SourceEvent } from './types';
import { buildEvent, hashId, parseLooseDate, pfFetchJson } from './_zedcor-shared';

const PORTAL = 'port-of-houston-authority.public-portal.us.workdayspend.com';
const ENDPOINT = `https://${PORTAL}/api/portal/events?status=open`;

interface WorkdayEvent {
  id?: string | number;
  externalReference?: string | null;
  title?: string | null;
  publishedAt?: string | null;
  responseDueDate?: string | null;
  organizationName?: string | null;
}

interface WorkdayList {
  data?: WorkdayEvent[];
  events?: WorkdayEvent[];
}

export const portHoustonAdapter: SourceAdapter = {
  id: 'port-houston',
  type: 'registered',
  description: 'Port of Houston (Workday Strategic Sourcing public portal).',

  async poll(opts): Promise<SourceEvent[]> {
    let payload: WorkdayList;
    try {
      payload = await pfFetchJson<WorkdayList>(ENDPOINT, { fetchImpl: opts.fetch });
    } catch {
      return [];
    }
    const rows = payload.data ?? payload.events ?? [];
    return rows.map((ev) => {
      const sourceEventId = String(ev.externalReference ?? ev.id ?? hashId(ev.title ?? ''));
      const sourceUrl = `https://${PORTAL}/event/${encodeURIComponent(String(ev.id ?? sourceEventId))}`;
      return buildEvent({
        source_event_id: sourceEventId,
        title: (ev.title ?? '').trim() || `Port Houston event ${sourceEventId}`,
        summary: null,
        posted_date: parseLooseDate(ev.publishedAt ?? null),
        raw_payload: {
          agency: ev.organizationName ?? 'Port Houston Authority',
          city: 'Houston',
          county: 'Harris County',
          state: 'TX',
          source_url: sourceUrl,
          response_deadline: parseLooseDate(ev.responseDueDate ?? null),
          estimated_value: null,
          workday_raw: ev,
        },
      });
    });
  },
};
