'use client';

// components/lead/SourceRecord.tsx — Demo Polish UX Gate 8X-3 (renamed
// from RawPayloadFacts in Gate 9B to align with SPEC - Lead Detail Page
// v2.md § 9 Source Record).
//
// Per-source breakdown of fields the ingester already captured into
// pathfinder.projects.raw_payload but that QuickFactsGrid didn't surface.
// Renders curated, source-aware fields only — no raw JSON dump per spec.
//
// Source-specific layouts:
//   - sam.gov     → contracting-office address, agency hierarchy, set-aside,
//                    solicitation number + sam.gov link, bid-window dates
//   - usaspending → recipient, awarding agency, award id, period, place
//   - harris      → permit type / filing date / address / contractor-listed
//   - news        → publication, link to article, published date
//
// Empty-state rule: if a sub-field is null in raw_payload, hide that row
// (don't render label-with-dash). Spec says these fields aren't
// universally applicable like the Quick Facts grid is, so absence is
// silent.

import * as React from 'react';

import type { Project } from '@/lib/types';
import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';

interface Props {
  project: Project;
}

// Pull a typed field off the raw_payload jsonb without exploding when the
// payload is null or shaped differently than expected.
function payload(project: Project): Record<string, unknown> | null {
  const raw = (project as unknown as { raw_payload?: unknown }).raw_payload;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function rawString(p: Record<string, unknown> | null, key: string): string | null {
  if (!p) return null;
  const v = p[key];
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function formatBidDeadline(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace('T', ' ') + 'Z';
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function CardShell({
  title,
  rows,
  testid,
  link,
}: {
  title: string;
  testid: string;
  rows: Array<{ label: string; value: React.ReactNode } | null>;
  link?: { label: string; href: string } | null;
}): React.ReactElement | null {
  const visible = rows.filter((r): r is { label: string; value: React.ReactNode } => r !== null);
  if (visible.length === 0 && !link) return null;
  return (
    <section
      data-testid={testid}
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleHair}`,
        borderRadius: PF_TINTS.r.md,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <h3
          style={{
            margin: 0,
            font: `600 11px ${PF_TINTS.sans}`,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: PF_TINTS.ink,
          }}
        >
          {title}
        </h3>
        {link && (
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`${testid}-link`}
            style={{
              font: `500 11px ${PF_TINTS.mono}`,
              color: PF_TINTS.ink,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              padding: '4px 10px',
              border: `1px solid ${PF_TINTS.ruleHair}`,
              borderRadius: 4,
              textDecoration: 'none',
            }}
          >
            {link.label} ↗
          </a>
        )}
      </header>
      <dl
        style={{
          margin: 0,
          display: 'grid',
          gridTemplateColumns: 'minmax(140px, max-content) 1fr',
          rowGap: 8,
          columnGap: 16,
        }}
      >
        {visible.map((r, i) => (
          <React.Fragment key={i}>
            <dt
              style={{
                font: `500 11px ${PF_TINTS.mono}`,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: PF_TINTS.inkDim,
              }}
            >
              {r.label}
            </dt>
            <dd
              style={{
                margin: 0,
                font: `400 13px ${PF_TINTS.sans}`,
                color: PF_TINTS.ink,
                wordBreak: 'break-word',
              }}
            >
              {r.value}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </section>
  );
}

function chip(text: string, color: string = '#475569'): React.ReactElement {
  return (
    <span
      style={{
        display: 'inline-block',
        background: hexAlpha(color, 0.12),
        border: `1px solid ${hexAlpha(color, 0.5)}`,
        color,
        padding: '2px 8px',
        borderRadius: 3,
        font: `600 10px ${PF_TINTS.mono}`,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      {text}
    </span>
  );
}

function AgencyBreadcrumb({ path }: { path: string }): React.ReactElement {
  const segments = path.split('.').map((s) => s.trim()).filter(Boolean);
  return (
    <span
      style={{
        font: `400 12px ${PF_TINTS.mono}`,
        color: PF_TINTS.ink,
        lineHeight: 1.5,
      }}
    >
      {segments.map((seg, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <span style={{ color: PF_TINTS.inkDim, padding: '0 4px' }}>›</span>
          )}
          <span style={i === segments.length - 1 ? { color: PF_TINTS.ink, fontWeight: 600 } : undefined}>
            {seg}
          </span>
        </React.Fragment>
      ))}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────
// sam.gov
// ────────────────────────────────────────────────────────────────────────

function SamGovFacts({ project }: { project: Project }): React.ReactElement | null {
  const p = payload(project);
  if (!p) return null;

  const office = (() => {
    const raw = p.officeAddress;
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const city = typeof o.city === 'string' ? o.city : null;
    const state = typeof o.state === 'string' ? o.state : null;
    const zip = typeof o.zipcode === 'string' ? o.zipcode : null;
    if (!city && !state && !zip) return null;
    const parts = [city, state, zip].filter(Boolean);
    return parts.join(', ');
  })();

  const agencyPath = rawString(p, 'fullParentPathName');
  const setAside = rawString(p, 'typeOfSetAsideDescription');
  const solnNo = rawString(p, 'solicitationNumber');
  const uiLink = rawString(p, 'uiLink');
  const deadline = rawString(p, 'responseDeadLine');
  const archive = rawString(p, 'archiveDate');
  const days = daysUntil(deadline);

  return (
    <CardShell
      title="Solicitation details (sam.gov)"
      testid="raw-payload-samgov"
      link={uiLink ? { label: 'View on sam.gov', href: uiLink } : null}
      rows={[
        agencyPath
          ? { label: 'Agency', value: <AgencyBreadcrumb path={agencyPath} /> }
          : null,
        office
          ? { label: 'Contracting office', value: office }
          : null,
        setAside && setAside.toLowerCase() !== 'no set aside used'
          ? { label: 'Set-aside', value: chip(setAside) }
          : null,
        solnNo ? { label: 'Solicitation #', value: <span style={{ fontFamily: PF_TINTS.mono }}>{solnNo}</span> } : null,
        deadline
          ? {
              label: 'Bid window closes',
              value: (
                <span>
                  {formatBidDeadline(deadline)}
                  {days != null && days >= 0 && (
                    <span
                      style={{
                        marginLeft: 8,
                        color: days <= 14 ? '#b91c1c' : days <= 30 ? '#d97706' : PF_TINTS.inkSub,
                        font: `500 11px ${PF_TINTS.mono}`,
                      }}
                    >
                      ({days}d)
                    </span>
                  )}
                </span>
              ),
            }
          : null,
        archive ? { label: 'Archive date', value: archive } : null,
      ]}
    />
  );
}

// ────────────────────────────────────────────────────────────────────────
// usaspending
// ────────────────────────────────────────────────────────────────────────

function UsaspendingFacts({ project }: { project: Project }): React.ReactElement | null {
  const p = payload(project);
  if (!p) return null;
  const recipient = rawString(p, 'Recipient Name');
  const awardingAgency = rawString(p, 'Awarding Agency');
  const awardId = rawString(p, 'Award ID');
  const popStart = rawString(p, 'Period of Performance Start Date');
  const popEnd = rawString(p, 'Period of Performance Current End Date');
  const popStateCode = rawString(p, 'Place of Performance State Code');
  const popCityCode = rawString(p, 'Place of Performance City Code');
  const place = [popCityCode, popStateCode].filter(Boolean).join(', ') || null;
  const period =
    popStart && popEnd
      ? `${popStart} → ${popEnd}`
      : popStart
        ? `from ${popStart}`
        : popEnd
          ? `until ${popEnd}`
          : null;

  // USAspending public link is constructed from Award ID + agency_slug
  // when present.
  const slug = rawString(p, 'agency_slug');
  const usaspendingLink =
    awardId && slug
      ? `https://www.usaspending.gov/award/${encodeURIComponent(awardId)}/${encodeURIComponent(slug)}`
      : awardId
        ? `https://www.usaspending.gov/search/?keywords=${encodeURIComponent(awardId)}`
        : null;

  return (
    <CardShell
      title="Award details (usaspending)"
      testid="raw-payload-usaspending"
      link={usaspendingLink ? { label: 'View on usaspending.gov', href: usaspendingLink } : null}
      rows={[
        recipient ? { label: 'Recipient', value: chip(recipient, '#0d9488') } : null,
        awardingAgency ? { label: 'Awarding agency', value: awardingAgency } : null,
        awardId
          ? { label: 'Award ID', value: <span style={{ fontFamily: PF_TINTS.mono }}>{awardId}</span> }
          : null,
        period ? { label: 'Period', value: period } : null,
        place ? { label: 'Place of perf.', value: place } : null,
      ]}
    />
  );
}

// ────────────────────────────────────────────────────────────────────────
// harris
// ────────────────────────────────────────────────────────────────────────

function HarrisFacts({ project }: { project: Project }): React.ReactElement | null {
  const p = payload(project);
  if (!p) return null;
  const permitType = rawString(p, 'permit_type');
  const filingDate = rawString(p, 'filing_date');
  const address = rawString(p, 'address');
  const contractorListedRaw = p['contractor_listed'];
  const contractorListed =
    contractorListedRaw === true || contractorListedRaw === 'true' || contractorListedRaw === 1
      ? 'Yes'
      : contractorListedRaw === false || contractorListedRaw === 'false' || contractorListedRaw === 0
        ? 'No'
        : null;

  return (
    <CardShell
      title="Permit details (harris county)"
      testid="raw-payload-harris"
      rows={[
        permitType ? { label: 'Permit type', value: chip(permitType, '#0d9488') } : null,
        filingDate ? { label: 'Filed', value: filingDate } : null,
        address ? { label: 'Address', value: address } : null,
        contractorListed
          ? { label: 'Contractor listed', value: contractorListed }
          : null,
      ]}
    />
  );
}

// ────────────────────────────────────────────────────────────────────────
// news
// ────────────────────────────────────────────────────────────────────────

function NewsFacts({ project }: { project: Project }): React.ReactElement | null {
  const p = payload(project);
  if (!p) return null;
  const publication = rawString(p, 'publication');
  const url = rawString(p, 'url');
  const publishedAt = rawString(p, 'published_at');
  return (
    <CardShell
      title="Article (news)"
      testid="raw-payload-news"
      link={url ? { label: 'Read article', href: url } : null}
      rows={[
        publication ? { label: 'Publication', value: chip(publication, '#d946ef') } : null,
        publishedAt ? { label: 'Published', value: publishedAt } : null,
      ]}
    />
  );
}

export function SourceRecord({ project }: Props): React.ReactElement | null {
  switch (project.source) {
    case 'sam.gov':
      return <SamGovFacts project={project} />;
    case 'usaspending':
      return <UsaspendingFacts project={project} />;
    case 'harris':
      return <HarrisFacts project={project} />;
    case 'news':
      return <NewsFacts project={project} />;
    default:
      return null;
  }
}
