// scripts/backfill-contact-resolution.ts
//
// Sprint Z7 — Backfill external contact resolution against existing
// Zedcor projects. Reads pathfinder.projects rows where:
//   - gc_metadata->>'gc_name' is non-null
//   - gc_metadata->>'gc_contact_email' IS null
// runs the three-layer resolver (Hunter → Apollo → pattern),
// persists the merged gc_metadata back to pathfinder.projects, and
// (unless --notion=false) updates the corresponding Notion page.
//
// Soft cap defaults to 100 per spec §"Soft caps"
// (DEFAULT_CONTACT_RESOLUTION_CAP_PER_RUN). Override with --cap=N or
// ZEDCOR_CONTACT_CAP env var.
//
// Both HUNTER_API_KEY and APOLLO_API_KEY are optional. When absent
// the corresponding layer skips gracefully and Layer 3 (pattern guesser)
// still runs.
//
// Usage:
//   pnpm tsx scripts/backfill-contact-resolution.ts             # full
//   pnpm tsx scripts/backfill-contact-resolution.ts --dry-run    # log only
//   pnpm tsx scripts/backfill-contact-resolution.ts --cap=20     # smoke
//   pnpm tsx scripts/backfill-contact-resolution.ts --notion=false

import { config as dotenvConfig } from 'dotenv';
import { resolveExternalContact } from '../lib/adapters/zedcor/external-contact-resolver';
import {
  findExistingProjectInNotion,
  updateProjectEnrichmentInNotion,
} from '../lib/notion/zedcor-writer';

dotenvConfig({ path: '.env.production.local' });
dotenvConfig({ path: '.env.local' });
dotenvConfig();

const ZEDCOR_ORG_ID = '6cd87740-7c72-4337-ac79-316a54242eef';
const DEFAULT_CAP = 100;

const flags = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');
const writeNotion = !flags.includes('--notion=false');
const capArg = flags.find((f) => f.startsWith('--cap='));
const envCap = process.env.ZEDCOR_CONTACT_CAP ? Number(process.env.ZEDCOR_CONTACT_CAP) : NaN;
const cap = capArg
  ? Math.max(1, Number.parseInt(capArg.slice('--cap='.length), 10) || DEFAULT_CAP)
  : Number.isFinite(envCap) && envCap > 0
    ? Math.floor(envCap)
    : DEFAULT_CAP;

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (writeNotion && !process.env.NOTION_API_TOKEN) {
  console.error('Missing NOTION_API_TOKEN — set it or pass --notion=false');
  process.exit(1);
}
if (!process.env.HUNTER_API_KEY) {
  console.warn('warning: HUNTER_API_KEY not set — Layer 1 will be skipped.');
}
if (!process.env.APOLLO_API_KEY) {
  console.warn('warning: APOLLO_API_KEY not set — Layer 2 will be skipped.');
}

// Import after env is wired so the lazy supabaseAdmin() proxy in
// lib/supabase.ts picks up the service-role creds.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    db: { schema: 'pathfinder' },
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

interface BackfillRow {
  id: string;
  source: string;
  source_id: string;
  organization_id: string;
  external_refs: Record<string, unknown> | null;
  gc_metadata: Record<string, unknown> | null;
}

async function loadCandidates(): Promise<BackfillRow[]> {
  // Postgrest filter syntax for jsonb: ->> for text extract, then `is`
  // (null) / `not.is` (not null). We pull a generous window and the
  // in-process loop respects the cap.
  const { data, error } = await supabase
    .from('projects')
    .select('id, source, source_id, organization_id, external_refs, gc_metadata')
    .eq('organization_id', ZEDCOR_ORG_ID)
    .not('gc_metadata->>gc_name', 'is', null)
    .is('gc_metadata->>gc_contact_email', null)
    .limit(Math.max(cap * 2, 500));
  if (error) throw new Error(`load candidates failed: ${error.message}`);
  return (data ?? []) as BackfillRow[];
}

async function persistMerge(
  projectId: string,
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Promise<void> {
  const merged = { ...current, ...patch };
  const { error } = await supabase
    .from('projects')
    .update({ gc_metadata: merged })
    .eq('id', projectId);
  if (error) throw new Error(`update gc_metadata failed: ${error.message}`);
}

async function main(): Promise<void> {
  const candidates = await loadCandidates();
  console.log(`backfill-contact-resolution: ${candidates.length} candidate(s); cap=${cap}; dryRun=${dryRun}`);

  let attempted = 0;
  let succeeded = 0;
  let failed = 0;
  const byLayer: Record<string, number> = { 1: 0, 2: 0, 3: 0, cache: 0 };

  for (const row of candidates) {
    if (attempted >= cap) break;
    const gcMeta = (row.gc_metadata ?? {}) as Record<string, unknown>;
    const gcName = (gcMeta.gc_name as string | null | undefined) ?? null;
    if (!gcName) continue;
    attempted += 1;

    try {
      const resolved = await resolveExternalContact(gcName, { projectId: row.id, backfill: true });
      if (!resolved.contact_email) {
        console.log(`  · ${row.source}:${row.source_id} — no contact found for "${gcName}"`);
        continue;
      }

      const layerKey =
        resolved.source === 'cache' ? 'cache' : String(resolved.layer ?? '?');
      byLayer[layerKey] = (byLayer[layerKey] ?? 0) + 1;

      const patch: Record<string, unknown> = {
        gc_contact_name: gcMeta.gc_contact_name ?? resolved.contact_name,
        gc_contact_role: gcMeta.gc_contact_role ?? resolved.contact_role,
        gc_contact_email: resolved.contact_email,
        gc_contact_phone: gcMeta.gc_contact_phone ?? resolved.contact_phone,
        contact_resolution_layer:
          resolved.source === 'cache' ? 'cache' : resolved.layer,
      };

      if (dryRun) {
        console.log(`  · DRY ${row.source}:${row.source_id} — layer ${layerKey} → ${resolved.contact_email}`);
        succeeded += 1;
        continue;
      }

      await persistMerge(row.id, gcMeta, patch);

      if (writeNotion) {
        try {
          // Re-discover the Notion page via stash, fall back to source-key lookup.
          const stashedId =
            (row.external_refs?.notion_page_id as string | undefined) ??
            (row.external_refs?.notion_page_url as string | undefined);
          const found = stashedId
            ? { notionPageId: stashedId.length === 32 || stashedId.includes('-') ? stashedId : (await findExistingProjectInNotion(row.source, row.source_id))?.notionPageId ?? null }
            : await findExistingProjectInNotion(row.source, row.source_id);
          const pageId = found?.notionPageId ?? null;
          if (pageId) {
            await updateProjectEnrichmentInNotion(pageId, {
              ...(gcMeta as Record<string, unknown>),
              ...patch,
            } as Parameters<typeof updateProjectEnrichmentInNotion>[1]);
            await new Promise((r) => setTimeout(r, 350));
          }
        } catch (notionErr) {
          console.warn(`  · notion update failed for ${row.source}:${row.source_id}: ${(notionErr as Error).message.slice(0, 200)}`);
        }
      }

      console.log(`  · ${row.source}:${row.source_id} — layer ${layerKey} → ${resolved.contact_email}`);
      succeeded += 1;
    } catch (err) {
      failed += 1;
      console.warn(`  ! ${row.source}:${row.source_id} — error: ${(err as Error).message.slice(0, 200)}`);
    }
  }

  console.log('---');
  console.log(`attempted=${attempted} succeeded=${succeeded} failed=${failed}`);
  console.log(`by_layer: hunter=${byLayer[1] ?? 0} apollo=${byLayer[2] ?? 0} pattern=${byLayer[3] ?? 0} cache=${byLayer.cache ?? 0}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
