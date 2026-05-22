// lib/adapters/sources/state-contractor-licenses.ts
//
// State contractor-license issuances adapter — Internal Stage 5.
//
// Signal: a newly-issued state contractor license is a strong indicator
// that a construction-vertical firm is operationally active and can take
// on new work. Per the blueprint §8 priority 4 this is a tier-2 scaffold:
// no single national source, per-state APIs vary in availability.
//
// Default config ships empty (no portals). The adapter is scaffold-only
// until operators supply per-state endpoints via opts.config.portals or
// architecture-level overrides. The architecture JSON marks the source
// as 'pending' (architecture.sources[].type) which the dashboard surfaces
// as "X sources in setup" per blueprint §8 paragraph 3.
//
// Probed during build (2026-05-22):
//   - CSLB (California State License Board) does not publish a keyless
//     bulk API; their lookup is interactive only. Scaffold.
//   - Texas TREC / TDLR contractor data is split across boards; no
//     single Socrata endpoint. Scaffold.
//   - Florida DBPR licensee search exposes only a per-license web UI;
//     no keyless bulk API. Scaffold.
//
// Required env vars to unblock per-state: CSLB_BULK_URL, TDLR_API_TOKEN,
// FL_DBPR_API_TOKEN (or operator-supplied alternative endpoints).
//
// Spec: Pathfinder/Pathfinder-Internal-Blueprint.md §8 priority 4.
//       Pathfinder/docs/PLAN-internal-onboarding.md §"Stage 5".

import type { SourceAdapter, SourcePollOptions, SourceEvent } from './types';
import { INTERNAL_UA } from './_internal-shared';

interface ContractorLicensePortalConfig {
  state: string;
  state_code: string;
  endpoint: string;
  app_token_env?: string;
  where?: string;
  field_map?: {
    license_number?: string;
    business_name?: string;
    issue_date?: string;
    city?: string;
    state?: string;
    classification?: string;
  };
}

// Empty by default; operator supplies portals via config.
const DEFAULT_PORTALS: ContractorLicensePortalConfig[] = [];

function pluck(row: Record<string, unknown>, key: string | undefined): string | null {
  if (!key) return null;
  const v = row[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

export const stateContractorLicensesAdapter: SourceAdapter = {
  id: 'custom-state-contractor-licenses',
  type: 'pending',
  description:
    'State contractor-license issuances aggregator. Scaffold pending per-state portal config (CSLB/TDLR/DBPR). Returns [] until configured.',

  async poll(opts: SourcePollOptions): Promise<SourceEvent[]> {
    const fetchImpl = opts.fetch ?? globalThis.fetch;
    const portals = (opts.config?.portals as ContractorLicensePortalConfig[] | undefined) ?? DEFAULT_PORTALS;
    if (portals.length === 0) {
      console.error(
        '[state-contractor-licenses] no portals configured (blocked-on-credentials: CSLB_BULK_URL / TDLR_API_TOKEN / FL_DBPR_API_TOKEN).',
      );
      return [];
    }

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

      let rows: Array<Record<string, unknown>>;
      try {
        const res = await fetchImpl(url.toString(), { headers });
        if (!res.ok) {
          console.error(`[state-contractor-licenses] ${portal.state_code} status=${res.status}`);
          continue;
        }
        rows = (await res.json()) as Array<Record<string, unknown>>;
      } catch (err) {
        console.error(`[state-contractor-licenses] ${portal.state_code} error:`,
          err instanceof Error ? err.message : err);
        continue;
      }
      for (const row of rows) {
        const fm = portal.field_map ?? {};
        const lic = pluck(row, fm.license_number);
        const business = pluck(row, fm.business_name);
        if (!lic || !business) continue;
        events.push({
          source_event_id: `state-license:${portal.state_code}:${lic}`,
          title: business,
          summary: `Contractor license · ${portal.state} · ${pluck(row, fm.classification) ?? 'classification unknown'}`,
          posted_date: pluck(row, fm.issue_date),
          raw_payload: {
            portal_state: portal.state,
            portal_state_code: portal.state_code,
            license_number: lic,
            classification: pluck(row, fm.classification),
            issue_date: pluck(row, fm.issue_date),
            row,
            internal_licensure: { state: portal.state_code, license_number: lic },
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
