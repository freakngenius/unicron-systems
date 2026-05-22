// lib/agents/funder/leadView.ts
//
// Projects a pathfinder.projects row into the flat shape the Funder
// LeadCard renders. Field names align with
// architecture.lead_unit.schema (org_name, thesis_area, founders,
// raise_target, score, legal_form, founded_date, fundraising_stage,
// geo_hub, source) so the LeadCard's `lead[field]` lookup picks them
// up by ui_plan.lead_card_layout.primary_fields / secondary_fields.
//
// Reads enrichment-derived fields when present (funder_enrichment.*)
// and falls back to qualifier-time signals (funder_inferred_thesis,
// funder_geo_hub) and the bare title.

import type { Project } from '@/lib/types';

export interface FunderLeadView {
  id: string;
  // Primary fields
  org_name: string;
  thesis_area: string | null;
  founders: string | null;
  raise_target: string | null;
  score: number | null;
  // Secondary fields
  legal_form: string | null;
  founded_date: string | null;
  fundraising_stage: string | null;
  geo_hub: string | null;
  source: string | null;
  // Detail-only
  verified: boolean | null;
  brief: string | null;
  citations: Array<{ url: string; title?: string }>;
  posted_date: string | null;
  raise_target_usd: number | null;
}

interface FunderEnrichmentBlock {
  org_name?: string | null;
  legal_form?: string | null;
  founders?: Array<{ name?: string; role?: string; prior_affiliation?: string; notes?: string }>;
  founded_year?: number | null;
  raise_target_usd?: number | null;
  fundraising_stage?: string | null;
  brief?: string | null;
  citations?: Array<{ url: string; title?: string }>;
}

function formatFounders(founders: FunderEnrichmentBlock['founders']): string | null {
  if (!Array.isArray(founders) || founders.length === 0) return null;
  return founders
    .map((f) => {
      const name = (f.name ?? '').trim();
      if (!name) return null;
      const aff = (f.prior_affiliation ?? '').trim();
      return aff ? `${name} (${aff})` : name;
    })
    .filter((s): s is string => !!s)
    .join(', ') || null;
}

function formatRaiseTarget(usd: number | null | undefined): string | null {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return null;
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(usd >= 10_000_000 ? 0 : 1)}M`;
  if (usd >= 1_000) return `$${Math.round(usd / 1_000)}K`;
  return `$${usd}`;
}

const THESIS_LABELS: Record<string, string> = {
  'ai-safety': 'AI safety',
  'biosecurity': 'Biosecurity',
  'longevity': 'Longevity',
  'civic-infrastructure': 'Civic infrastructure',
  'ai-governance': 'AI governance',
  'epistemics': 'Epistemics',
  'other': 'Other',
};

const STAGE_LABELS: Record<string, string> = {
  'forming': 'Forming',
  'pre-raise': 'Pre-raise',
  'actively-raising': 'Actively raising',
  'closing': 'Closing',
  'raised': 'Raised',
};

const HUB_LABELS: Record<string, string> = {
  'sf-bay': 'SF Bay',
  'nyc': 'NYC',
  'dc-metro': 'DC metro',
  'boston': 'Boston',
  'london': 'London',
  'remote': 'Remote',
  'other': 'Other',
};

const LEGAL_FORM_LABELS: Record<string, string> = {
  '501c3': '501(c)(3)',
  'pbc': 'PBC',
  'llc-mission-lock': 'LLC (mission-lock)',
  'fiscally-sponsored': 'Fiscally sponsored',
  'other': 'Other',
};

const SOURCE_LABELS: Record<string, string> = {
  'custom-ea-forum-rss': 'EA Forum',
  'custom-propublica-nonprofit-explorer': 'ProPublica',
  'custom-philanthropy-trade-press-rss': 'Trade press',
  'custom-funder-990-filings': 'Peer 990s',
  'custom-irs-exempt-org-filings': 'IRS BMF',
  'custom-accelerator-cohort-pages': 'Accelerator',
  'business-license-issuances': 'Business licenses',
  'synthetic-portfolio': 'Portfolio (seed)',
};

export function projectFunderLead(row: Project): FunderLeadView {
  const payload = (row.raw_payload ?? {}) as Record<string, unknown>;
  const enr = (payload.funder_enrichment ?? {}) as FunderEnrichmentBlock;
  const orgName = enr.org_name?.trim() || (row.title ?? '').trim() || row.id;
  const thesisRaw =
    ((enr as { thesis_area?: string }).thesis_area as string | undefined) ??
    (payload.funder_inferred_thesis as string | null | undefined) ??
    null;
  const stageRaw = enr.fundraising_stage ?? null;
  const hubRaw = (payload.funder_geo_hub as string | null | undefined) ?? null;
  const sourceRaw = row.source ?? null;
  const legalForm = enr.legal_form ?? null;
  const foundedDate = enr.founded_year ? String(enr.founded_year) : null;

  return {
    id: row.id,
    org_name: orgName,
    thesis_area: thesisRaw ? (THESIS_LABELS[thesisRaw] ?? thesisRaw) : null,
    founders: formatFounders(enr.founders),
    raise_target: formatRaiseTarget(enr.raise_target_usd ?? null),
    score: row.score ?? null,
    legal_form: legalForm ? (LEGAL_FORM_LABELS[legalForm] ?? legalForm) : null,
    founded_date: foundedDate,
    fundraising_stage: stageRaw ? (STAGE_LABELS[stageRaw] ?? stageRaw) : null,
    geo_hub: hubRaw ? (HUB_LABELS[hubRaw] ?? hubRaw) : null,
    source: sourceRaw ? (SOURCE_LABELS[sourceRaw] ?? sourceRaw) : null,
    verified: row.verified ?? null,
    brief: typeof enr.brief === 'string' ? enr.brief : null,
    citations: Array.isArray(enr.citations) ? (enr.citations as Array<{ url: string; title?: string }>) : [],
    posted_date: row.posted_date ?? null,
    raise_target_usd: enr.raise_target_usd ?? null,
  };
}

export function thesisLabel(slug: string | null | undefined): string {
  if (!slug) return 'Other';
  return THESIS_LABELS[slug] ?? slug;
}

export function stageLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return STAGE_LABELS[slug] ?? slug;
}

export function hubLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return HUB_LABELS[slug] ?? slug;
}
