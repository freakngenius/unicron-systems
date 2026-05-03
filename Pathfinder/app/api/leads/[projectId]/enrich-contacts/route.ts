// app/api/leads/[projectId]/enrich-contacts/route.ts — Demo Polish UX
// Gate 11A. On-demand contact enrichment endpoint backing the Contacts
// section's "Run Now" button.
//
// Pivots on the project's source:
//   - sam.gov: extracts contacts from `raw_payload.pointOfContact` via the
//     pure `contactsFromSamGovPayload` extractor (Gate 8X-1) and wipe-and-
//     inserts into pathfinder.lead_contacts. Free, authoritative, no
//     external API spend.
//   - other sources (usaspending / harris / news): no on-demand provider
//     wired yet (Gate 8B's Clay/Apollo/Hunter orchestrator hasn't shipped).
//     Returns 200 with a clear message + zero inserts so the UI surfaces
//     "manual research required" instead of looking broken.
//
// Idempotent: per-project wipe-and-insert mirrors the backfill script's
// semantics. Re-runs replace prior contacts with current raw_payload state.
//
// Auth: relies on the upstream basic-auth gate (middleware.ts).

import { NextResponse, type NextRequest } from 'next/server';

import {
  contactsFromSamGovPayload,
  type SamGovRawPayload,
} from '@/lib/contacts/from-raw-payload';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import type { LeadContactRow } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

interface ProjectSlim {
  id: string;
  source: string;
  raw_payload: Record<string, unknown> | null;
}

interface EnrichResponseOk {
  ok: true;
  inserted: number;
  source: string;
  message: string;
}

interface EnrichResponseErr {
  ok: false;
  error: string;
  code?: string;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const projectId = decodeURIComponent(params.projectId);

  const { data: projectRow, error: projectErr } = await supabase
    .from('projects')
    .select('id, source, raw_payload')
    .eq('id', projectId)
    .maybeSingle();
  if (projectErr) {
    return NextResponse.json<EnrichResponseErr>(
      { ok: false, error: projectErr.message, code: 'project_lookup_failed' },
      { status: 500 },
    );
  }
  const project = projectRow as ProjectSlim | null;
  if (!project) {
    return NextResponse.json<EnrichResponseErr>(
      { ok: false, error: 'project not found', code: 'not_found' },
      { status: 404 },
    );
  }

  // Only sam.gov has on-demand enrichment via raw_payload extraction.
  if (project.source !== 'sam.gov') {
    return NextResponse.json<EnrichResponseOk>({
      ok: true,
      inserted: 0,
      source: project.source,
      message: providerlessMessage(project.source),
    });
  }

  if (!project.raw_payload || typeof project.raw_payload !== 'object') {
    return NextResponse.json<EnrichResponseOk>({
      ok: true,
      inserted: 0,
      source: 'sam.gov',
      message: 'sam.gov record has no raw_payload yet — re-ingest to surface contacts.',
    });
  }
  const poc = (project.raw_payload as { pointOfContact?: unknown }).pointOfContact;
  if (!Array.isArray(poc) || poc.length === 0) {
    return NextResponse.json<EnrichResponseOk>({
      ok: true,
      inserted: 0,
      source: 'sam.gov',
      message:
        'No pointOfContact published for this solicitation. Some sam.gov notices omit it; manual research required.',
    });
  }

  const contacts = contactsFromSamGovPayload(
    project.id,
    project.raw_payload as SamGovRawPayload,
  );
  if (contacts.length === 0) {
    return NextResponse.json<EnrichResponseOk>({
      ok: true,
      inserted: 0,
      source: 'sam.gov',
      message:
        'pointOfContact array present but no usable rows (missing names). Manual research required.',
    });
  }

  // Wipe-and-insert keeps idempotency parity with the backfill script.
  // Service role required for cross-RLS writes.
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      delete: () => {
        eq: (col: string, v: string) => Promise<{ error: { message: string } | null }>;
      };
      insert: (rows: unknown[]) => Promise<{ error: { message: string } | null }>;
    };
  };
  const del = await admin.from('lead_contacts').delete().eq('project_id', project.id);
  if (del.error) {
    return NextResponse.json<EnrichResponseErr>(
      { ok: false, error: `lead_contacts delete failed: ${del.error.message}`, code: 'wipe_failed' },
      { status: 500 },
    );
  }
  const ins = await admin.from('lead_contacts').insert(
    contacts as Omit<LeadContactRow, 'id' | 'enriched_at'>[],
  );
  if (ins.error) {
    return NextResponse.json<EnrichResponseErr>(
      { ok: false, error: `lead_contacts insert failed: ${ins.error.message}`, code: 'insert_failed' },
      { status: 500 },
    );
  }

  return NextResponse.json<EnrichResponseOk>({
    ok: true,
    inserted: contacts.length,
    source: 'sam.gov',
    message: `Inserted ${contacts.length} contact${contacts.length === 1 ? '' : 's'} from sam.gov pointOfContact.`,
  });
}

function providerlessMessage(source: string): string {
  switch (source) {
    case 'usaspending':
      return 'USAspending does not publish decision-maker contacts. Clay / Apollo / Hunter enrichment pending (Gate 8B).';
    case 'harris':
      return 'Harris County permits do not publish contacts. Provider enrichment pending (Gate 8B).';
    case 'news':
      return 'News articles rarely include direct contacts. Manual research required.';
    default:
      return `No on-demand provider configured for source "${source}". Manual research required.`;
  }
}
