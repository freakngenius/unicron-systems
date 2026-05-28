// lib/adapters/sources/tx-bid-tabs.ts
//
// Sprint Z12 — TxDOT Bid Tabulations adapter.
//
// SOURCE CONTEXT (2026-05-28):
//   data.texas.gov publishes TxDOT historical bid tabulations as a
//   Socrata SODA dataset at /resource/de7b-7dna.json. Each row is one
//   bid_item line per (project_id × vendor), so a single TxDOT project
//   has many rows. The apparent low bidder is the row where
//     bid_rank_sequence_number = '1'   AND   low_bidder_flag = true
//   Per project, that bidder is the prime contractor for the awarded
//   contract. Engineer's Estimate rows (bid_rank_sequence_number='EE')
//   are filtered out.
//
//   This adapter is the canonical writer for the tx-bid-tabs source.
//   Three rows are already in pathfinder.projects from the prior
//   Perplexity-Computer flow; Z12 migration
//   20260528_zedcor_z12_tx_bid_tabs_awarded.sql patches their
//   prime_contractor_name + raw_payload.awarded_to. This adapter ensures
//   future poll cycles populate the field on insert.

import type { SourceAdapter, SourceEvent } from './types';
import { buildEvent, parseLooseDate, pfFetchJson } from './_zedcor-shared';

const SODA_DATASET = 'de7b-7dna';
const SODA_BASE = `https://data.texas.gov/resource/${SODA_DATASET}.json`;

// Pull the most recent let-date window. Socrata defaults to 1000 rows
// without an explicit $limit; we ask for 5000 to cover ~30 days of TxDOT
// statewide letting volume while still fitting in a single request.
const SODA_QUERY = `?$where=project_actual_let_date>'2025-01-01' AND bid_rank_sequence_number='1' AND low_bidder_flag=true&$order=project_actual_let_date DESC&$limit=5000`;

interface SodaRow {
  project_id?: string | null;
  project_name?: string | null;
  county?: string | null;
  highway?: string | null;
  district_division?: string | null;
  project_classification?: string | null;
  project_type?: string | null;
  project_actual_let_date?: string | null;
  vendor_name?: string | null;
  bid_total_amount?: string | null;
  bid_rank_sequence_number?: string | null;
  low_bidder_flag?: boolean | null;
}

function dedupePerProject(rows: SodaRow[]): SodaRow[] {
  const byProject = new Map<string, SodaRow>();
  for (const r of rows) {
    const pid = (r.project_id ?? '').trim();
    if (!pid) continue;
    if (!byProject.has(pid)) byProject.set(pid, r);
  }
  return Array.from(byProject.values());
}

function makeTitle(r: SodaRow): string {
  const name = (r.project_name ?? '').trim().replace(/\s+/g, ' ');
  const county = (r.county ?? '').trim();
  const district = (r.district_division ?? '').trim();
  if (name && county) return `${name} — ${county} County (TxDOT ${district || ''})`.trim();
  if (name) return name;
  return `TxDOT bid tab ${r.project_id ?? 'unknown'}`;
}

export const txBidTabsAdapter: SourceAdapter = {
  id: 'tx-bid-tabs',
  type: 'registered',
  description:
    'TxDOT Bid Tabulations (data.texas.gov/de7b-7dna SODA). Emits one row per project with the apparent low bidder as prime_contractor_name + raw_payload.awarded_to.',

  async poll(opts): Promise<SourceEvent[]> {
    let rows: SodaRow[];
    try {
      rows = await pfFetchJson<SodaRow[]>(`${SODA_BASE}${SODA_QUERY}`, {
        fetchImpl: opts.fetch,
      });
    } catch {
      return [];
    }
    if (!Array.isArray(rows) || rows.length === 0) return [];

    const oneRowPerProject = dedupePerProject(rows);

    return oneRowPerProject.flatMap((r) => {
      const pid = (r.project_id ?? '').trim();
      if (!pid) return [] as SourceEvent[];
      const vendor = (r.vendor_name ?? '').trim();
      const awardedAmount = (() => {
        const raw = (r.bid_total_amount ?? '').trim();
        if (!raw) return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
      })();
      const letDate = parseLooseDate(r.project_actual_let_date ?? null);
      return [
        buildEvent({
          source_event_id: pid,
          title: makeTitle(r),
          summary: null,
          posted_date: letDate,
          raw_payload: {
            agency: 'Texas Department of Transportation',
            county: r.county ? `${r.county} County` : null,
            state: 'TX',
            district: r.district_division ?? null,
            highway: r.highway ?? null,
            source_url: `https://data.texas.gov/dataset/Bid-Tabulations/${SODA_DATASET}`,
            source_authority: 'state_dot',
            project_stage: 'mobilization',
            buy_window_open: true,
            estimated_value: awardedAmount,
            prime_contractor_name: vendor || null,
            awarded_to: vendor || null,
            awarded_amount: awardedAmount,
            awarded_source: 'data.texas.gov/de7b-7dna bid_rank=1',
            project_actual_let_date: letDate,
            project_type: r.project_type ?? null,
            project_classification: r.project_classification ?? null,
          },
        }),
      ];
    });
  },
};
