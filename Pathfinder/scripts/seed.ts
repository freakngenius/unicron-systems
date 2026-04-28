// Seeds the `pathfinder.branches` and `pathfinder.customers` tables from the JSON files
// in public/seed-data. Idempotent — uses upsert on the primary key.
//
// Usage: pnpm seed
//
// Reads SUPABASE_SERVICE_ROLE_KEY from .env.local; service-role bypasses RLS for the writes.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { PathfinderDatabase, Branch, Customer } from '../lib/types';

dotenvConfig({ path: '.env.local' });
dotenvConfig(); // fallback to .env if .env.local missing

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient<PathfinderDatabase, 'pathfinder'>(url, serviceKey, {
  db: { schema: 'pathfinder' },
  auth: { persistSession: false, autoRefreshToken: false },
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

async function loadJson<T>(rel: string): Promise<T> {
  const buf = await readFile(resolve(root, rel), 'utf-8');
  return JSON.parse(buf) as T;
}

async function main() {
  console.log('▸ loading seed data');
  const branches = await loadJson<Branch[]>('public/seed-data/branches.json');
  const customers = await loadJson<Customer[]>('public/seed-data/customers.json');

  console.log(`▸ upserting ${branches.length} branches`);
  const { error: bErr } = await supabase.from('branches').upsert(branches, { onConflict: 'id' });
  if (bErr) throw bErr;

  console.log(`▸ upserting ${customers.length} customers`);
  const { error: cErr } = await supabase.from('customers').upsert(customers, { onConflict: 'id' });
  if (cErr) throw cErr;

  const { count: bCount } = await supabase.from('branches').select('*', { count: 'exact', head: true });
  const { count: cCount } = await supabase.from('customers').select('*', { count: 'exact', head: true });

  console.log(`✓ pathfinder.branches: ${bCount} rows`);
  console.log(`✓ pathfinder.customers: ${cCount} rows`);
}

main().catch((e) => {
  console.error('seed failed:', e);
  process.exit(1);
});
