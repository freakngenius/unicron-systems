// Unit tests for the cross-pollination fetch helper
// (Pathfinder/lib/cross-poll-fetch.ts).
//
// SPEC reference: Demo Polish UX Sprint § Gate 2.

import { describe, it, expect } from 'vitest';
import { indexMatchesByLead } from '@/lib/cross-poll-fetch';
import type { CrossPollMatch } from '@/lib/types';

function m(over: Partial<CrossPollMatch> & { lead_id: string }): CrossPollMatch {
  return {
    lead_id: over.lead_id,
    customer_org_id: over.customer_org_id ?? 'zedcor',
    customer_canonical: over.customer_canonical ?? 'brasfield gorrie',
    match_layer: over.match_layer ?? 'fuzzy',
    match_confidence: over.match_confidence ?? 0.85,
    primary_branch_name: over.primary_branch_name ?? 'Jacksonville',
    active_site_count: over.active_site_count ?? 2,
    customer_lat: over.customer_lat ?? 30.25,
    customer_lon: over.customer_lon ?? -81.5,
  };
}

describe('indexMatchesByLead', () => {
  it('returns an empty map for no matches', () => {
    expect(indexMatchesByLead([]).size).toBe(0);
  });

  it('keys by lead_id and preserves a single match', () => {
    const out = indexMatchesByLead([m({ lead_id: 'a' })]);
    expect(out.size).toBe(1);
    expect(out.get('a')?.lead_id).toBe('a');
  });

  it('picks the highest-confidence match when a lead has multiple', () => {
    // Demo Polish UX § Gate 2 — when the engine surfaces both an exact
    // (1.00) and a fuzzy (0.85) match for the same project, the exact
    // match wins and drives the warm-intro line styling.
    const out = indexMatchesByLead([
      m({ lead_id: 'a', match_layer: 'fuzzy', match_confidence: 0.85 }),
      m({ lead_id: 'a', match_layer: 'exact', match_confidence: 1.0 }),
      m({ lead_id: 'a', match_layer: 'fuzzy', match_confidence: 0.73 }),
    ]);
    expect(out.size).toBe(1);
    expect(out.get('a')?.match_layer).toBe('exact');
    expect(out.get('a')?.match_confidence).toBe(1);
  });

  it('keeps independent leads independent', () => {
    const out = indexMatchesByLead([
      m({ lead_id: 'a', customer_canonical: 'brasfield gorrie' }),
      m({ lead_id: 'b', customer_canonical: 'big-d construction' }),
    ]);
    expect(out.size).toBe(2);
    expect(out.get('a')?.customer_canonical).toBe('brasfield gorrie');
    expect(out.get('b')?.customer_canonical).toBe('big-d construction');
  });
});
