// app/[slug]/pipeline/page.tsx
//
// Org-scoped pipeline view for the funder customer. Renders a kanban
// shape driven by `architecture.pipeline.stages` + `stage_labels`
// (Funder's blueprint defines sourced / reviewing / contacted /
// in-diligence / funded / passed). Each stage column shows the
// org-scoped opportunities currently in that stage based on
// `raw_payload.funder_pipeline_stage`. No deals yet => empty columns
// with an honest "No opportunities in this stage" line.
//
// Same header + nav shape as the dashboard and leads page so the
// surface is consistent.
//
// Zedcor is untouched: the global /pipeline route (`app/pipeline`)
// continues to serve the existing deal_activities kanban. This file
// is a new sibling under [slug].

import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import type { Organization, Project } from '@/lib/types';
import { resolveArchitecture } from '@/lib/config/resolveArchitecture';
import { projectFunderLead } from '@/lib/agents/funder/leadView';

type Props = { params: Promise<{ slug: string }> };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STAGE_COLORS: Record<string, string> = {
  sourced: '#6c7ae0',
  reviewing: '#3aa3ff',
  contacted: '#22c55e',
  'in-diligence': '#facc15',
  funded: '#ec4899',
  passed: '#6b7280',
};

export default async function OrgPipelinePage({ params }: Props) {
  const { slug } = await params;

  const adminAny = supabaseAdmin() as unknown as { from: (t: string) => any };
  const { data: org } = (await adminAny
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()) as { data: Organization | null };

  const architecture = resolveArchitecture((org?.architecture ?? null) as Record<string, unknown> | null);
  const vocab = architecture.vocabulary ?? {};
  const leadsPlural = (vocab.leads as string | undefined) ?? 'leads';

  const stages = (architecture.pipeline?.stages ?? ['sourced', 'reviewing', 'contacted', 'in-diligence', 'funded', 'passed']) as string[];
  const stageLabels = (architecture.pipeline?.stage_labels ?? {}) as Record<string, string>;

  // Pull all org-scoped projects, then bucket by funder_pipeline_stage.
  // Unset stage defaults to the first stage ("sourced") so verified
  // opportunities show up in the funnel even before an operator
  // moves them. Honest: no fake deal_activities rows.
  type Bucket = ReturnType<typeof projectFunderLead>;
  const buckets = new Map<string, Bucket[]>();
  stages.forEach((s) => buckets.set(s, []));

  if (org?.id) {
    const projectsClient = supabaseAdmin() as unknown as { from: (t: string) => any };
    const { data: rows } = (await projectsClient
      .from('projects')
      .select('*')
      .eq('organization_id', org.id)
      .order('score', { ascending: false, nullsFirst: false })
      .limit(500)) as { data: Project[] | null };
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const payload = (r.raw_payload ?? {}) as Record<string, unknown>;
        const stage = ((payload.funder_pipeline_stage as string | undefined) ?? stages[0]) || stages[0];
        const bucket = buckets.get(stage) ?? buckets.get(stages[0])!;
        bucket.push(projectFunderLead(r));
      }
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#fff',
        fontFamily: 'var(--font-inter, sans-serif)',
        padding: '2rem',
      }}
    >
      <header style={{ marginBottom: '1.5rem', borderBottom: '1px solid #222', paddingBottom: '1rem' }}>
        <p
          style={{
            color: '#666',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '0.25rem',
          }}
        >
          Pathfinder / {slug} / Pipeline
        </p>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Pipeline</h1>
        <p style={{ color: '#888', fontSize: '0.8rem', marginTop: '0.4rem' }}>
          {titleCase(leadsPlural)} grouped by stage. Stages come from the org&apos;s pipeline config.
        </p>
      </header>

      <nav data-funder-nav style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {[
          { href: `/${slug}`, label: 'Dashboard' },
          { href: `/${slug}/leads`, label: titleCase(leadsPlural) },
          { href: `/${slug}/pipeline`, label: 'Pipeline' },
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            style={{
              padding: '0.5rem 1rem',
              background: href === `/${slug}/pipeline` ? '#1a1a1a' : '#111',
              border: `1px solid ${href === `/${slug}/pipeline` ? '#444' : '#333'}`,
              borderRadius: 4,
              color: href === `/${slug}/pipeline` ? '#fff' : '#aaa',
              fontSize: '0.875rem',
              textDecoration: 'none',
            }}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div
        data-funder-pipeline
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${stages.length}, minmax(220px, 1fr))`,
          gap: '0.75rem',
          overflowX: 'auto',
        }}
      >
        {stages.map((stage) => {
          const items = buckets.get(stage) ?? [];
          const label = stageLabels[stage] ?? stage;
          const color = STAGE_COLORS[stage] ?? '#666';
          return (
            <div
              key={stage}
              data-pipeline-column={stage}
              style={{
                background: '#111',
                border: '1px solid #222',
                borderRadius: 6,
                padding: '0.75rem',
                minHeight: 240,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '0.6rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                <span style={{ color: '#cfd8e3' }}>
                  <span
                    aria-hidden
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      marginRight: '0.5rem',
                      background: color,
                      verticalAlign: 'middle',
                    }}
                  />
                  {label}
                </span>
                <span style={{ color: '#666' }}>{items.length}</span>
              </div>
              {items.length === 0 ? (
                <div style={{ color: '#555', fontSize: '0.75rem', padding: '0.4rem 0' }}>
                  No {leadsPlural} in this stage.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {items.map((lead) => (
                    <Link
                      key={lead.id}
                      href={`/${slug}/leads/${encodeURIComponent(lead.id)}`}
                      style={{
                        background: '#0a0a0a',
                        border: '1px solid #1f1f1f',
                        borderRadius: 4,
                        padding: '0.55rem 0.65rem',
                        display: 'block',
                        textDecoration: 'none',
                        color: 'inherit',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <span style={{ color: '#e3e8ed', fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {lead.org_name}
                        </span>
                        {lead.score !== null && (
                          <span style={{ color: '#9aa5b1', fontSize: '0.72rem' }}>
                            {lead.score}
                          </span>
                        )}
                      </div>
                      {(lead.thesis_area || lead.fundraising_stage) && (
                        <div style={{ marginTop: '0.2rem', color: '#888', fontSize: '0.7rem' }}>
                          {[lead.thesis_area, lead.fundraising_stage].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function titleCase(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
