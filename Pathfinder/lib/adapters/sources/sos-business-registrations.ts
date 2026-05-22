// lib/adapters/sources/sos-business-registrations.ts
//
// State Secretary-of-State business registrations adapter — Internal Stage 5.
//
// Signal: newly-registered construction companies. A new construction LLC
// or corp filing is a leading indicator: the company is just standing up
// operations and is the right moment to land an outbound message.
//
// Implementation: per-state Socrata aggregator. Default config ships
// New York (data.ny.gov dataset p66s-i79p, the Active Corporations file)
// because it is keyless and was live-verified to return entities filtered
// by entity_name + filing_date. Other states register as scaffolds and
// are pluggable through opts.config.portals.
//
// Live-verified 2026-05-22 against
// https://data.ny.gov/resource/p66s-i79p.json (HTTP 200 with the
// construction-name + filing-date filter applied).
//
// Spec: Pathfinder/Pathfinder-Internal-Blueprint.md §8 priority 4.
//       Pathfinder/docs/PLAN-internal-onboarding.md §"Stage 5".

import type { SourceAdapter, SourcePollOptions, SourceEvent } from './types';
import { INTERNAL_UA } from './_internal-shared';

interface SosPortalConfig {
  /** Human-readable state name or label. */
  state: string;
  /** Two-letter postal code. */
  state_code: string;
  /** Full Socrata resource URL ending in .json. */
  endpoint: string;
  /** Optional Socrata app-token env var (raises rate limits; not required). */
  app_token_env?: string;
  /** SoQL $where clause filtering for construction entities. */
  where?: string;
  /** Result columns: entity name, filing date, address etc. */
  field_map?: {
    entity_id?: string;
    entity_name?: string;
    filing_date?: string;
    city?: string;
    state?: string;
    entity_type?: string;
  };
}

// Default portal list — ship NY now; CA/TX/FL/etc. are scaffolds the
// operator opts into via config.portals. The blueprint accepts ship-the-
// accessible-states-first; remaining states surface as 'pending' until
// configured (architecture.sources[].type can stay 'pending' here).
const DEFAULT_PORTALS: SosPortalConfig[] = [
  {
    state: 'New York',
    state_code: 'NY',
    endpoint: 'https://data.ny.gov/resource/p66s-i79p.json',
    where:
      "upper(current_entity_name) like '%CONSTRUCTION%' AND initial_dos_filing_date > '2025-01-01'",
    field_map: {
      entity_id: 'dos_id',
      entity_name: 'current_entity_name',
      filing_date: 'initial_dos_filing_date',
      city: 'dos_process_city',
      state: 'dos_process_state',
      entity_type: 'entity_type',
    },
  },
];

interface SosRow {
  [key: string]: unknown;
}

function pluck(row: SosRow, key: string | undefined): string | null {
  if (!key) return null;
  const v = row[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

export const sosBusinessRegistrationsAdapter: SourceAdapter = {
  id: 'custom-sos-business-registrations',
  type: 'registered',
  description:
    'State Secretary-of-State new-business filings (Socrata multi-portal aggregator). Default ships NY; other states pluggable via config.',

  async poll(opts: SourcePollOptions): Promise<SourceEvent[]> {
    const fetchImpl = opts.fetch ?? globalThis.fetch;
    const portals = (opts.config?.portals as SosPortalConfig[] | undefined) ?? DEFAULT_PORTALS;
    if (portals.length === 0) return [];

    const limit = Number(opts.config?.limit ?? 50);
    const events: SourceEvent[] = [];

    for (const portal of portals) {
      const url = new URL(portal.endpoint);
      if (portal.where) url.searchParams.set('$where', portal.where);
      url.searchParams.set('$limit', String(limit));
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'User-Agent': INTERNAL_UA,
      };
      const token = portal.app_token_env ? process.env[portal.app_token_env] : undefined;
      if (token) headers['X-App-Token'] = token;

      let rows: SosRow[];
      try {
        const res = await fetchImpl(url.toString(), { headers });
        if (!res.ok) {
          console.error(`[sos-registrations] ${portal.state_code} status=${res.status}`);
          continue;
        }
        rows = (await res.json()) as SosRow[];
      } catch (err) {
        console.error(`[sos-registrations] ${portal.state_code} error:`,
          err instanceof Error ? err.message : err);
        continue;
      }
      for (const row of rows) {
        const fm = portal.field_map ?? {};
        const id = pluck(row, fm.entity_id);
        const name = pluck(row, fm.entity_name);
        if (!id || !name) continue;
        events.push({
          source_event_id: `sos:${portal.state_code}:${id}`,
          title: name,
          summary: `New business registration · ${portal.state} · ${pluck(row, fm.entity_type) ?? 'entity'}`,
          posted_date: pluck(row, fm.filing_date),
          raw_payload: {
            portal_state: portal.state,
            portal_state_code: portal.state_code,
            entity_id: id,
            entity_name: name,
            entity_type: pluck(row, fm.entity_type),
            filing_date: pluck(row, fm.filing_date),
            row,
            internal_sales_motion_signal: 'unknown',
          },
          city: pluck(row, fm.city),
          state: pluck(row, fm.state) ?? portal.state_code,
          country: 'USA',
        });
      }
    }
    return events;
  },
};
