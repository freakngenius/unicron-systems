// app/[slug]/leads/[projectId]/page.tsx
//
// Org-scoped lead detail page for funder-shaped opportunities. Reads
// the project row, scopes it to the org by `organization_id`, projects
// it through `projectFunderLead`, and renders a single-column detail
// view: org name + score, thesis area + stage + hub chips, founders
// list, brief, citations, raw rationale + raw_payload (collapsed).
//
// Zero diff to /leads/[projectId] (the Zedcor lead-detail route lives
// at app/leads/[projectId]/page.tsx and is untouched). This file is a
// new sibling under the [slug] segment.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import type { Organization, Project } from '@/lib/types';
import { resolveArchitecture } from '@/lib/config/resolveArchitecture';
import { projectFunderLead } from '@/lib/agents/funder/leadView';

type Props = { params: Promise<{ slug: string; projectId: string }> };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OrgLeadDetailPage({ params }: Props) {
  const raw = await params;
  const slug = raw.slug;
  // Next.js dynamic-route params are NOT URL-decoded by the framework.
  // Project ids carry colons (e.g. `propublica:824334368`), which
  // browsers encode as %3A — leave that as-is in the URL, decode here
  // before hitting Supabase.
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

  const lead = projectFunderLead(row);
  const architecture = resolveArchitecture((org.architecture ?? null) as Record<string, unknown> | null);
  const vocab = architecture.vocabulary ?? {};
  const leadsPlural = (vocab.leads as string | undefined) ?? 'leads';

  const chipRow = [
    lead.thesis_area,
    lead.fundraising_stage,
    lead.legal_form,
    lead.geo_hub,
    lead.source,
  ].filter((c): c is string => !!c);

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
          <Link href={`/${slug}`} style={{ color: '#666', textDecoration: 'none' }}>Pathfinder</Link>
          {' / '}
          <Link href={`/${slug}`} style={{ color: '#666', textDecoration: 'none' }}>{slug}</Link>
          {' / '}
          <Link href={`/${slug}/leads`} style={{ color: '#666', textDecoration: 'none' }}>{leadsPlural}</Link>
          {' / '}
          {lead.org_name}
        </p>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
            {lead.org_name}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {lead.verified && (
              <span
                style={{
                  padding: '0.2rem 0.55rem',
                  background: '#0f2615',
                  border: '1px solid #1a5e2a',
                  borderRadius: 999,
                  color: '#5bd87f',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Verified
              </span>
            )}
            {lead.score !== null && (
              <span
                style={{
                  padding: '0.25rem 0.65rem',
                  background: '#1a1a1a',
                  border: '1px solid #2d2d2d',
                  borderRadius: 999,
                  color: '#fff',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                }}
              >
                Score {lead.score}
              </span>
            )}
          </div>
        </div>
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
              background: href === `/${slug}/leads` ? '#1a1a1a' : '#111',
              border: `1px solid ${href === `/${slug}/leads` ? '#444' : '#333'}`,
              borderRadius: 4,
              color: href === `/${slug}/leads` ? '#fff' : '#aaa',
              fontSize: '0.875rem',
              textDecoration: 'none',
            }}
          >
            {label}
          </Link>
        ))}
      </nav>

      {chipRow.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.25rem' }}>
          {chipRow.map((label, i) => (
            <span
              key={`${i}-${label}`}
              style={{
                padding: '0.25rem 0.6rem',
                background: '#141414',
                border: '1px solid #2a2a2a',
                borderRadius: 999,
                color: '#cfd8e3',
                fontSize: '0.75rem',
              }}
            >
              {label}
            </span>
          ))}
        </div>
      )}

      <section style={{ background: '#111', border: '1px solid #222', borderRadius: 6, padding: '1rem 1.1rem', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '0.85rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem' }}>
          Brief
        </h2>
        {lead.brief ? (
          <p style={{ color: '#e3e8ed', fontSize: '0.92rem', lineHeight: 1.55, margin: 0 }}>
            {lead.brief}
          </p>
        ) : (
          <p style={{ color: '#666', fontSize: '0.85rem', margin: 0 }}>
            No enrichment brief yet. The next Sonar pass will fill this in.
          </p>
        )}
      </section>

      <section style={{ background: '#111', border: '1px solid #222', borderRadius: 6, padding: '1rem 1.1rem', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '0.85rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem' }}>
          Founders
        </h2>
        <FounderList row={row} />
      </section>

      <section style={{ background: '#111', border: '1px solid #222', borderRadius: 6, padding: '1rem 1.1rem', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '0.85rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem' }}>
          Snapshot
        </h2>
        <KeyValueGrid
          items={[
            ['Raise target', lead.raise_target],
            ['Stage', lead.fundraising_stage],
            ['Legal form', lead.legal_form],
            ['Founded', lead.founded_date],
            ['Hub', lead.geo_hub],
            ['Source', lead.source],
            ['Posted', lead.posted_date ? new Date(lead.posted_date).toLocaleDateString('en-US') : null],
          ]}
        />
      </section>

      {lead.citations.length > 0 && (
        <section style={{ background: '#111', border: '1px solid #222', borderRadius: 6, padding: '1rem 1.1rem', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '0.85rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem' }}>
            Citations
          </h2>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {lead.citations.map((c, i) => (
              <li key={`${i}-${c.url}`} style={{ marginBottom: '0.3rem', fontSize: '0.85rem' }}>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#85aaff', textDecoration: 'none' }}
                >
                  {c.title || c.url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {row.rationale && (
        <section style={{ background: '#111', border: '1px solid #222', borderRadius: 6, padding: '1rem 1.1rem', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '0.85rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem' }}>
            Why this scored {lead.score}
          </h2>
          <p style={{ color: '#cfd8e3', fontSize: '0.88rem', lineHeight: 1.55, margin: 0, whiteSpace: 'pre-wrap' }}>
            {row.rationale}
          </p>
        </section>
      )}
    </div>
  );
}

function titleCase(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

function FounderList({ row }: { row: Project }) {
  const payload = (row.raw_payload ?? {}) as Record<string, unknown>;
  const enr = payload.funder_enrichment as
    | { founders?: Array<{ name?: string; role?: string; prior_affiliation?: string; notes?: string }> }
    | undefined;
  const founders = enr?.founders ?? [];
  if (!founders.length) {
    return <p style={{ color: '#666', fontSize: '0.85rem', margin: 0 }}>No founder records yet.</p>;
  }
  return (
    <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
      {founders.map((f, i) => {
        const name = (f.name ?? '').trim();
        if (!name) return null;
        const lines: string[] = [];
        if (f.role) lines.push(f.role);
        if (f.prior_affiliation) lines.push(`Previously: ${f.prior_affiliation}`);
        if (f.notes) lines.push(f.notes);
        return (
          <li key={`${i}-${name}`} style={{ marginBottom: '0.45rem', fontSize: '0.88rem', color: '#e3e8ed' }}>
            <strong>{name}</strong>
            {lines.length > 0 && (
              <span style={{ color: '#9aa5b1' }}> — {lines.join(' · ')}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function KeyValueGrid({ items }: { items: Array<[string, string | null]> }) {
  const present = items.filter(([, v]) => v && v.trim() !== '');
  if (present.length === 0) {
    return <p style={{ color: '#666', fontSize: '0.85rem', margin: 0 }}>—</p>;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.6rem' }}>
      {present.map(([k, v]) => (
        <div key={k}>
          <div style={{ color: '#666', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.15rem' }}>{k}</div>
          <div style={{ color: '#e3e8ed', fontSize: '0.88rem' }}>{v}</div>
        </div>
      ))}
    </div>
  );
}
