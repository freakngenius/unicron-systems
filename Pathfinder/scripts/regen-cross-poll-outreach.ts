// scripts/regen-cross-poll-outreach.ts — Demo Polish § 5 follow-up.
//
//
// Regenerate the email-channel outreach draft for every project that has
// at least one row in `pathfinder.lead_cross_pollination`, using the new
// drafter input shape that includes the engine match metadata. The
// regenerated draft must open with an explicit reference to the existing
// Zedcor relationship; otherwise the demo's "warm intro" claim has no
// payoff in the surface the customer reads.
//
// Behavior:
//   - Pulls every distinct lead_id from pathfinder.lead_cross_pollination
//   - Loads the project + branch + warm-customer + cross-poll rows
//   - Calls draftOutreachWithRetry (Sonnet) with the new crossPollination
//     payload populated
//   - Inserts a fresh email/linkedin/voicemail row set into outreach_drafts
//     (does NOT delete prior rows — we keep the audit trail; the lead-
//     detail page reads ORDER BY draft_at DESC LIMIT 1, so the new row
//     wins)
//   - Logs a one-line summary per lead and, when --print-emails is set,
//     dumps the email body so a human can quality-check before merge
//
// Usage:
//   pnpm tsx scripts/regen-cross-poll-outreach.ts --print-emails
//   pnpm tsx scripts/regen-cross-poll-outreach.ts --limit 5 --dry-run
//
// Cost: ~5 leads × 1-3 attempts × Sonnet ≈ $0.10-$0.30. Safe under the $5
// regeneration cap in the dispatch prompt.

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  buildInsertRows,
  draftOutreachWithRetry,
  extractContactFromRawPayload,
  type CrossPollinationContext,
  type OutreachDraftInsertRow,
} from '../lib/outreach';
import type { Branch, Customer, Project } from '../lib/types';

dotenvConfig({ path: '.env.production.local' });
dotenvConfig({ path: '.env.local' });
dotenvConfig();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const flags = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');
const printEmails = flags.includes('--print-emails');
const exactOnly = flags.includes('--exact-only');
const limitFlagIdx = flags.indexOf('--limit');
const limit = limitFlagIdx >= 0 ? parseInt(flags[limitFlagIdx + 1] ?? '0', 10) || 0 : 0;

const supabase = createClient(url, serviceKey, {
  db: { schema: 'pathfinder' },
  auth: { persistSession: false, autoRefreshToken: false },
});

interface CrossPollRow {
  lead_id: string;
  customer_canonical: string;
  match_layer: string;
  match_confidence: number | string;
  matched_field: string;
  primary_branch_name: string | null;
  branch_count: number | null;
  active_site_count: number | null;
  most_recent_site_date: string | null;
  national_account: boolean | null;
}

async function main() {
  console.log(`regen-cross-poll-outreach: dryRun=${dryRun} printEmails=${printEmails} limit=${limit}`);

  // 1. Load every cross-pollination row, group by lead.
  const { data: rows, error } = await supabase
    .from('lead_cross_pollination')
    .select(
      'lead_id, customer_canonical, match_layer, match_confidence, matched_field, primary_branch_name, branch_count, active_site_count, most_recent_site_date, national_account',
    )
    .order('most_recent_site_date', { ascending: false, nullsFirst: false });
  if (error) {
    console.error('failed to load lead_cross_pollination:', error.message);
    process.exit(1);
  }
  const byLead = new Map<string, CrossPollRow[]>();
  for (const row of (rows ?? []) as CrossPollRow[]) {
    if (exactOnly && row.match_layer !== 'exact') continue;
    const existing = byLead.get(row.lead_id) ?? [];
    existing.push(row);
    byLead.set(row.lead_id, existing);
  }
  let leadIds = Array.from(byLead.keys());
  if (limit > 0) leadIds = leadIds.slice(0, limit);
  console.log(`found ${byLead.size} leads with cross-pollination matches; processing ${leadIds.length}`);

  // 2. Load lookup tables (branches, customers) once.
  const [branchesRes, customersRes] = await Promise.all([
    supabase.from('branches').select('*'),
    supabase.from('customers').select('*'),
  ]);
  if (branchesRes.error || customersRes.error) {
    console.error('lookup load failed:', branchesRes.error?.message ?? customersRes.error?.message);
    process.exit(1);
  }
  const branches = (branchesRes.data ?? []) as Branch[];
  const customers = (customersRes.data ?? []) as Customer[];
  const branchById = new Map(branches.map((b) => [b.id, b]));
  const customerById = new Map(customers.map((c) => [c.id, c]));

  let drafted = 0;
  let failed = 0;
  let skipped = 0;
  const emailSamples: Array<{ leadId: string; title: string; subject: string; body: string }> = [];

  for (const leadId of leadIds) {
    const matches = (byLead.get(leadId) ?? []).slice(0, 3);

    // 3. Hydrate the project.
    const { data: projData, error: projErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', leadId)
      .maybeSingle();
    if (projErr || !projData) {
      console.error(`[${leadId}] project read failed: ${projErr?.message ?? 'not found'}`);
      skipped++;
      continue;
    }
    const project = projData as Project;
    const branch = project.nearest_branch_id ? branchById.get(project.nearest_branch_id) ?? null : null;
    const warmCustomer = project.warm_for_customer_id ? customerById.get(project.warm_for_customer_id) ?? null : null;
    const contact = extractContactFromRawPayload(project.raw_payload as Record<string, unknown> | null);

    const crossPollContext: CrossPollinationContext[] = matches.map((m) => ({
      customer_canonical: m.customer_canonical,
      match_layer: m.match_layer,
      match_confidence: typeof m.match_confidence === 'string' ? parseFloat(m.match_confidence) : m.match_confidence,
      matched_field: m.matched_field,
      primary_branch_name: m.primary_branch_name,
      branch_count: m.branch_count ?? 0,
      active_site_count: m.active_site_count ?? 0,
      most_recent_site_date: m.most_recent_site_date,
      national_account: m.national_account ?? false,
    }));

    const allowedCustomerNames = [
      ...customers.map((c) => c.name),
      ...crossPollContext.map((m) => m.customer_canonical),
    ];

    if (dryRun) {
      console.log(`[${leadId}] DRY: would draft for "${project.title.slice(0, 60)}" with ${matches.length} match(es): ${crossPollContext.map((m) => m.customer_canonical).join(', ')}`);
      continue;
    }

    try {
      const result = await draftOutreachWithRetry(
        {
          project: {
            id: project.id,
            title: project.title,
            summary: project.summary,
            project_value: project.project_value,
            project_stage: project.project_stage,
            distance_miles: project.distance_miles,
            rationale: project.rationale,
            outreach_hook: project.outreach_hook,
            lat: project.lat,
            lon: project.lon,
            raw_payload: project.raw_payload,
            warm_for_customer_id: project.warm_for_customer_id,
            nearest_branch_id: project.nearest_branch_id,
          },
          branch: branch ? { id: branch.id, name: branch.name, code: branch.code, region: branch.region } : null,
          warmCustomer: warmCustomer ? { id: warmCustomer.id, name: warmCustomer.name } : null,
          contact,
          crossPollination: crossPollContext,
        },
        { allowedCustomerNames },
      );

      const insertRows: OutreachDraftInsertRow[] = buildInsertRows({
        project: { id: project.id, warm_for_customer_id: project.warm_for_customer_id },
        contact,
        bundle: result.bundle,
        warnings: result.warnings,
        modelUsed: result.modelUsed,
      });

      const insertRes = await supabase.from('outreach_drafts').insert(insertRows);
      if (insertRes.error) {
        console.error(`[${leadId}] insert failed: ${insertRes.error.message}`);
        failed++;
        continue;
      }
      drafted++;
      console.log(
        `[${leadId}] drafted (attempts=${result.attempts}, warnings=${result.warnings.join(',') || 'none'}) → ${crossPollContext[0].customer_canonical}`,
      );
      emailSamples.push({
        leadId,
        title: project.title,
        subject: result.bundle.email.subject,
        body: result.bundle.email.body,
      });
    } catch (err) {
      console.error(`[${leadId}] draft failed: ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\n=== regen complete: drafted=${drafted}, failed=${failed}, skipped=${skipped} ===`);
  if (printEmails && emailSamples.length > 0) {
    console.log('\n=== Email samples ===');
    for (const s of emailSamples) {
      console.log(`\n— ${s.leadId} — ${s.title.slice(0, 80)}\nSubject: ${s.subject}\n\n${s.body}\n---`);
    }
  }
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
