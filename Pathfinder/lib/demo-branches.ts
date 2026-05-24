// Demo Polish UX Sprint — Gate 1C; Gate 17A Houston-only narrowing.
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
//
// Gate 17A — Houston-only mode. Setting NEXT_PUBLIC_DEMO_HOUSTON_ONLY=1
// narrows the dashboard surface to a single branch (Houston / hou-002) so
// the demo opens with one pin + one coverage circle + one BRANCHES row.
// Reversible: flip back to 0 (or unset) post-demo to restore the four-city
// surface. The flag only affects UI surfaces — DEMO_BRANCH_IDS stays at
// four cities so the ingestor / cross-pollination / lead-detail backends
// that already wrote rows for all four still resolve correctly.

export const DEMO_BRANCH_IDS = ['hou-002', 'lax-008', 'nsh-006', 'pit-007'] as const;

/** Houston-only subset (Gate 17A). Single-element list so the dashboard's
 * branch surface narrows to one pin / one BRANCHES row when the demo
 * env flag is set. */
export const HOUSTON_ONLY_DEMO_BRANCH_IDS = ['hou-002'] as const;

const DEMO_BRANCH_ID_SET: ReadonlySet<string> = new Set(DEMO_BRANCH_IDS);

/** True when the dashboard is running in Gate 17A Houston-only mode. The
 * flag is `NEXT_PUBLIC_*` so client components (BranchDock, map markers)
 * and server boundaries (page route) read the same value without an extra
 * prop hop. Reversible — unset / 0 restores the four-city surface. */
export function isHoustonOnlyMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_HOUSTON_ONLY === '1';
}

/** True when the dashboard should show ALL branches as-is (no demo
 * filtering). Used for Zedcor full-network view at zedcor.unicron.systems.
 * When set, `pickDemoBranches` returns its input unchanged so all 34
 * Zedcor branches render on the map and in the dock. */
export function isZedcorFullNetworkMode(): boolean {
  return process.env.NEXT_PUBLIC_ZEDCOR_FULL_NETWORK === '1';
}

/** The active demo-branch id list for the dashboard surface. Returns the
 * Houston-only subset when the env flag is set, otherwise the canonical
 * four-city list. Order is demo-narrative (Houston first either way). */
export function getActiveDemoBranchIds(): readonly string[] {
  return isHoustonOnlyMode() ? HOUSTON_ONLY_DEMO_BRANCH_IDS : DEMO_BRANCH_IDS;
}

/** True when the given branch id is one of the four demo branches. The
 * canonical four-city set — backend code that needs to know whether a
 * branch row is part of the demo set should use this. UI-surface code
 * that needs to narrow to Houston-only should use `getActiveDemoBranchIds`
 * + a per-call set. */
export function isDemoBranchId(id: string | null | undefined): boolean {
  return id != null && DEMO_BRANCH_ID_SET.has(id);
}

/** Filter an arbitrary array of branches (or anything with an `id` field)
 * down to the active demo branches, preserving demo-narrative order
 * (Houston → LA → Nashville → Pittsburgh, or Houston only when Gate 17A
 * mode is active) regardless of the input order. */
export function pickDemoBranches<T extends { id: string }>(branches: T[]): T[] {
  // Zedcor full-network mode: render every branch as-is (no demo filter).
  if (isZedcorFullNetworkMode()) return branches;

  const byId = new Map(branches.map((b) => [b.id, b]));
  const out: T[] = [];
  for (const id of getActiveDemoBranchIds()) {
    const b = byId.get(id);
    if (b) out.push(b);
  }
  return out;
}
