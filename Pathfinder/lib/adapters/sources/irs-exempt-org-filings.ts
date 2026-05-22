// lib/adapters/sources/irs-exempt-org-filings.ts
//
// IRS Exempt Organizations adapter — Funder onboarding Stage 3.
//
// The IRS publishes the Business Master File (BMF) as a bulk CSV per
// region (https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf).
// There is no realtime JSON API; the BMF is the canonical determination-letter
// dataset. As of 2026-05, the IRS Tax Exempt Organization Search (TEOS)
// frontend that previously offered a spot-search API
// (apps.irs.gov/app/eos/api/Search) is gated behind an Akamai bot filter
// that 403s any non-browser client — confirmed 2026-05-22.
//
// Adapter shape (2026-05-22 post-merge follow-up):
//   - bulk mode only: when opts.config.bulk_url is set, streams the CSV,
//     filters to orgs determined in the lookback window, and emits one
//     SourceEvent per row.
//   - default (no bulk_url): returns [] and registers as 'pending' so the
//     org dashboard shows "1 source pending — operator config required."
//
// Canonical bulk URLs (operator picks one per cycle, or rotates):
//   - https://www.irs.gov/pub/irs-soi/eo1.csv  (Northeast / Mid-Atlantic)
//   - https://www.irs.gov/pub/irs-soi/eo2.csv  (Midwest / South)
//   - https://www.irs.gov/pub/irs-soi/eo3.csv  (West)
//   - https://www.irs.gov/pub/irs-soi/eo4.csv  (International)
// Each CSV is ~30-100MB. Recommend running this adapter on a long-cadence
// cron (monthly) when wired into the per-org dispatch.
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 3.

import type { SourceAdapter, SourcePollOptions, SourceEvent } from './types';

// BMF CSV column positions (zero-indexed) per the IRS schema doc:
//   0  EIN
//   1  NAME
//   2  ICO
//   3  STREET
//   4  CITY
//   5  STATE
//   6  ZIP
//   7  GROUP
//   8  SUBSECTION  (3 = 501(c)(3))
//   9  AFFILIATION
//  10  CLASSIFICATION
//  11  RULING (yyyymm)
//  12  DEDUCTIBILITY
//  13  FOUNDATION
//  14  ACTIVITY
//  15  ORGANIZATION
//  16  STATUS
//  17  TAX_PERIOD
//  18  ASSET_CD
//  19  INCOME_CD
//  20  FILING_REQ_CD
//  21  PF_FILING_REQ_CD
//  22  ACCT_PD
//  23  ASSET_AMT
//  24  INCOME_AMT
//  25  REVENUE_AMT
//  26  NTEE_CD
//  27  SORT_NAME
const COL_EIN = 0;
const COL_NAME = 1;
const COL_CITY = 4;
const COL_STATE = 5;
const COL_SUBSECTION = 8;
const COL_RULING = 11;
const COL_NTEE_CD = 26;

function parseCsvLine(line: string): string[] {
  // BMF CSVs use simple comma separation with quoted fields. We tolerate
  // unquoted fields and embedded commas inside quoted fields.
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export const irsExemptOrgFilingsAdapter: SourceAdapter = {
  id: 'custom-irs-exempt-org-filings',
  type: 'pending', // pending until operator configures config.bulk_url
  description:
    'IRS Exempt Organizations BMF — bulk CSV at irs.gov/pub/irs-soi/eo[1-4].csv. Operator-configured bulk_url required (TEOS spot-search frontend is bot-gated as of 2026-05).',

  async poll(opts: SourcePollOptions): Promise<SourceEvent[]> {
    const fetchImpl = opts.fetch ?? globalThis.fetch;
    const bulkUrl = (opts.config?.bulk_url as string | undefined) ?? undefined;
    if (!bulkUrl) return []; // pending: no bulk URL configured

    const lookbackYears = (opts.config?.lookback_years as number | undefined) ?? 3;
    const minRulingYyyymm = (new Date().getUTCFullYear() - lookbackYears) * 100 + 1;
    const limit = (opts.config?.row_limit as number | undefined) ?? 5000;

    let res: Response;
    try {
      res = await fetchImpl(bulkUrl, {
        headers: { Accept: 'text/csv', 'User-Agent': 'Pathfinder/Funder (kyle@freakngenius.com)' },
      });
    } catch (err) {
      console.error(`[irs-eo] bulk fetch network error:`, err instanceof Error ? err.message : err);
      return [];
    }
    if (!res.ok) {
      console.error(`[irs-eo] bulk fetch failed: ${res.status}`);
      return [];
    }

    const text = await res.text();
    const lines = text.split(/\r?\n/);
    // BMF CSVs include a header row; skip it.
    const startIdx = lines[0]?.startsWith('EIN') ? 1 : 0;

    const events: SourceEvent[] = [];
    const seen = new Set<string>();
    for (let i = startIdx; i < lines.length && events.length < limit; i += 1) {
      const line = lines[i];
      if (!line) continue;
      const cols = parseCsvLine(line);
      const ein = cols[COL_EIN]?.trim();
      if (!ein) continue;
      if (cols[COL_SUBSECTION]?.trim() !== '03') continue; // 501(c)(3) only
      const ruling = Number(cols[COL_RULING]?.trim() ?? '0');
      if (!Number.isFinite(ruling) || ruling < minRulingYyyymm) continue;

      const id = `irs-eo:${ein}`;
      if (seen.has(id)) continue;
      seen.add(id);

      const rulingYear = Math.floor(ruling / 100);
      const rulingMonth = String(ruling % 100).padStart(2, '0');
      events.push({
        source_event_id: id,
        title: cols[COL_NAME]?.trim() || `EIN ${ein}`,
        summary: `IRS determination ${rulingMonth}/${rulingYear} · NTEE ${cols[COL_NTEE_CD]?.trim() || '?'}`,
        posted_date: `${rulingYear}-${rulingMonth}-01T00:00:00Z`,
        raw_payload: {
          ein,
          name: cols[COL_NAME]?.trim() ?? null,
          ntee_cd: cols[COL_NTEE_CD]?.trim() ?? null,
          ruling: cols[COL_RULING]?.trim() ?? null,
          subsection: cols[COL_SUBSECTION]?.trim() ?? null,
          bulk_url: bulkUrl,
        },
        city: cols[COL_CITY]?.trim() || null,
        state: cols[COL_STATE]?.trim() || null,
        country: 'USA',
      });
    }
    return events;
  },
};
