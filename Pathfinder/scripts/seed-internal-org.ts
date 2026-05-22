// scripts/seed-internal-org.ts — Internal onboarding Stage 2.
//
// Inserts the Unicron Internal organization row into pathfinder.organizations
// using the canonical architecture JSON at
// Pathfinder/Pathfinder-Internal-Architecture.json.
//
// Two execution modes:
//   --via-api  → POST to /api/organizations on the URL given by
//                PATHFINDER_BASE_URL (or http://localhost:3000/pathfinder
//                by default; basePath is /pathfinder per next.config.js).
//                Requires UNICRON_INGEST_API_KEY for the x-unicron-api-key
//                header. This path emits `pathfinder/org.created` so the
//                Phase 2E orgCreated Inngest function flips status from
//                setting_up to first_run.
//   default    → direct supabaseAdmin insert (mirrors what the route does
//                internally without the Inngest emit; preferred only when
//                a dev server is not available).
//
// Idempotent: checks for an existing slug='internal' row first and skips
// the insert if present, printing the row id.
//
// Spec: Pathfinder/Pathfinder-Internal-Blueprint.md §9 Stage 2.
// Plan: Pathfinder/docs/PLAN-internal-onboarding.md Stage 2.
//
// Usage:
//   pnpm tsx scripts/seed-internal-org.ts --dry-run
//   pnpm tsx scripts/seed-internal-org.ts --via-api          # POST /api/organizations
//   PATHFINDER_BASE_URL=http://localhost:3000/pathfinder pnpm tsx scripts/seed-internal-org.ts --via-api
//   pnpm tsx scripts/seed-internal-org.ts                    # direct insert (no Inngest)

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenvConfig({ path: '.env.production.local' });
dotenvConfig({ path: '.env.local' });
dotenvConfig();

const flags = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');
const viaApi = flags.includes('--via-api');

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const archPath = resolve(repoRoot, 'Pathfinder-Internal-Architecture.json');

interface InternalArchitecturePayload {
  vertical: string;
  lead_unit: unknown;
  pipeline: unknown;
  scoring: unknown;
  geography: unknown;
  sources: unknown;
  outreach: unknown;
  vocabulary: unknown;
  branding: { display_name: string; accent_color?: string | null; logo_url?: string | null };
  compliance: string[];
  integrations: string[];
  business_summary?: unknown;
  ui_plan?: unknown;
  _comment?: string;
}

async function loadArchitecture(): Promise<Record<string, unknown>> {
  const raw = await readFile(archPath, 'utf-8');
  const obj = JSON.parse(raw) as InternalArchitecturePayload;
  // Strip the _comment header — Zod's CreateOrgSchema accepts unknown
  // record keys but the row is cleaner without it.
  const { _comment: _ignored, ...rest } = obj;
  return rest as Record<string, unknown>;
}

const ORG_FIELDS = {
  name: 'Unicron Internal',
  slug: 'internal',
  customer_org_id: 'unicron-internal',
} as const;

async function seedViaSupabase(architecture: Record<string, unknown>): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  }

  const supabase = createClient(url, serviceKey, {
    db: { schema: 'pathfinder' },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Idempotency: bail if Internal already exists.
  const { data: existing, error: lookupErr } = await supabase
    .from('organizations')
    .select('id,name,slug,status,created_at')
    .eq('slug', ORG_FIELDS.slug)
    .maybeSingle();
  if (lookupErr) throw new Error(`lookup failed: ${lookupErr.message}`);
  if (existing) {
    console.log(`[seed-internal] Internal already exists: id=${existing.id} status=${existing.status} created_at=${existing.created_at}`);
    return;
  }

  if (dryRun) {
    console.log('[seed-internal] DRY RUN — would insert:', {
      ...ORG_FIELDS,
      architecture_keys: Object.keys(architecture),
      architecture_size_bytes: JSON.stringify(architecture).length,
    });
    return;
  }

  const { data, error } = await supabase
    .from('organizations')
    .insert({ ...ORG_FIELDS, architecture })
    .select()
    .single();
  if (error) throw new Error(`insert failed: ${error.message} (code=${(error as { code?: string }).code ?? 'n/a'})`);

  console.log(`[seed-internal] Inserted Internal row:`);
  console.log(`  id            = ${data.id}`);
  console.log(`  slug          = ${data.slug}`);
  console.log(`  status        = ${data.status}`);
  console.log(`  created_at    = ${data.created_at}`);
  console.log(`\nThe org.created Inngest event is NOT auto-emitted by the direct insert path.`);
  console.log(`Use --via-api against a running dev server to trigger Phase 2E.`);
}

async function seedViaApi(architecture: Record<string, unknown>): Promise<void> {
  const apiKey = process.env.UNICRON_INGEST_API_KEY;
  if (!apiKey) throw new Error('Missing UNICRON_INGEST_API_KEY in environment');
  // Default basePath is /pathfinder per next.config.js.
  const baseUrl = process.env.PATHFINDER_BASE_URL ?? 'http://localhost:3000/pathfinder';
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/organizations`;

  // Idempotency: GET first, bail if Internal already present.
  const list = await fetch(endpoint, {
    method: 'GET',
    headers: { 'x-unicron-api-key': apiKey },
  });
  if (!list.ok) throw new Error(`GET ${endpoint} failed: ${list.status} ${await list.text()}`);
  const orgs = (await list.json()) as Array<{ id: string; slug: string; status?: string }>;
  const existing = orgs.find((o) => o.slug === ORG_FIELDS.slug);
  if (existing) {
    console.log(`[seed-internal] Internal already exists via API: id=${existing.id} status=${existing.status ?? 'n/a'}`);
    return;
  }

  if (dryRun) {
    console.log(`[seed-internal] DRY RUN — would POST ${endpoint} with:`, {
      ...ORG_FIELDS,
      architecture_keys: Object.keys(architecture),
      architecture_size_bytes: JSON.stringify(architecture).length,
    });
    return;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-unicron-api-key': apiKey,
    },
    body: JSON.stringify({ ...ORG_FIELDS, architecture }),
  });
  if (!res.ok) throw new Error(`POST ${endpoint} failed: ${res.status} ${await res.text()}`);
  const created = (await res.json()) as { id: string; slug: string; status?: string; created_at?: string };
  console.log(`[seed-internal] Inserted Internal row via API:`);
  console.log(`  id         = ${created.id}`);
  console.log(`  slug       = ${created.slug}`);
  console.log(`  status     = ${created.status ?? 'n/a'}`);
  console.log(`  created_at = ${created.created_at ?? 'n/a'}`);
  console.log(`\nPOST /api/organizations also emitted pathfinder/org.created — the orgCreated`);
  console.log(`Inngest function should flip status setting_up → first_run shortly.`);
}

async function main(): Promise<void> {
  const architecture = await loadArchitecture();
  console.log(`[seed-internal] Loaded architecture from ${archPath}`);
  console.log(`              vertical=${(architecture as { vertical?: string }).vertical}`);
  console.log(`              ${Object.keys(architecture).length} top-level keys`);

  if (viaApi) {
    await seedViaApi(architecture);
  } else {
    await seedViaSupabase(architecture);
  }
}

main().catch((err: unknown) => {
  console.error('[seed-internal] FAILED:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
