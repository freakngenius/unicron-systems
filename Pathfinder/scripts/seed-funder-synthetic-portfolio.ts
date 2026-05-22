// scripts/seed-funder-synthetic-portfolio.ts
//
// Funder onboarding Stage 4 — seed a clearly tagged synthetic portfolio.
//
// Funder's adjacency-mapper relies on a "what orgs has Funder already
// funded?" list to find warm-intro / co-author ties. Real grantee data
// is a follow-up swap (Build-Spec §5). For Stage 4 we seed a synthetic
// portfolio so the adjacency-mapper has something to operate on.
//
// Synthetic rows:
//   - source = 'synthetic-portfolio'
//   - title = grantee org name
//   - raw_payload.is_synthetic = true
//   - raw_payload.synthetic_tier = 'portfolio'
//   - organization_id = Funder's UUID
//   - status keeps them out of the ranker queue (score = 0, rationale set)
//
// Idempotent: checks for existing rows by id before insert.
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 4
//       + §5 Out of scope ("Real Funder grantee-portfolio data").

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.production.local' });
dotenvConfig({ path: '.env.local' });
dotenvConfig();

import { createClient } from '@supabase/supabase-js';

const dryRun = process.argv.includes('--dry-run');

interface SyntheticGrantee {
  name: string;
  thesis: string;
  founder_affiliation: string;
  city: string;
  state: string;
}

const SYNTHETIC_PORTFOLIO: SyntheticGrantee[] = [
  { name: 'Alignment Research Center (synthetic)', thesis: 'ai-safety', founder_affiliation: 'OpenAI alignment team', city: 'Berkeley', state: 'CA' },
  { name: 'Frontier Model Forum Lab (synthetic)', thesis: 'ai-governance', founder_affiliation: 'Anthropic policy', city: 'San Francisco', state: 'CA' },
  { name: 'METR Evaluations (synthetic)', thesis: 'ai-safety', founder_affiliation: 'DeepMind alignment', city: 'Berkeley', state: 'CA' },
  { name: 'Apollo Research East (synthetic)', thesis: 'ai-safety', founder_affiliation: 'MIT CSAIL', city: 'Cambridge', state: 'MA' },
  { name: 'SecureBio Initiative (synthetic)', thesis: 'biosecurity', founder_affiliation: 'Johns Hopkins Center for Health Security', city: 'Washington', state: 'DC' },
  { name: 'New Atlantis Bio (synthetic)', thesis: 'biosecurity', founder_affiliation: 'Broad Institute', city: 'Cambridge', state: 'MA' },
  { name: 'Centennial Longevity (synthetic)', thesis: 'longevity', founder_affiliation: 'Stanford Aging Lab', city: 'Palo Alto', state: 'CA' },
  { name: 'Civic Forecast (synthetic)', thesis: 'epistemics', founder_affiliation: 'Princeton CS', city: 'New York', state: 'NY' },
  { name: 'Open Election Tech (synthetic)', thesis: 'civic-infrastructure', founder_affiliation: 'CMU Heinz College', city: 'Washington', state: 'DC' },
  { name: 'London Forecasting House (synthetic)', thesis: 'epistemics', founder_affiliation: 'Oxford FHI alumni', city: 'London', state: '' },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');

  const sb = createClient(url, key, { db: { schema: 'pathfinder' }, auth: { persistSession: false } });

  const { data: org, error: lookupErr } = await sb
    .from('organizations')
    .select('id, slug')
    .eq('slug', 'funder')
    .maybeSingle();
  if (lookupErr || !org) throw new Error(`Funder org not found: ${lookupErr?.message ?? 'missing'}`);
  const funderOrgId = (org as { id: string }).id;
  console.log(`[seed-portfolio] Funder org id: ${funderOrgId}`);

  const rows = SYNTHETIC_PORTFOLIO.map((g, i) => ({
    id: `synthetic-portfolio:funder:${i}`,
    source: 'synthetic-portfolio',
    source_id: `synthetic-portfolio:funder:${i}`,
    title: g.name,
    summary: `Synthetic portfolio grantee for Funder adjacency-mapper. Thesis: ${g.thesis}. Founder prior: ${g.founder_affiliation}.`,
    project_value: null,
    project_stage: 'funded',
    posted_date: null,
    raw_payload: {
      is_synthetic: true,
      synthetic_tier: 'portfolio',
      thesis: g.thesis,
      founder_affiliation: g.founder_affiliation,
      city: g.city,
      state: g.state,
    },
    country: g.state ? 'USA' : null,
    organization_id: funderOrgId,
    // Score=0 keeps the ranker queue (which pulls score IS NULL) from picking them up.
    score: 0,
    rationale: 'Synthetic portfolio seed; not in scoring queue.',
  }));

  if (dryRun) {
    console.log(`[seed-portfolio] DRY RUN — would upsert ${rows.length} synthetic grantee rows:`);
    rows.forEach((r) => console.log(`  ${r.id}  ${r.title}`));
    return;
  }

  // Idempotent: check which ids already exist.
  const { data: existing } = await sb.from('projects').select('id').in('id', rows.map((r) => r.id));
  const existingIds = new Set((existing ?? []).map((r) => (r as { id: string }).id));
  const fresh = rows.filter((r) => !existingIds.has(r.id));
  if (fresh.length === 0) {
    console.log('[seed-portfolio] All 10 synthetic portfolio rows already present; nothing to insert.');
    return;
  }

  const { error: insertErr } = await sb.from('projects').insert(fresh);
  if (insertErr) throw new Error(`insert failed: ${insertErr.message}`);
  console.log(`[seed-portfolio] Inserted ${fresh.length} synthetic portfolio rows. (${rows.length - fresh.length} already present.)`);
}

main().catch((err: unknown) => {
  console.error('[seed-portfolio] FAILED:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
