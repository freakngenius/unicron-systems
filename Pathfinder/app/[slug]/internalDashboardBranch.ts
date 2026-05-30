// app/[slug]/internalDashboardBranch.ts, Stream B Dashboard.
//
// One-liner branch helper: decides whether the [slug] page should render
// via the new Internal-style InternalDashboard, or fall through to the
// existing LegacyOrgDashboard that Zedcor, Realberry, and Funder render
// today.
//
// Trigger: architecture.modules is a non-empty plain object. Stream A's
// migration introduced this block on Internal (#4, slug 'internal') only;
// the other three orgs have no modules key and therefore take the legacy
// path. The check is intentionally permissive on per-module enablement
// (an all-disabled modules block still routes to the new page so the
// renderer can decide per-slot rather than burying the decision in the
// page guard).

export function shouldUseInternalDashboard(architecture: unknown): boolean {
  if (!architecture || typeof architecture !== 'object') return false;
  const modules = (architecture as Record<string, unknown>).modules;
  if (!modules || typeof modules !== 'object' || Array.isArray(modules)) return false;
  return Object.keys(modules as Record<string, unknown>).length > 0;
}
