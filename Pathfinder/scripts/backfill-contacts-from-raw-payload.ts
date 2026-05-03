// scripts/backfill-contacts-from-raw-payload.ts — Demo Polish UX Gate 8X-1.
//
// Pivot: Gate 8 originally specced paid contact-enrichment providers (Clay /
// Apollo / Hunter). We discovered the data is already in
// pathfinder.projects.raw_payload — sam.gov ingests every solicitation with
// a `pointOfContact` array containing the contracting officer + secondary
// contact (name, email, phone). 99% have email; 50% have phone. Free,
// authoritative, no API spend.
//
// This script walks every sam.gov project with a non-null pointOfContact
// array and inserts one row per contact into pathfinder.lead_contacts.
//
// Idempotency: per-project wipe-and-insert. Re-runs are safe — they replace
// the prior backfill with the current raw_payload contents.
//
// Usage (from inside Pathfinder/):
//   pnpm tsx scripts/backfill-contacts-from-raw-payload.ts
//
// Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

import 'dotenv/config';

import { supabaseAdmin } from '@/lib/supabase';
import {
  contactsFromSamGovPayload,
  type SamGovPointOfContact,
  type SamGovRawPayload,
} from '@/lib/contacts/from-raw-payload';
import type { LeadContactRow } from '@/lib/types';

interface ProjectSlim {
  id: string;
  source: string;
  raw_payload: SamGovRawPayload | Record<string, unknown> | null;
}

async function loadCandidates(): Promise<ProjectSlim[]> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, v: string) => {
          not: (
            col: string,
            op: string,
            v: unknown,
          ) => Promise<{ data: ProjectSlim[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const { data, error } = await sb
    .from('projects')
    .select('id, source, raw_payload')
    .eq('source', 'sam.gov')
    .not('raw_payload->pointOfContact', 'is', null);
  if (error) throw new Error(`projects select failed: ${error.message}`);
  return data ?? [];
}

async function wipeAndInsert(
  projectId: string,
  contacts: Omit<LeadContactRow, 'id' | 'enriched_at'>[],
): Promise<{ inserted: number }> {
  if (contacts.length === 0) return { inserted: 0 };
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      delete: () => {
        eq: (col: string, v: string) => Promise<{ error: { message: string } | null }>;
      };
      insert: (rows: unknown[]) => Promise<{ error: { message: string } | null }>;
    };
  };
  const del = await sb.from('lead_contacts').delete().eq('project_id', projectId);
  if (del.error) {
    throw new Error(`lead_contacts delete failed: ${del.error.message}`);
  }
  const ins = await sb.from('lead_contacts').insert(contacts);
  if (ins.error) {
    throw new Error(`lead_contacts insert failed: ${ins.error.message}`);
  }
  return { inserted: contacts.length };
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const candidates = await loadCandidates();
  console.log(`Found ${candidates.length} sam.gov projects with pointOfContact.`);

  let projectsTouched = 0;
  let projectsSkipped = 0;
  let totalInserted = 0;
  let withEmail = 0;
  let withPhone = 0;
  const errors: string[] = [];

  for (const project of candidates) {
    if (!project.raw_payload || typeof project.raw_payload !== 'object') {
      projectsSkipped += 1;
      continue;
    }
    // The not('is', null) filter doesn't distinguish array from scalar; some
    // rows have pointOfContact as an object instead of an array (rare). Skip
    // those — the extractor expects an array.
    const poc = (project.raw_payload as { pointOfContact?: unknown }).pointOfContact;
    if (!Array.isArray(poc)) {
      projectsSkipped += 1;
      continue;
    }
    const contacts = contactsFromSamGovPayload(
      project.id,
      project.raw_payload as SamGovRawPayload,
    );
    try {
      const out = await wipeAndInsert(project.id, contacts);
      projectsTouched += 1;
      totalInserted += out.inserted;
      withEmail += contacts.filter((c) => c.email).length;
      withPhone += contacts.filter((c) => c.phone).length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${project.id}: ${msg}`);
    }
  }

  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('');
  console.log('Backfill complete.');
  console.log(`  duration         : ${seconds}s`);
  console.log(`  projects touched : ${projectsTouched}`);
  console.log(`  projects skipped : ${projectsSkipped}`);
  console.log(`  contacts inserted: ${totalInserted}`);
  console.log(`  with email       : ${withEmail}`);
  console.log(`  with phone       : ${withPhone}`);
  if (errors.length > 0) {
    console.log(`  errors           : ${errors.length}`);
    for (const e of errors.slice(0, 20)) console.log(`    - ${e}`);
  }
}

void main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

// Re-export the extractor's types for the tsx runner so the file imports
// stay grouped.
export type { SamGovPointOfContact };
