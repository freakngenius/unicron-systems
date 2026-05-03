// lib/feature-flags.ts — single-source readers for env-driven feature flags.
//
// The historical pattern was inline `process.env.X === '1'` reads at call
// sites (e.g., LEAD_DETAIL_REDESIGN in app/page.tsx + app/leads/[projectId]/
// page.tsx). Newer flags route through this module so the truth table is
// inspectable from one file and tests can stub a single function.
//
// Convention: flag is OFF unless env value is exactly the string '1'.
// Anything else (undefined, '0', 'false', 'true', 'yes') reads as false.
// This matches the LEAD_DETAIL_REDESIGN reader so behavior across flags
// stays predictable.

function readBoolFlag(envName: string): boolean {
  return process.env[envName] === '1';
}

/**
 * Gate 13Y — multi-rep ownership + assignment foundation. When false (the
 * default in production through the 2026-05-05 demo), the lead-list and
 * lead-detail surfaces render with the existing single-operator model:
 * no Owner column, no filter pills (My/Team/Unassigned), no Settings →
 * Team page. The 0120 schema lives but no read path queries it.
 *
 * Flip to '1' post-demo (Wednesday 2026-05-06) to surface the multi-rep
 * UI. See docs/PLAN-gate13y-user-schema.md for the rollout sequence.
 */
export function multiRepEnabled(): boolean {
  return readBoolFlag('MULTI_REP_ENABLED');
}
