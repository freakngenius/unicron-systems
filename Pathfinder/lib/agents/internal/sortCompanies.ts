// lib/agents/internal/sortCompanies.ts, Stream E (Internal V2 cards + companies).
//
// Pure sort helper for the Internal Companies route. Operates on the
// projected CompanyLeadView shape (lib/agents/internal/companyLeadView.ts).
// The Companies route URL carries `?sort=score|name|category|recent`.
// score is the default and the pre-Stream-E ordering.
//
// score: score desc, nulls last; verified true sorts before verified false
//        as a stable tiebreaker so the prior "verified first" floor
//        ordering is preserved.
// name: company_name asc, case-insensitive, locale-aware.
// category: service_category asc by the humanized display string already
//           on the projection, case-insensitive.
// recent: posted_date desc, nulls last (ISO date strings compare correctly
//         as strings; non-ISO is treated as nullish).

import type { CompanyLeadView } from '@/lib/agents/internal/companyLeadView';

export type SortKey = 'score' | 'name' | 'category' | 'recent';

export const SORT_KEYS: readonly SortKey[] = ['score', 'name', 'category', 'recent'] as const;

export function parseSortKey(input: string | null | undefined): SortKey {
  if (!input) return 'score';
  return (SORT_KEYS as readonly string[]).includes(input) ? (input as SortKey) : 'score';
}

export function sortCompanies(rows: readonly CompanyLeadView[], key: SortKey): CompanyLeadView[] {
  const out = rows.slice();
  switch (key) {
    case 'score':
      out.sort(byScoreDescVerifiedFirst);
      break;
    case 'name':
      out.sort(byNameAsc);
      break;
    case 'category':
      out.sort(byCategoryAsc);
      break;
    case 'recent':
      out.sort(byRecentDesc);
      break;
  }
  return out;
}

function byScoreDescVerifiedFirst(a: CompanyLeadView, b: CompanyLeadView): number {
  const av = a.verified === true ? 1 : 0;
  const bv = b.verified === true ? 1 : 0;
  if (av !== bv) return bv - av;
  const as = numericOrNeg(a.score);
  const bs = numericOrNeg(b.score);
  return bs - as;
}

function byNameAsc(a: CompanyLeadView, b: CompanyLeadView): number {
  const an = (a.company_name ?? '').toLocaleLowerCase();
  const bn = (b.company_name ?? '').toLocaleLowerCase();
  if (an === bn) return 0;
  return an < bn ? -1 : 1;
}

function byCategoryAsc(a: CompanyLeadView, b: CompanyLeadView): number {
  const ac = (a.service_category ?? '').toLocaleLowerCase();
  const bc = (b.service_category ?? '').toLocaleLowerCase();
  // Rows with no category sort to the end of an ascending list.
  if (ac === '' && bc !== '') return 1;
  if (bc === '' && ac !== '') return -1;
  if (ac === bc) return 0;
  return ac < bc ? -1 : 1;
}

function byRecentDesc(a: CompanyLeadView, b: CompanyLeadView): number {
  const ad = a.posted_date ?? '';
  const bd = b.posted_date ?? '';
  if (ad === '' && bd !== '') return 1;
  if (bd === '' && ad !== '') return -1;
  if (ad === bd) return 0;
  return ad < bd ? 1 : -1;
}

function numericOrNeg(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : Number.NEGATIVE_INFINITY;
}
