// Demo Polish UX Sprint — Gate 1C.
//
// The Tuesday 2026-05-05 Zedcor demo restricts the dashboard's branch list
// to four cities: Houston, Los Angeles, Nashville, Pittsburgh. The other
// branches in pathfinder.branches (Phoenix, Atlanta, Chicago, Seattle) are
// not removed — they continue to back projects whose nearest_branch_id was
// computed before the demo refocus. They are simply hidden from the UI so
// the operator-facing surface mirrors the demo narrative.
//
// IDs match supabase migration 0109_demo_polish_ux_demo_branches.sql plus
// the existing hou-002 row from public/seed-data/branches.json.

export const DEMO_BRANCH_IDS = ['hou-002', 'lax-006', 'nas-007', 'pit-008'] as const;

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
