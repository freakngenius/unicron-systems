// lib/adapters/sources/business-license-issuances.ts
//
// Business-license issuances adapter — Funder onboarding Stage 3.
//
// City and state open-data portals (mostly Socrata-backed) expose
// business-license issuance datasets. There is no national feed; each
// portal has its own endpoint + dataset id. The adapter aggregates over
// an operator-configured list of portals.
//
// Default config ships a small starter list of well-known Socrata
// endpoints; expanding the list is operator config not code.
//
// Status: 'pending' until the operator configures at least one portal —
// the empty default list returns [] which is correct for an unconfigured
// source. The architecture's source registry shows it as 'pending'
// to surface "X sources in setup" in the org dashboard, per blueprint §8.
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 3.

import type { SourceAdapter, SourcePollOptions, SourceEvent } from './types';

interface PortalConfig {
  name: string;
  endpoint: string;          // e.g. https://data.sfgov.org/resource/<id>.json
  app_token_env?: string;    // env var holding Socrata app token, if required
  filter?: string;           // SoQL $where clause, e.g. "issued >= '2024-01-01'"
}

const DEFAULT_PORTALS: PortalConfig[] = [
  // Empty by default — Socrata endpoints + dataset ids change; operator
  // configures the list to opt in.
];

export const businessLicenseIssuancesAdapter: SourceAdapter = {
  id: 'business-license-issuances',
  type: 'pending',
  description:
    'Business-license issuances — Socrata multi-portal aggregator (operator-configured). Pending until at least one portal is configured.',

  async poll(opts: SourcePollOptions): Promise<SourceEvent[]> {
    const fetchImpl = opts.fetch ?? globalThis.fetch;
    const portals = (opts.config?.portals as PortalConfig[] | undefined) ?? DEFAULT_PORTALS;
    if (portals.length === 0) return [];

    const events: SourceEvent[] = [];
    for (const portal of portals) {
      const url = new URL(portal.endpoint);
      if (portal.filter) url.searchParams.set('$where', portal.filter);
      url.searchParams.set('$limit', '100');
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'User-Agent': 'Pathfinder/Funder',
      };
      const token = portal.app_token_env ? process.env[portal.app_token_env] : undefined;
      if (token) headers['X-App-Token'] = token;
      let rows: Array<Record<string, unknown>>;
      try {
        const res = await fetchImpl(url.toString(), { headers });
        if (!res.ok) {
          console.error(`[biz-license] ${portal.name} fetch failed: ${res.status}`);
          continue;
        }
        rows = (await res.json()) as Array<Record<string, unknown>>;
      } catch (err) {
        console.error(`[biz-license] ${portal.name} error:`, err instanceof Error ? err.message : err);
        continue;
      }
      for (const row of rows) {
        const license = String(row.license_number ?? row.id ?? row[':id'] ?? '').trim();
        const business = String(row.business_name ?? row.dba_name ?? row.name ?? '').trim();
        if (!license || !business) continue;
        events.push({
          source_event_id: `biz-license:${portal.name}:${license}`,
          title: business,
          summary: `Business license issued · ${portal.name}`,
          posted_date: (row.issued ?? row.issue_date ?? row.start_date ?? null) as string | null,
          raw_payload: { portal: portal.name, ...row },
          city: (row.city ?? null) as string | null,
          state: (row.state ?? row.state_code ?? null) as string | null,
        });
      }
    }
    return events;
  },
};
