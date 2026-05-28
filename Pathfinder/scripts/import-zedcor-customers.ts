// scripts/import-zedcor-customers.ts
//
// Sprint Z8 — Customer-site importer.
//
// Reads the canonical Zedcor customer data dump under Customers/Zedcor/
// (pre-extracted into scripts/data/zedcor-customer-sites.json) and upserts
// into pathfinder.zedcor_customer_sites. After this lands, Z4's
// cross-pollination engine has 1,825 rows to match GCs against.
//
// Usage:
//   pnpm tsx Pathfinder/scripts/import-zedcor-customers.ts
//   pnpm tsx Pathfinder/scripts/import-zedcor-customers.ts --dry-run
//   pnpm tsx Pathfinder/scripts/import-zedcor-customers.ts \
//       --source /path/to/zedcor-customer-sites.json
//
// Env:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in
//   .env.production.local or .env.local
//
// Schema note: spec says pathfinder.customers; real schema is
// pathfinder.zedcor_customer_sites (see lib/adapters/zedcor/customer-importer.ts).

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  pickSourceFile,
  runCustomerImport,
  ZEDCOR_CUSTOMER_ORG_ID,
} from '../lib/adapters/zedcor/customer-importer';

dotenvConfig({ path: '.env.production.local' });
dotenvConfig({ path: '.env.local' });
dotenvConfig();

const flags = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');
const customerOrgId = flagValue(flags, '--org') ?? ZEDCOR_CUSTOMER_ORG_ID;
const sourceOverride = flagValue(flags, '--source');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  db: { schema: 'pathfinder' },
  auth: { persistSession: false, autoRefreshToken: false },
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const pathfinderRoot = resolve(__dirname, '..');

function flagValue(args: string[], name: string): string | null {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  const inline = args.find((a) => a.startsWith(`${name}=`));
  return inline ? inline.split('=', 2)[1] : null;
}

function resolveSourcePath(): string {
  if (sourceOverride) return sourceOverride;

  const candidates = [
    resolve(pathfinderRoot, 'scripts/data/zedcor-customer-sites.json'),
    resolve(pathfinderRoot, '..', 'Customers/Zedcor'),
    '/Users/kylekesterson/Documents/Claude/Unicron/Customers/Zedcor',
  ];

  for (const c of candidates) {
    if (!existsSync(c)) continue;
    const isFile = c.endsWith('.json');
    if (isFile) return c;
    const picked = pickSourceFile(c);
    if (picked) {
      if (!picked.endsWith('.json')) {
        console.warn(
          `[import] picked non-JSON source ${picked}; pre-extract to JSON via ` +
          `scripts/data/zedcor-customer-sites.json (Python openpyxl) and re-run`,
        );
      }
      return picked;
    }
  }
  throw new Error('no Zedcor customer source found; pass --source <path>');
}

async function main() {
  console.log(`▸ import-zedcor-customers${dryRun ? ' (dry-run)' : ''} org=${customerOrgId}`);
  const sourcePath = resolveSourcePath();
  console.log(`▸ source: ${sourcePath}`);

  const summary = await runCustomerImport({
    supabase,
    sourcePath,
    customerOrgId,
    dryRun,
    onProgress: (done, total) => {
      process.stdout.write(`  ${done}/${total}\r`);
    },
  });
  process.stdout.write('\n');

  console.log('▸ import summary');
  console.log(`  source rows:        ${summary.source_rows}`);
  console.log(`  rejected (no name): ${summary.rejected_no_name}`);
  console.log(`  in-batch dupes:     ${summary.in_batch_duplicates}`);
  console.log(`  prepared:           ${summary.prepared}`);
  console.log(`  with parent:        ${summary.with_parent}`);
  console.log(`  branch-tagged:      ${summary.with_branch_tag} (${pct(summary.with_branch_tag, summary.prepared)}%)`);
  console.log(`  upserted:           ${summary.upserted}${dryRun ? ' (dry-run)' : ''}`);
  if (summary.errors.length > 0) {
    console.error('▸ errors:');
    for (const e of summary.errors) console.error(`  - ${e}`);
    process.exit(2);
  }

  // Acceptance gates per SPEC §"Acceptance criteria":
  //   1. ≥1,500 customer rows imported
  //   2. ≥80% tagged with nearest_branch_id
  if (!dryRun) {
    if (summary.upserted < 1500) {
      console.error(`▸ FAIL — upserted ${summary.upserted} < 1500 (spec gate 1)`);
      process.exit(3);
    }
    const taggedPct = pct(summary.with_branch_tag, summary.prepared);
    if (taggedPct < 80) {
      console.error(`▸ FAIL — branch-tagged ${taggedPct}% < 80% (spec gate 2)`);
      process.exit(4);
    }
  }
  console.log('▸ done');
}

function pct(n: number, d: number): number {
  if (d === 0) return 0;
  return Math.round((n / d) * 1000) / 10;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
