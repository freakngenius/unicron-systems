// lib/adapters/sources/trade-association-directories.ts
//
// Trade-association member-directory adapter — Internal Stage 5.
//
// Signal: a company listed in the AGC / ABC / NECA / AED member directory
// is a verified active construction-vertical operator. Membership also
// powers Internal's adjacency / warm-intro engine (Stage 6 enricher).
//
// Status: scaffold (architecture.sources[].type = 'pending' /
// 'tier-2-human-assist' per blueprint §10.3). Probed during build
// (2026-05-22):
//   - AGC America national member directory requires session cookies +
//     pagination scraping; no public API. Blocked.
//   - ABC (Associated Builders & Contractors) national directory is
//     similar: HTML scraper territory, no JSON endpoint. Blocked.
//   - NECA (National Electrical Contractors Association) member-find
//     uses a JavaScript client-side filter against an internal feed;
//     no documented JSON endpoint. Blocked.
//   - AED (Associated Equipment Distributors) member directory requires
//     login. Blocked.
//
// Required env vars to unblock per-association: AGC_DIRECTORY_TOKEN,
// ABC_DIRECTORY_TOKEN, NECA_DIRECTORY_TOKEN, AED_DIRECTORY_TOKEN, or
// operator-supplied alternative endpoints under opts.config.directories.
//
// Spec: Pathfinder/Pathfinder-Internal-Blueprint.md §8 priority 3 + §10.3.
//       Pathfinder/docs/PLAN-internal-onboarding.md §"Stage 5".

import type { SourceAdapter, SourcePollOptions, SourceEvent } from './types';
import { INTERNAL_UA } from './_internal-shared';

interface DirectoryPortalConfig {
  association: string;
  /** e.g. "AGC", "ABC", "NECA", "AED". */
  association_code: string;
  endpoint: string;
  /** Env var for any auth header (e.g. AGC_DIRECTORY_TOKEN). */
  auth_header_env?: string;
  /** Header name (e.g. Authorization, X-Api-Key). Default: Authorization. */
  auth_header_name?: string;
  field_map?: {
    member_id?: string;
    member_name?: string;
    city?: string;
    state?: string;
    member_type?: string;
  };
}

const DEFAULT_DIRECTORIES: DirectoryPortalConfig[] = [];

function pluck(row: Record<string, unknown>, key: string | undefined): string | null {
  if (!key) return null;
  const v = row[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

export const tradeAssociationDirectoriesAdapter: SourceAdapter = {
  id: 'custom-trade-association-directories',
  type: 'tier-2-human-assist',
  description:
    'AGC/ABC/NECA/AED trade-association member directories. Scaffold pending per-association auth (tier-2-human-assist per blueprint §10.3). Returns [] until configured.',

  async poll(opts: SourcePollOptions): Promise<SourceEvent[]> {
    const fetchImpl = opts.fetch ?? globalThis.fetch;
    const directories = (opts.config?.directories as DirectoryPortalConfig[] | undefined) ?? DEFAULT_DIRECTORIES;
    if (directories.length === 0) {
      console.error(
        '[trade-association-directories] no directories configured (blocked-on-credentials: AGC_DIRECTORY_TOKEN / ABC_DIRECTORY_TOKEN / NECA_DIRECTORY_TOKEN / AED_DIRECTORY_TOKEN).',
      );
      return [];
    }

    const limit = Number(opts.config?.limit ?? 50);
    const events: SourceEvent[] = [];

    for (const dir of directories) {
      const url = new URL(dir.endpoint);
      if (!url.searchParams.has('limit')) url.searchParams.set('limit', String(limit));
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'User-Agent': INTERNAL_UA,
      };
      const token = dir.auth_header_env ? process.env[dir.auth_header_env] : undefined;
      if (token) headers[dir.auth_header_name ?? 'Authorization'] = token;

      let rows: Array<Record<string, unknown>>;
      try {
        const res = await fetchImpl(url.toString(), { headers });
        if (!res.ok) {
          console.error(`[trade-association] ${dir.association_code} status=${res.status}`);
          continue;
        }
        const body = await res.json();
        rows = Array.isArray(body) ? (body as Array<Record<string, unknown>>) : ((body as { results?: Array<Record<string, unknown>> }).results ?? []);
      } catch (err) {
        console.error(`[trade-association] ${dir.association_code} error:`,
          err instanceof Error ? err.message : err);
        continue;
      }
      for (const row of rows) {
        const fm = dir.field_map ?? {};
        const id = pluck(row, fm.member_id);
        const name = pluck(row, fm.member_name);
        if (!id || !name) continue;
        events.push({
          source_event_id: `assoc:${dir.association_code}:${id}`,
          title: name,
          summary: `Member of ${dir.association} · ${pluck(row, fm.member_type) ?? 'member'}`,
          posted_date: null,
          raw_payload: {
            association: dir.association,
            association_code: dir.association_code,
            member_id: id,
            member_name: name,
            row,
            internal_association_memberships: { [dir.association_code]: true },
          },
          city: pluck(row, fm.city),
          state: pluck(row, fm.state),
          country: 'USA',
        });
      }
    }
    return events;
  },
};
