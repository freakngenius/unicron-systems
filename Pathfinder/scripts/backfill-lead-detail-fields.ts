// scripts/backfill-lead-detail-fields.ts — Demo Polish UX Gate 3B.
//
// One-shot, idempotent. Walks every pathfinder.projects row and populates
// the new lead-detail columns from migration 0110 by parsing
// `raw_payload` per source. Spec: `Company Docs/Specs/SPEC - Lead Detail
// Enrichment.md`.
//
// Per-source extraction (raw_payload only — no LLM calls in this gate):
//
//   sam.gov →
//     owner_name             ← leaf segment of `fullParentPathName`
//     owner_type             ← 'federal_agency'
//     naics_code             ← `naicsCode`
//     location_text          ← flatten `placeOfPerformance` { city, state }
//                              (or `place_of_performance` string fallback)
//     estimated_start_date   ← `responseDeadLine` (proxy: bid window opens)
//     estimated_end_date     ← `archiveDate`     (proxy: solicitation closes)
//
//   usaspending →
//     owner_name             ← `Awarding Agency` (the issuing agency owns
//                              the contract)
//     owner_type             ← 'federal_agency'
//     prime_contractor_name  ← `Recipient Name`
//     description_long       ← `Description` (when length ≥ 60 chars)
//     location_text          ← `Place of Performance State Code`
//     (POP start/end dates are 0/183 in the corpus — leave null for
//     enrichment.)
//
//   harris →
//     permit_type            ← `permit_type`
//     permit_number          ← project source_id (after the 'harris:' prefix)
//     permit_filing_date     ← `filing_date`
//     permit_jurisdiction    ← 'Harris County, TX' (constant for this source)
//     location_text          ← `address`
//     estimated_start_date   ← `filing_date`
//
//   news →
//     (Nothing extractable beyond what the ingester already wrote into
//     summary; leave detail columns null. Enrichment fills in.)
//
// Idempotent: only writes columns that are currently null. Safe to re-run.
//
// Provenance: stamps `enriched_at = now()` and `enrichment_provider =
// 'raw_payload_only'` for any row where at least one column was filled (or
// re-confirmed empty). Re-runs that fill new columns will preserve the
// existing `enriched_at` timestamp on already-stamped rows but will update
// the provider to `'raw_payload_only'` if it was null. Sonar/Anthropic
// gates (3C) bump the provider to `'sonar'` / `'anthropic'` /
// `'sonar+anthropic'`.
//
// Usage (from inside Pathfinder/):
//   pnpm tsx scripts/backfill-lead-detail-fields.ts
//
// Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

import 'dotenv/config';

import { supabaseAdmin } from '@/lib/supabase';

interface ProjectSlim {
  id: string;
  source: string;
  source_id: string;
  summary: string | null;
  raw_payload: Record<string, unknown> | null;
  // Existing column values — we only fill nulls.
  owner_name: string | null;
  owner_type: string | null;
  prime_contractor_name: string | null;
  description_long: string | null;
  naics_code: string | null;
  location_text: string | null;
  estimated_start_date: string | null;
  estimated_end_date: string | null;
  permit_number: string | null;
  permit_jurisdiction: string | null;
  permit_filing_date: string | null;
  permit_type: string | null;
  enriched_at: string | null;
  enrichment_provider: string | null;
}

interface RowUpdate {
  owner_name?: string | null;
  owner_type?: string | null;
  prime_contractor_name?: string | null;
  description_long?: string | null;
  naics_code?: string | null;
  location_text?: string | null;
  estimated_start_date?: string | null;
  estimated_end_date?: string | null;
  permit_number?: string | null;
  permit_jurisdiction?: string | null;
  permit_filing_date?: string | null;
  permit_type?: string | null;
  enriched_at?: string;
  enrichment_provider?: string;
}

function asString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asDate(v: unknown): string | null {
  const s = asString(v);
  if (!s) return null;
  // Accept ISO date or ISO datetime; truncate datetime to YYYY-MM-DD.
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1]! : null;
}

function leafAgencyFromPath(path: unknown): string | null {
  const s = asString(path);
  if (!s) return null;
  const segments = s.split('.').map((p) => p.trim()).filter(Boolean);
  if (segments.length === 0) return null;
  return segments[segments.length - 1] ?? null;
}

interface PlaceOfPerformanceObject {
  city?: { name?: string | null } | string | null;
  state?: { name?: string | null; code?: string | null } | string | null;
  country?: { name?: string | null; code?: string | null } | string | null;
  zip?: string | null;
}

function flattenPlaceOfPerformance(raw: unknown): string | null {
  if (typeof raw === 'string') {
    return asString(raw);
  }
  if (!raw || typeof raw !== 'object') return null;
  const pop = raw as PlaceOfPerformanceObject;
  const cityField = pop.city;
  const cityName =
    typeof cityField === 'string'
      ? cityField
      : cityField && typeof cityField === 'object'
        ? cityField.name ?? null
        : null;
  const stateField = pop.state;
  const stateAbbr =
    typeof stateField === 'string'
      ? stateField
      : stateField && typeof stateField === 'object'
        ? stateField.code ?? stateField.name ?? null
        : null;
  const cityClean = asString(cityName ?? null);
  const stateClean = asString(stateAbbr ?? null);
  if (cityClean && stateClean) return `${cityClean}, ${stateClean}`;
  return cityClean ?? stateClean ?? null;
}

function permitNumberFromSourceId(sourceId: string | null): string | null {
  if (!sourceId) return null;
  // harris source rows arrive as id="harris:<source_id>"; project.source_id
  // already strips the prefix. Use it directly.
  return asString(sourceId);
}

function buildUpdate(p: ProjectSlim): RowUpdate {
  const upd: RowUpdate = {};
  const payload = (p.raw_payload ?? {}) as Record<string, unknown>;

  if (p.source === 'sam.gov') {
    if (p.owner_name == null) {
      const leaf = leafAgencyFromPath(payload['fullParentPathName']);
      const agency = asString(payload['agency']);
      const name = leaf ?? agency;
      if (name) upd.owner_name = name;
    }
    if (p.owner_type == null) upd.owner_type = 'federal_agency';
    if (p.naics_code == null) {
      const code =
        asString(payload['naicsCode']) ??
        asString(payload['naics']) ??
        null;
      if (code) upd.naics_code = code;
    }
    if (p.location_text == null) {
      const loc =
        flattenPlaceOfPerformance(payload['placeOfPerformance']) ??
        flattenPlaceOfPerformance(payload['place_of_performance']);
      if (loc) upd.location_text = loc;
    }
    if (p.estimated_start_date == null) {
      const d = asDate(payload['responseDeadLine']) ?? asDate(payload['response_due']);
      if (d) upd.estimated_start_date = d;
    }
    if (p.estimated_end_date == null) {
      const d = asDate(payload['archiveDate']);
      if (d) upd.estimated_end_date = d;
    }
  } else if (p.source === 'usaspending') {
    if (p.owner_name == null) {
      const name =
        asString(payload['Awarding Agency']) ??
        asString(payload['agency']);
      if (name) upd.owner_name = name;
    }
    if (p.owner_type == null) upd.owner_type = 'federal_agency';
    if (p.prime_contractor_name == null) {
      const name = asString(payload['Recipient Name']);
      if (name) upd.prime_contractor_name = name;
    }
    if (p.description_long == null) {
      const desc =
        asString(payload['Description']) ??
        asString(payload['description']);
      if (desc && desc.length >= 60) upd.description_long = desc;
    }
    if (p.naics_code == null) {
      const code = asString(payload['naics']);
      if (code) upd.naics_code = code;
    }
    if (p.location_text == null) {
      const loc =
        flattenPlaceOfPerformance(payload['place_of_performance']) ??
        asString(payload['Place of Performance State Code']);
      if (loc) upd.location_text = loc;
    }
    if (p.estimated_start_date == null) {
      const d =
        asDate(payload['Period of Performance Start Date']) ??
        asDate(payload['Start Date']);
      if (d) upd.estimated_start_date = d;
    }
    if (p.estimated_end_date == null) {
      const d = asDate(payload['Period of Performance Current End Date']);
      if (d) upd.estimated_end_date = d;
    }
  } else if (p.source === 'harris') {
    if (p.permit_type == null) {
      const t = asString(payload['permit_type']);
      if (t) upd.permit_type = t;
    }
    if (p.permit_number == null) {
      const n = permitNumberFromSourceId(p.source_id);
      if (n) upd.permit_number = n;
    }
    if (p.permit_filing_date == null) {
      const d = asDate(payload['filing_date']);
      if (d) upd.permit_filing_date = d;
    }
    if (p.permit_jurisdiction == null) {
      upd.permit_jurisdiction = 'Harris County, TX';
    }
    if (p.location_text == null) {
      const addr = asString(payload['address']);
      if (addr) upd.location_text = addr;
    }
    if (p.estimated_start_date == null) {
      const d = asDate(payload['filing_date']);
      if (d) upd.estimated_start_date = d;
    }
  }
  // news: nothing reliably extractable beyond summary; no-op.

  if (Object.keys(upd).length > 0 || p.enriched_at == null) {
    if (p.enriched_at == null) upd.enriched_at = new Date().toISOString();
    if (p.enrichment_provider == null) upd.enrichment_provider = 'raw_payload_only';
  }
  return upd;
}

async function loadProjects(
  admin: ReturnType<typeof supabaseAdmin>,
): Promise<ProjectSlim[]> {
  const res = await (
    admin.from('projects') as unknown as {
      select: (cols: string) => Promise<{
        data: ProjectSlim[] | null;
        error: { message: string } | null;
      }>;
    }
  ).select(
    'id, source, source_id, summary, raw_payload, ' +
      'owner_name, owner_type, prime_contractor_name, description_long, ' +
      'naics_code, location_text, estimated_start_date, estimated_end_date, ' +
      'permit_number, permit_jurisdiction, permit_filing_date, permit_type, ' +
      'enriched_at, enrichment_provider',
  );
  if (res.error) {
    throw new Error(`failed to load projects: ${res.error.message}`);
  }
  return res.data ?? [];
}

async function persistUpdate(
  admin: ReturnType<typeof supabaseAdmin>,
  projectId: string,
  upd: RowUpdate,
): Promise<void> {
  if (Object.keys(upd).length === 0) return;
  const res = await (
    admin.from('projects') as unknown as {
      update: (v: RowUpdate) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .update(upd)
    .eq('id', projectId);
  if (res.error) {
    throw new Error(`update failed for ${projectId}: ${res.error.message}`);
  }
}

interface CountSnapshot {
  total: number;
  with_owner_name: number;
  with_owner_type: number;
  with_prime_contractor: number;
  with_description_long: number;
  with_naics_code: number;
  with_location_text: number;
  with_estimated_start_date: number;
  with_estimated_end_date: number;
  with_permit_number: number;
  with_permit_jurisdiction: number;
  with_permit_filing_date: number;
  with_permit_type: number;
  with_enrichment_provider: number;
}

function countSnapshot(rows: ProjectSlim[]): CountSnapshot {
  const c: CountSnapshot = {
    total: rows.length,
    with_owner_name: 0,
    with_owner_type: 0,
    with_prime_contractor: 0,
    with_description_long: 0,
    with_naics_code: 0,
    with_location_text: 0,
    with_estimated_start_date: 0,
    with_estimated_end_date: 0,
    with_permit_number: 0,
    with_permit_jurisdiction: 0,
    with_permit_filing_date: 0,
    with_permit_type: 0,
    with_enrichment_provider: 0,
  };
  for (const r of rows) {
    if (r.owner_name) c.with_owner_name++;
    if (r.owner_type) c.with_owner_type++;
    if (r.prime_contractor_name) c.with_prime_contractor++;
    if (r.description_long) c.with_description_long++;
    if (r.naics_code) c.with_naics_code++;
    if (r.location_text) c.with_location_text++;
    if (r.estimated_start_date) c.with_estimated_start_date++;
    if (r.estimated_end_date) c.with_estimated_end_date++;
    if (r.permit_number) c.with_permit_number++;
    if (r.permit_jurisdiction) c.with_permit_jurisdiction++;
    if (r.permit_filing_date) c.with_permit_filing_date++;
    if (r.permit_type) c.with_permit_type++;
    if (r.enrichment_provider) c.with_enrichment_provider++;
  }
  return c;
}

function logSnapshot(label: string, c: CountSnapshot): void {
  const fields: Array<keyof CountSnapshot> = [
    'with_owner_name',
    'with_owner_type',
    'with_prime_contractor',
    'with_description_long',
    'with_naics_code',
    'with_location_text',
    'with_estimated_start_date',
    'with_estimated_end_date',
    'with_permit_number',
    'with_permit_jurisdiction',
    'with_permit_filing_date',
    'with_permit_type',
    'with_enrichment_provider',
  ];
  console.log(`\n[backfill-lead-detail] ${label} (n=${c.total}):`);
  for (const f of fields) {
    const padded = String(f).padEnd(28, ' ');
    console.log(`  ${padded} ${c[f]}`);
  }
}

async function main(): Promise<void> {
  const admin = supabaseAdmin();
  const before = await loadProjects(admin);
  logSnapshot('BEFORE', countSnapshot(before));

  let updated = 0;
  let skipped = 0;
  for (const p of before) {
    const upd = buildUpdate(p);
    const writeKeys = Object.keys(upd).filter(
      (k) => k !== 'enriched_at' && k !== 'enrichment_provider',
    );
    if (writeKeys.length === 0 && p.enriched_at != null) {
      skipped++;
      continue;
    }
    await persistUpdate(admin, p.id, upd);
    updated++;
  }

  console.log(
    `\n[backfill-lead-detail] writes: updated=${updated} skipped=${skipped}`,
  );

  const after = await loadProjects(admin);
  logSnapshot('AFTER', countSnapshot(after));
}

main().catch((err: unknown) => {
  console.error('[backfill-lead-detail] fatal', err);
  process.exit(1);
});
