// services/source-onboarder/tools/search-adapters.ts
//
// Looks up existing adapter rows in pathfinder.source_adapters. The agent
// calls this before generating new code per SPEC §6 step 3 ("Reuse existing
// adapters when possible. Search the adapter library first.").

import { supabaseAdmin } from '@/lib/supabase';
import type { AdapterKind } from '@/lib/adapters/types';

export interface SourceAdapterRecord {
  id: string;
  kind: AdapterKind;
  name: string;
  version: string;
  generated_code: string | null;
  test_pass_count: number;
  test_fail_count: number;
  promoted_trusted: boolean;
}

export async function searchSourceAdapters(query: { kind?: AdapterKind; nameContains?: string }): Promise<SourceAdapterRecord[]> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq?: (col: string, val: string) => {
          ilike?: (col: string, val: string) => Promise<{ data: SourceAdapterRecord[] | null; error: unknown }>;
        } & Promise<{ data: SourceAdapterRecord[] | null; error: unknown }>;
        ilike?: (col: string, val: string) => Promise<{ data: SourceAdapterRecord[] | null; error: unknown }>;
      } & Promise<{ data: SourceAdapterRecord[] | null; error: unknown }>;
    };
  };
  // Simple two-step query — Supabase JS client supports chained eq + ilike,
  // but the loose-typed cast here keeps the call site readable.
  const baseQuery = sb.from('source_adapters').select('id,kind,name,version,generated_code,test_pass_count,test_fail_count,promoted_trusted');
  let result;
  if (query.kind && query.nameContains) {
    const eqStep = baseQuery.eq?.('kind', query.kind);
    if (!eqStep) return [];
    result = await (eqStep.ilike?.('name', `%${query.nameContains}%`) ?? eqStep);
  } else if (query.kind) {
    result = await baseQuery.eq?.('kind', query.kind);
  } else if (query.nameContains) {
    result = await baseQuery.ilike?.('name', `%${query.nameContains}%`);
  } else {
    result = await baseQuery;
  }
  if (!result || result.error) return [];
  return result.data ?? [];
}

export async function findDefaultAdapterForKind(kind: AdapterKind): Promise<SourceAdapterRecord | null> {
  const rows = await searchSourceAdapters({ kind, nameContains: `${kind}-default` });
  return rows[0] ?? null;
}
