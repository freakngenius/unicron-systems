// lib/agents/internal/companyLeadView.ts
//
// Projects a pathfinder.projects row into the flat shape the Internal
// company detail view renders. Mirror of lib/agents/funder/leadView.ts,
// but Internal-shaped (no founders, no raise stage, no thesis area).
//
// Reads `raw_payload.internal_enrichment` (enricher output) and
// `raw_payload.internal_geo` (Stage 5 geo agent). Falls back to
// qualifier-time signals (internal_inferred_service_category,
// internal_sales_motion_signal, internal_federal_registration,
// internal_association_hint) and the bare title when enrichment has
// not yet filled in.
//
// Used by app/[slug]/leads/[projectId]/page.tsx via the org-aware
// branch on architecture.lead_unit.name === 'company'. The Funder
// projection in lib/agents/funder/leadView.ts is untouched.

import type { Project } from '@/lib/types';

export interface InternalContact {
  name: string;
  title?: string;
  email?: string;
  linkedin_url?: string;
}

export interface CompanyLeadView {
  id: string;
  // Header
  company_name: string;
  score: number | null;
  verified: boolean | null;
  // Primary
  service_category: string | null;
  sales_motion: string | null;
  footprint: string | null;
  // Snapshot
  hq_location: string | null;
  employee_count: number | null;
  federal_registration: string | null;
  associations: string[];
  source: string | null;
  posted_date: string | null;
  // Outreach
  warm_intro: string | null;
  first_step: string | null;
  // Detail
  rationale: string | null;
  brief: string | null;
  citations: Array<{ url: string; title?: string }>;
  // Contact card
  website: string | null;
  linkedin: string | null;
  contacts: InternalContact[];
}

const SERVICE_LABELS: Record<string, string> = {
  'equipment-rental': 'Equipment rental',
  'temp-fence': 'Temp fence',
  'temp-power-sanitation': 'Temp power / sanitation',
  'traffic-control': 'Traffic control',
  'modular-site-offices': 'Modular site offices',
  'commercial-roofing': 'Commercial roofing',
  'industrial-cleaning': 'Industrial cleaning',
  'waste-management': 'Waste management',
  'crane-rental': 'Crane rental',
  'jobsite-connectivity': 'Jobsite connectivity',
  'site-safety-services': 'Site safety services',
  'general-contractor': 'General contractor',
  'specialty-trade': 'Specialty trade',
  other: 'Other',
};

const SALES_MOTION_LABELS: Record<string, string> = {
  'active-outbound': 'Active outbound',
  'hiring-bd': 'Hiring BD',
  'inbound-only': 'Inbound only',
  unknown: 'Unknown',
};

const FEDERAL_REG_LABELS: Record<string, string> = {
  'sam-registered': 'SAM registered',
  'federal-awardee': 'Federal awardee',
  both: 'SAM + awardee',
  none: 'None',
};

function readString(obj: Record<string, unknown> | undefined, key: string): string | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function readNumber(obj: Record<string, unknown> | undefined, key: string): number | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function readStringArray(obj: Record<string, unknown> | undefined, key: string): string[] {
  if (!obj) return [];
  const v = obj[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
}

function readContacts(obj: Record<string, unknown> | undefined): InternalContact[] {
  if (!obj) return [];
  const v = obj.contacts;
  if (!Array.isArray(v)) return [];
  return v
    .map((c) => {
      if (!c || typeof c !== 'object') return null;
      const r = c as Record<string, unknown>;
      const name = typeof r.name === 'string' ? r.name.trim() : '';
      if (!name) return null;
      return {
        name,
        title: typeof r.title === 'string' ? r.title : undefined,
        email: typeof r.email === 'string' ? r.email : undefined,
        linkedin_url: typeof r.linkedin_url === 'string' ? r.linkedin_url : undefined,
      } as InternalContact;
    })
    .filter((x): x is InternalContact => x !== null);
}

function readCitations(obj: Record<string, unknown> | undefined): Array<{ url: string; title?: string }> {
  if (!obj) return [];
  const v = obj.citations;
  if (!Array.isArray(v)) return [];
  const out: Array<{ url: string; title?: string }> = [];
  for (const c of v) {
    if (!c || typeof c !== 'object') continue;
    const r = c as Record<string, unknown>;
    const url = typeof r.url === 'string' ? r.url : '';
    if (!url) continue;
    const cit: { url: string; title?: string } = { url };
    if (typeof r.title === 'string') cit.title = r.title;
    out.push(cit);
  }
  return out;
}

function formatFootprint(geo: Record<string, unknown> | undefined): string | null {
  if (!geo) return null;
  const hq = readString(geo, 'hq_state');
  const ops = readStringArray(geo, 'operating_states');
  if (ops.length === 0) return hq;
  const opsStr = ops.length > 4 ? `${ops.slice(0, 4).join(' / ')} +${ops.length - 4}` : ops.join(' / ');
  return hq ? `HQ ${hq} · ops ${opsStr}` : opsStr;
}

function formatHqLocation(geo: Record<string, unknown> | undefined): string | null {
  if (!geo) return null;
  const city = readString(geo, 'hq_city');
  const state = readString(geo, 'hq_state');
  if (city && state) return `${city}, ${state}`;
  return state ?? city;
}

export function projectToCompanyLeadView(row: Project): CompanyLeadView {
  const payload = (row.raw_payload ?? {}) as Record<string, unknown>;
  const enr = (payload.internal_enrichment as Record<string, unknown> | undefined) ?? undefined;
  const geo = (payload.internal_geo as Record<string, unknown> | undefined) ?? undefined;

  const serviceRaw =
    readString(enr, 'service_category') ??
    (typeof payload.internal_inferred_service_category === 'string'
      ? (payload.internal_inferred_service_category as string)
      : null);
  const salesMotionRaw =
    readString(enr, 'sales_motion') ??
    (typeof payload.internal_sales_motion_signal === 'string'
      ? (payload.internal_sales_motion_signal as string)
      : null);
  const federalRaw =
    typeof payload.internal_federal_registration === 'string'
      ? (payload.internal_federal_registration as string)
      : null;
  const associationFromEnr = readStringArray(enr, 'associations');
  const associationHint =
    typeof payload.internal_association_hint === 'string'
      ? [payload.internal_association_hint as string]
      : [];
  const associations = associationFromEnr.length > 0 ? associationFromEnr : associationHint;

  return {
    id: row.id,
    company_name: (row.title ?? '').trim() || row.id,
    score: row.score ?? null,
    verified: row.verified ?? null,
    service_category: serviceRaw ? (SERVICE_LABELS[serviceRaw] ?? serviceRaw) : null,
    sales_motion: salesMotionRaw ? (SALES_MOTION_LABELS[salesMotionRaw] ?? salesMotionRaw) : null,
    footprint: formatFootprint(geo),
    hq_location: formatHqLocation(geo),
    employee_count: readNumber(enr, 'employee_count'),
    federal_registration: federalRaw ? (FEDERAL_REG_LABELS[federalRaw] ?? federalRaw) : null,
    associations,
    source: row.source ?? null,
    posted_date: row.posted_date ?? null,
    warm_intro: typeof payload.internal_warm_intro === 'string' ? (payload.internal_warm_intro as string) : null,
    first_step: row.outreach_hook ?? null,
    rationale: row.rationale ?? null,
    brief: readString(enr, 'brief'),
    citations: readCitations(enr),
    website: readString(enr, 'website'),
    linkedin: readString(enr, 'linkedin'),
    contacts: readContacts(enr),
  };
}

export function companyServiceLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return SERVICE_LABELS[slug] ?? slug;
}

export function companySalesMotionLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return SALES_MOTION_LABELS[slug] ?? slug;
}

export function companyFederalRegistrationLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return FEDERAL_REG_LABELS[slug] ?? slug;
}
