// scripts/trigger-z6-news-sources.ts
//
// Sprint Z12 — manual invocation of the 5 Z6 news adapters.
//
// Adapters in scope (per spec):
//   news-engineering-record           (Engineering News-Record)
//   texas-construction-industry       (Texas Construction Industry trade press)
//   demandstar-texas                  (DemandStar TX feed)
//   houston-business-journal          (Houston Business Journal)
//   builders-exchange-texas           (Builders Exchange of Texas)
//
// Honest-failure note (2026-05-28): at the time this script was authored,
// NONE of these adapters exist in Pathfinder/lib/adapters/sources/, and
// none of the slugs appear in SOURCE_ADAPTERS in
// Pathfinder/lib/adapters/sources/index.ts. The Z6 news-source work that
// was supposed to land before Z12 has not landed in this branch's base.
//
// This script reports that situation explicitly. When the adapters do
// land, the dynamic-import block below will discover them automatically
// (no script change needed) and the per-adapter row counts will populate.
//
// Usage:
//   pnpm tsx scripts/trigger-z6-news-sources.ts

import { config as dotenvConfig } from 'dotenv';
import { SOURCE_ADAPTERS } from '../lib/adapters/sources';

dotenvConfig({ path: '.env.production.local' });
dotenvConfig({ path: '.env.local' });
dotenvConfig();

const TARGET_SLUGS: ReadonlyArray<string> = [
  'news-engineering-record',
  'texas-construction-industry',
  'demandstar-texas',
  'houston-business-journal',
  'builders-exchange-texas',
];

interface AdapterReport {
  slug: string;
  registered: boolean;
  rowsProduced: number | null;
  error: string | null;
}

async function runOne(slug: string): Promise<AdapterReport> {
  const adapter = SOURCE_ADAPTERS[slug];
  if (!adapter) {
    return {
      slug,
      registered: false,
      rowsProduced: null,
      error:
        `adapter "${slug}" is NOT registered in SOURCE_ADAPTERS — adapter file missing in lib/adapters/sources/. ` +
        'Z6 news-source work has not landed in this branch base.',
    };
  }
  try {
    const events = await adapter.poll({});
    return { slug, registered: true, rowsProduced: events.length, error: null };
  } catch (err) {
    return {
      slug,
      registered: true,
      rowsProduced: null,
      error: (err as Error).message,
    };
  }
}

async function main(): Promise<void> {
  console.log('Z6 news-source trigger');
  console.log('======================');
  console.log(`registered slugs in SOURCE_ADAPTERS: ${Object.keys(SOURCE_ADAPTERS).length}`);
  console.log('');

  const reports: AdapterReport[] = [];
  for (const slug of TARGET_SLUGS) {
    const r = await runOne(slug);
    reports.push(r);
    console.log(`--- ${slug} ---`);
    console.log(`  registered     : ${r.registered}`);
    console.log(`  rows_produced  : ${r.rowsProduced ?? '(n/a)'}`);
    if (r.error) console.log(`  error          : ${r.error}`);
    console.log('');
  }

  const registered = reports.filter((r) => r.registered);
  const produced = reports.filter((r) => (r.rowsProduced ?? 0) > 0);
  console.log('======================');
  console.log(`registered : ${registered.length}/${TARGET_SLUGS.length}`);
  console.log(`producing  : ${produced.length}/${TARGET_SLUGS.length}`);
  if (registered.length === 0) {
    console.log('VERDICT: all Z6 news adapters are missing. Acceptance criterion #6 cannot be met until they ship.');
    process.exit(2);
  }
  if (produced.length < 3) {
    console.log('VERDICT: <3 adapters produced rows. Acceptance criterion #6 not yet met.');
    process.exit(2);
  }
  console.log('VERDICT: acceptance criterion #6 met (≥3 adapters produced ≥1 row each).');
  process.exit(0);
}

void main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
