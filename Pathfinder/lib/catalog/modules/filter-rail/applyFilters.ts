// lib/catalog/modules/filter-rail/applyFilters.ts, Stream B Dashboard.
// Stream F extension: optional `q` free-text search runs after the
// dropdown narrowing via lib/catalog/modules/smart-search/applySearch.
//
// Importing applySearchQuery at the top is safe because the helper is a
// pure function with no module-level side effects. A previous draft used
// a runtime require() to keep the import lazy; that broke the ESM build
// (module: esnext, see tsconfig.json), so we use a static ES import.

import { applySearchQuery } from '@/lib/catalog/modules/smart-search/applySearch';

//
// Pure narrowing helper shared by Module 1 (ranked-feed) and Module 2
// (filter-rail). Works against the raw Project row shape so the filter
// matches on the schema enum slug (e.g. 'active-outbound') rather than
// the humanized label ('Active outbound') that the company view emits.
//
// Field-to-source map for Internal:
//   service_category     -> raw_payload.internal_enrichment.service_category
//   sales_motion         -> raw_payload.internal_enrichment.sales_motion
//   federal_registration -> raw_payload.internal_federal_registration
//   source               -> top-level Project.source column
//
// An empty-string filter value means "no narrowing for this field". A
// missing nested field counts as a non-match (the row is excluded when the
// filter is set), which matches the user expectation that "filter by
// active-outbound" should not surface rows where sales_motion is absent.

export interface RawCompanyRow {
  id: string;
  organization_id: string;
  score: number | null;
  title: string | null;
  source: string | null;
  raw_payload: Record<string, unknown> | null;
}

export interface InternalFilters {
  service_category?: string;
  sales_motion?: string;
  federal_registration?: string;
  source?: string;
  // Stream F smart search: optional free-text token AND across company name,
  // service category (slug + label), sales motion (slug + label), hq state
  // (name or abbrev), and stringified score. Empty / missing means no
  // narrowing. The match runs after the dropdown narrowing below.
  q?: string;
}

function readNestedString(row: RawCompanyRow, path: readonly string[]): string | null {
  let cur: unknown = row.raw_payload;
  for (const seg of path) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === 'string' && cur.trim() !== '' ? cur : null;
}

export function applyFilters(rows: readonly RawCompanyRow[], filters: InternalFilters): RawCompanyRow[] {
  const sc = filters.service_category?.trim() ?? '';
  const sm = filters.sales_motion?.trim() ?? '';
  const fr = filters.federal_registration?.trim() ?? '';
  const src = filters.source?.trim() ?? '';
  const q = filters.q?.trim() ?? '';

  let pass: RawCompanyRow[];
  if (!sc && !sm && !fr && !src) {
    pass = [...rows];
  } else {
    pass = rows.filter((row) => {
      if (sc) {
        const v = readNestedString(row, ['internal_enrichment', 'service_category']);
        if (v !== sc) return false;
      }
      if (sm) {
        const v = readNestedString(row, ['internal_enrichment', 'sales_motion']);
        if (v !== sm) return false;
      }
      if (fr) {
        const v = readNestedString(row, ['internal_federal_registration']);
        if (v !== fr) return false;
      }
      if (src) {
        if ((row.source ?? '') !== src) return false;
      }
      return true;
    });
  }

  if (q === '') return pass;
  return applySearchQuery(pass, q);
}
