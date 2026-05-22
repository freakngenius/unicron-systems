// scripts/seed-funder-org.ts — Funder onboarding Stage 2.
//
// Inserts the Funder organization row into pathfinder.organizations
// using the canonical architecture JSON at
// Pathfinder/Pathfinder-Funder-Architecture.json.
//
// Two execution modes:
//   --via-api  → POST to /api/organizations on the URL given by
//                PATHFINDER_BASE_URL (or http://localhost:3000 by default).
//                Requires UNICRON_INGEST_API_KEY for the x-unicron-api-key
//                header.
//   default    → direct supabaseAdmin insert (mirrors what the route does
//                internally, plus the same Inngest org.created emission so
//                the Phase 2E state machine kicks in identically).
//
// Idempotent: checks for an existing slug='funder' row first and skips
// the insert if present, printing the row id.
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 2.
// Plan: Pathfinder/docs/PLAN-funder-onboarding.md §3 Stage 2.
//
// Usage:
//   pnpm tsx scripts/seed-funder-org.ts --dry-run
//   pnpm tsx scripts/seed-funder-org.ts                    # direct insert
//   pnpm tsx scripts/seed-funder-org.ts --via-api          # POST /api/organizations
//   PATHFINDER_BASE_URL=https://<vercel-preview>.vercel.app pnpm tsx scripts/seed-funder-org.ts --via-api

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
const archPath = resolve(repoRoot, 'Pathfinder-Funder-Architecture.json');

interface FunderArchitecturePayload {
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
  const obj = JSON.parse(raw) as FunderArchitecturePayload;
  // Strip the _comment header — Zod's CreateOrgSchema accepts unknown
  // record keys but the row is cleaner without it.
  const { _comment: _ignored, ...rest } = obj;
  return rest as Record<string, unknown>;
}

const ORG_FIELDS = {
  name: 'Funder',
  slug: 'funder',
  customer_org_id: 'funder',
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

  // Idempotency: bail if Funder already exists.
  const { data: existing, error: lookupErr } = await supabase
    .from('organizations')
    .select('id,name,slug,status,created_at')
    .eq('slug', ORG_FIELDS.slug)
    .maybeSingle();
  if (lookupErr) throw new Error(`lookup failed: ${lookupErr.message}`);
  if (existing) {
    console.log(`[seed-funder] Funder already exists: id=${existing.id} status=${existing.status} created_at=${existing.created_at}`);
    return;
  }

  if (dryRun) {
    console.log('[seed-funder] DRY RUN — would insert:', {
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

  console.log(`[seed-funder] Inserted Funder row:`);
  console.log(`  id            = ${data.id}`);
  console.log(`  slug          = ${data.slug}`);
  console.log(`  status        = ${data.status}`);
  console.log(`  created_at    = ${data.created_at}`);
  console.log(`\nThe org.created Inngest event is NOT auto-emitted by the direct insert path.`);
  console.log(`Trigger Phase 2E manually if needed:`);
  console.log(`  curl -X POST $INNGEST_EVENT_URL -d '{"name":"pathfinder/org.created","data":{"organization_id":"${data.id}","slug":"funder","created_at":"${data.created_at}"}}'`);
}

async function seedViaApi(architecture: Record<string, unknown>): Promise<void> {
  const apiKey = process.env.UNICRON_INGEST_API_KEY;
  if (!apiKey) throw new Error('Missing UNICRON_INGEST_API_KEY in environment');
  const baseUrl = process.env.PATHFINDER_BASE_URL ?? 'http://localhost:3000';
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/organizations`;

  // Idempotency: GET first, bail if Funder already present.
  const list = await fetch(endpoint, {
    method: 'GET',
    headers: { 'x-unicron-api-key': apiKey },
  });
  if (!list.ok) throw new Error(`GET ${endpoint} failed: ${list.status} ${await list.text()}`);
  const orgs = (await list.json()) as Array<{ id: string; slug: string; status?: string }>;
  const existing = orgs.find((o) => o.slug === ORG_FIELDS.slug);
  if (existing) {
    console.log(`[seed-funder] Funder already exists via API: id=${existing.id} status=${existing.status ?? 'n/a'}`);
    return;
  }

  if (dryRun) {
    console.log(`[seed-funder] DRY RUN — would POST ${endpoint} with:`, {
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
  console.log(`[seed-funder] Inserted Funder row via API:`);
  console.log(`  id         = ${created.id}`);
  console.log(`  slug       = ${created.slug}`);
  console.log(`  status     = ${created.status ?? 'n/a'}`);
  console.log(`  created_at = ${created.created_at ?? 'n/a'}`);
  console.log(`\nPOST /api/organizations also emitted pathfinder/org.created — the orgCreated`);
  console.log(`Inngest function should flip status setting_up → first_run shortly.`);
}

async function main(): Promise<void> {
  const architecture = await loadArchitecture();
  console.log(`[seed-funder] Loaded architecture from ${archPath}`);
  console.log(`              vertical=${(architecture as { vertical?: string }).vertical}`);
  console.log(`              ${Object.keys(architecture).length} top-level keys`);

  if (viaApi) {
    await seedViaApi(architecture);
  } else {
    await seedViaSupabase(architecture);
  }
}

main().catch((err: unknown) => {
  console.error('[seed-funder] FAILED:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
