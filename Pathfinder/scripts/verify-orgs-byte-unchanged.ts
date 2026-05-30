/**
 * scripts/verify-orgs-byte-unchanged.ts, Stream A Foundation.
 *
 * Run AFTER applying 20260530_internal_modules_block.sql to confirm:
 *  1. Internal (#4, slug='internal') has the expected modules block.
 *  2. Zedcor (#1, 'zedcor'), Realberry (#2, 'realberry'), Funder (#3,
 *     'funder') architecture rows DO NOT carry a `modules` key.
 *
 * The migration's WHERE slug='internal' is the only physical guarantee
 * those rows are untouched; this script is the after-the-fact assertion
 * the PR description quotes.
 *
 * Usage: pnpm tsx scripts/verify-orgs-byte-unchanged.ts
 */

import { supabaseAdmin } from '@/lib/supabase';

const NON_INTERNAL = ['zedcor', 'realberry', 'funder'] as const;

const EXPECTED_INTERNAL_MODULES: Record<string, unknown> = {
  'ranked-feed': { enabled: true },
  'company-detail': { enabled: true },
  'outreach-composer': { enabled: true },
  'hubspot-sync': { enabled: true },
  'pipeline-kanban': { enabled: true },
  'filter-rail': { enabled: true },
  'warm-intro-panel': { enabled: true },
  'daily-digest': { enabled: true },
  'kpi-strip': {
    enabled: true,
    config: { metrics: ['verified_count_1d', 'active_motion_pct', 'avg_score', 'sources_live'] },
  },
  'analytics-charts': { enabled: true, config: { emphasis: 'secondary' } },
  'geo-map': { enabled: false },
};

interface OrgRow {
  slug: string;
  architecture: Record<string, unknown> | null;
}

function fail(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const client = supabaseAdmin() as unknown as { from: (t: string) => any };
  const { data, error } = (await client
    .from('organizations')
    .select('slug,architecture')
    .in('slug', ['internal', ...NON_INTERNAL])) as { data: OrgRow[] | null; error: unknown };

  if (error) fail(`supabase error: ${JSON.stringify(error)}`);
  if (!data) fail('no rows returned');

  const bySlug = new Map(data.map((r) => [r.slug, r]));

  // Internal must have the expected modules block.
  const internal = bySlug.get('internal');
  if (!internal) fail('internal org row missing');
  const internalArch = internal.architecture ?? {};
  const internalModules = (internalArch as { modules?: unknown }).modules;
  if (typeof internalModules !== 'object' || internalModules === null) {
    fail('internal architecture.modules is not an object (migration did not apply?)');
  }
  const internalActual = JSON.stringify(internalModules, sortKeys);
  const internalExpected = JSON.stringify(EXPECTED_INTERNAL_MODULES, sortKeys);
  if (internalActual !== internalExpected) {
    fail(
      `internal modules mismatch:\n  expected: ${internalExpected}\n  actual:   ${internalActual}`,
    );
  }

  // Non-Internal orgs must NOT have a modules key at all.
  for (const slug of NON_INTERNAL) {
    const row = bySlug.get(slug);
    if (!row) {
      // eslint-disable-next-line no-console
      console.warn(`WARN: ${slug} not present in pathfinder.organizations (skipped)`);
      continue;
    }
    const arch = row.architecture ?? {};
    if (Object.prototype.hasOwnProperty.call(arch, 'modules')) {
      fail(`${slug} architecture.modules unexpectedly present`);
    }
  }

  // eslint-disable-next-line no-console
  console.log('OK: internal has expected modules block; zedcor / realberry / funder have no modules key.');
}

function sortKeys(_k: string, v: unknown): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      sorted[k] = (v as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return v;
}

void main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
