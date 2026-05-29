// scripts/cleanup-z14-1-layer3-catchalls.ts
//
// Contact Cleanup — apply the shipped Z14.1 catchall predicate
// (rejectLowQualityCatchall in lib/adapters/zedcor/email-pattern-guesser.ts)
// retroactively to every Zedcor-org Layer-3 row written before the
// extension shipped. Rows the predicate rejects have their
// gc_contact_email/gc_contact_name/gc_contact_role cleared; gc_name
// and contact_resolution_layer are preserved so a re-run of Z7 Layer 3
// (with the predicate active) can retry without losing identity.
//
// REUSES the shipped predicate. No parallel filter implementation lives
// here — every rejection is delegated to rejectLowQualityCatchall so the
// definition of "bad" stays single-sourced.
//
// Usage:
//   pnpm tsx scripts/cleanup-z14-1-layer3-catchalls.ts           # dry-run report
//   pnpm tsx scripts/cleanup-z14-1-layer3-catchalls.ts --execute # apply NULLs
//   pnpm tsx scripts/cleanup-z14-1-layer3-catchalls.ts --rerun-z7
//     # re-run Layer 3 across cleared rows with the active filter
//
// Spec: /Users/kylekesterson/Documents/Claude/Unicron/Specs/SPEC-zedcor-contact-cleanup.md
// Snapshot: scripts/_evidence/contact-cleanup-layer3/before-snapshot.json

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  rejectLowQualityCatchall,
  type PatternSkip,
} from '../lib/adapters/zedcor/email-pattern-guesser';
import { resolveExternalContact } from '../lib/adapters/zedcor/external-contact-resolver';

dotenvConfig({ path: '.env.production.local' });
dotenvConfig({ path: '.env.local' });
dotenvConfig();

const ZEDCOR_ORG_ID = '6cd87740-7c72-4337-ac79-316a54242eef';

const flags = process.argv.slice(2);
const execute = flags.includes('--execute');
const rerun = flags.includes('--rerun-z7');

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    db: { schema: 'pathfinder' },
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

interface Layer3Row {
  id: string;
  gc_metadata: Record<string, unknown> | null;
}

async function loadLayer3Rows(): Promise<Layer3Row[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, gc_metadata')
    .eq('organization_id', ZEDCOR_ORG_ID)
    .eq('gc_metadata->>contact_resolution_layer', '3');
  if (error) throw new Error(`load Layer-3 rows failed: ${error.message}`);
  return (data ?? []) as Layer3Row[];
}

interface Verdict {
  id: string;
  gcName: string | null;
  email: string | null;
  rejectReason: PatternSkip['reason'] | null;
}

function evaluateRows(rows: Layer3Row[]): Verdict[] {
  const verdicts: Verdict[] = [];
  for (const row of rows) {
    const meta = (row.gc_metadata ?? {}) as Record<string, unknown>;
    const email = (meta.gc_contact_email as string | null | undefined) ?? null;
    const gcName = (meta.gc_name as string | null | undefined) ?? null;
    if (!email) {
      verdicts.push({ id: row.id, gcName, email: null, rejectReason: null });
      continue;
    }
    const reason = rejectLowQualityCatchall(email, gcName ? { companyName: gcName } : {});
    verdicts.push({ id: row.id, gcName, email, rejectReason: reason });
  }
  return verdicts;
}

async function nullifyRow(row: Layer3Row, reason: PatternSkip['reason']): Promise<void> {
  const meta = (row.gc_metadata ?? {}) as Record<string, unknown>;
  const prior = (meta.z14_1_cleanup as Record<string, unknown> | undefined) ?? null;
  const merged: Record<string, unknown> = {
    ...meta,
    gc_contact_email: null,
    gc_contact_name: null,
    gc_contact_role: null,
    // gc_contact_phone is already null for every observed Layer-3 row;
    // we still null-coerce it to handle any straggler that might have
    // had a pattern-derived phone written by a future codepath.
    gc_contact_phone: null,
    z14_1_cleanup: {
      cleared_at: new Date().toISOString(),
      cleared_email: meta.gc_contact_email ?? null,
      cleared_reason: reason,
      // Preserve any prior cleanup marker so the audit trail survives
      // multiple cleanup passes.
      previous: prior,
    },
  };
  const { error } = await supabase
    .from('projects')
    .update({ gc_metadata: merged })
    .eq('id', row.id);
  if (error) throw new Error(`update ${row.id} failed: ${error.message}`);
}

async function rerunLayer3(rows: Layer3Row[]): Promise<void> {
  console.log(`\nrerun: invoking Z7 resolver for ${rows.length} cleared row(s)`);
  let regenerated = 0;
  let stillNull = 0;
  let rejected = 0;
  for (const row of rows) {
    const meta = (row.gc_metadata ?? {}) as Record<string, unknown>;
    const gcName = (meta.gc_name as string | null | undefined) ?? null;
    if (!gcName) continue;
    const resolved = await resolveExternalContact(gcName, { projectId: row.id, contactCleanup: true });
    if (!resolved.contact_email) {
      stillNull += 1;
      console.log(`  · ${row.id} — "${gcName}" → no email`);
      continue;
    }
    // Apply the predicate to the regenerated email as a self-check.
    // The shipped predicate is the same one used inside guessContactEmail,
    // but this defends against any future bypass path.
    const verdict = rejectLowQualityCatchall(resolved.contact_email, { companyName: gcName });
    if (verdict) {
      rejected += 1;
      console.log(`  ! ${row.id} — "${gcName}" regenerated ${resolved.contact_email} but predicate rejects (${verdict})`);
      continue;
    }
    regenerated += 1;
    const patch: Record<string, unknown> = {
      ...meta,
      gc_contact_email: resolved.contact_email,
      gc_contact_name: resolved.contact_name ?? meta.gc_contact_name ?? null,
      gc_contact_role: resolved.contact_role ?? meta.gc_contact_role ?? null,
      contact_resolution_layer:
        resolved.source === 'cache' ? 'cache' : resolved.layer,
    };
    if (execute) {
      const { error } = await supabase
        .from('projects')
        .update({ gc_metadata: patch })
        .eq('id', row.id);
      if (error) console.warn(`  ! write back ${row.id}: ${error.message}`);
    }
    console.log(`  · ${row.id} — "${gcName}" → ${resolved.contact_email} (layer ${resolved.layer})`);
  }
  console.log(`rerun summary: regenerated=${regenerated} stillNull=${stillNull} predicateRejected=${rejected}`);
}

async function main(): Promise<void> {
  const rows = await loadLayer3Rows();
  const verdicts = evaluateRows(rows);
  const toNull = verdicts.filter((v) => v.email !== null && v.rejectReason !== null);
  const kept = verdicts.filter((v) => v.email !== null && v.rejectReason === null);
  const alreadyNull = verdicts.filter((v) => v.email === null);

  console.log(`Layer-3 Zedcor rows: ${rows.length}`);
  console.log(`  to NULL (predicate rejects): ${toNull.length}`);
  console.log(`  keep (predicate accepts):    ${kept.length}`);
  console.log(`  already null:                ${alreadyNull.length}`);
  console.log('');

  if (toNull.length > 0) {
    console.log('--- TO NULL ---');
    const byReason: Record<string, number> = {};
    for (const v of toNull) {
      console.log(`  ${(v.rejectReason ?? '?').padEnd(40)} ${(v.gcName ?? '').slice(0, 50).padEnd(50)} ${v.email}`);
      byReason[v.rejectReason ?? '?'] = (byReason[v.rejectReason ?? '?'] ?? 0) + 1;
    }
    console.log('  by_reason:', JSON.stringify(byReason));
  }

  if (!execute) {
    console.log('\n(dry-run) pass --execute to apply NULLs');
    if (rerun) console.log('(dry-run) --rerun-z7 ignored without --execute');
    return;
  }

  console.log('\n--- APPLYING NULLS ---');
  let nulled = 0;
  let failed = 0;
  const idsCleared: string[] = [];
  for (const v of toNull) {
    const row = rows.find((r) => r.id === v.id);
    if (!row || !v.rejectReason) continue;
    try {
      await nullifyRow(row, v.rejectReason);
      nulled += 1;
      idsCleared.push(v.id);
    } catch (err) {
      failed += 1;
      console.warn(`  ! ${v.id}: ${(err as Error).message}`);
    }
  }
  console.log(`nulled=${nulled} failed=${failed}`);

  if (rerun && nulled > 0) {
    // Reload the freshly-cleared rows so rerun sees current state.
    const { data, error } = await supabase
      .from('projects')
      .select('id, gc_metadata')
      .in('id', idsCleared);
    if (error) {
      console.error(`reload for rerun failed: ${error.message}`);
      return;
    }
    await rerunLayer3((data ?? []) as Layer3Row[]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
