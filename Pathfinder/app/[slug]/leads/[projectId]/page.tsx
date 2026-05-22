// app/[slug]/leads/[projectId]/page.tsx
//
// Org-scoped lead detail page. Wraps every org's lead detail in the
// reusable LeadDetailShell (breadcrumb + nav + score chip + chip row).
// The shell's children slot is the per-org contents component:
//
//   - FunderDetailContents for Funder-shaped orgs (founders, raise
//     stage, legal form, hub). Same fields the page rendered before
//     the shell extraction; Funder customer sees no change.
//   - CompanyDetailContents for Internal-shaped orgs (service category,
//     sales motion, footprint, federal registration, contacts,
//     associations, rationale). The Internal projects row carries no
//     Funder enrichment, so the prior Funder-only page looked blank on
//     /pathfinder/internal/leads/<id>. That blank render is the "click
//     does nothing useful" defect from the Internal bug-fix brief.
//
// Selection is by architecture.lead_unit.name. A later deeper detail
// view plugs into the LeadDetailShell children seam without touching
// the shell.
//
// Zedcor /leads/[projectId] (app/leads/[projectId]/page.tsx) is
// unchanged.

import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import type { Organization, Project } from '@/lib/types';
import { resolveArchitecture } from '@/lib/config/resolveArchitecture';
import { projectFunderLead } from '@/lib/agents/funder/leadView';
import { projectToCompanyLeadView } from '@/lib/agents/internal/companyLeadView';
import { LeadDetailShell } from '@/components/lead/LeadDetailShell';
import { FunderDetailContents } from '@/components/lead/FunderDetailContents';
import { CompanyDetailContents } from '@/components/lead/CompanyDetailContents';

type Props = { params: Promise<{ slug: string; projectId: string }> };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OrgLeadDetailPage({ params }: Props) {
  const raw = await params;
  const slug = raw.slug;
  // Next.js dynamic-route params are NOT URL-decoded by the framework.
  // Project ids carry colons (e.g. propublica:824334368) which browsers
  // encode as %3A. Decode here before hitting Supabase.
  const projectId = decodeURIComponent(raw.projectId);

  const adminAny = supabaseAdmin() as unknown as { from: (t: string) => any };
  const { data: org } = (await adminAny
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()) as { data: Organization | null };

  if (!org) notFound();

  const projectsClient = supabaseAdmin() as unknown as { from: (t: string) => any };
  const { data: row } = (await projectsClient
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('organization_id', org.id)
    .maybeSingle()) as { data: Project | null };

  if (!row) notFound();

  const architecture = resolveArchitecture((org.architecture ?? null) as Record<string, unknown> | null);
  const vocab = architecture.vocabulary ?? {};
  const leadsPlural = (vocab.leads as string | undefined) ?? 'leads';
  const leadSingular = (vocab.lead as string | undefined) ?? 'lead';
  const leadUnitName = (architecture.lead_unit?.name ?? '').toLowerCase();

  if (leadUnitName === 'company') {
    const lead = projectToCompanyLeadView(row);
    return (
      <LeadDetailShell
        slug={slug}
        title={lead.company_name}
        score={lead.score}
        verified={lead.verified}
        leadsPlural={leadsPlural}
        leadSingular={leadSingular}
        chips={[lead.service_category, lead.sales_motion, lead.hq_location, lead.source]}
      >
        <CompanyDetailContents lead={lead} />
      </LeadDetailShell>
    );
  }

  const lead = projectFunderLead(row);
  return (
    <LeadDetailShell
      slug={slug}
      title={lead.org_name}
      score={lead.score}
      verified={lead.verified}
      leadsPlural={leadsPlural}
      leadSingular={leadSingular}
      chips={[lead.thesis_area, lead.fundraising_stage, lead.legal_form, lead.geo_hub, lead.source]}
    >
      <FunderDetailContents lead={lead} row={row} />
    </LeadDetailShell>
  );
}
