// Demo Polish UX Sprint — Gate 1C.
//
// The Tuesday 2026-05-05 Zedcor demo restricts the dashboard's branch list
// to four cities: Houston, Los Angeles, Nashville, Pittsburgh. The other
// branches in pathfinder.branches (Phoenix, Atlanta, Chicago, Seattle) are
// not removed — they continue to back projects whose nearest_branch_id was
// computed before the demo refocus. They are simply hidden from the UI so
// the operator-facing surface mirrors the demo narrative.
//
// IDs match the live `pathfinder.branches` row set on Supabase project
// `anfihcusvekpovcchpoh` as of 2026-05-02 (verified via execute_sql before
// this branch landed). The live rows for LA / Nashville / Pittsburgh were
// added by an earlier session under different IDs (`lax-008`, `nsh-006`,
// `pit-007`) than the ones the demo prompt used as examples; aligning here
// to the live IDs because the GeoMapper backfill has already run against
// them and projects are already attached.

export const DEMO_BRANCH_IDS = ['hou-002', 'lax-008', 'nsh-006', 'pit-007'] as const;

const DEMO_BRANCH_ID_SET: ReadonlySet<string> = new Set(DEMO_BRANCH_IDS);

/** True when the given branch id is one of the four demo branches. */
export function isDemoBranchId(id: string | null | undefined): boolean {
  return id != null && DEMO_BRANCH_ID_SET.has(id);
}

/** Filter an arbitrary array of branches (or anything with an `id` field)
 * down to the four demo branches, preserving demo-narrative order
 * (Houston → LA → Nashville → Pittsburgh) regardless of the input order. */
export function pickDemoBranches<T extends { id: string }>(branches: T[]): T[] {
  const byId = new Map(branches.map((b) => [b.id, b]));
  const out: T[] = [];
  for (const id of DEMO_BRANCH_IDS) {
    const b = byId.get(id);
    if (b) out.push(b);
  }
  return out;
}
