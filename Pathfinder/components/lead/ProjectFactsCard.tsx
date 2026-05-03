// components/lead/ProjectFactsCard.tsx — Demo Polish UX Gate 3D.
//
// Renders the 10 demo-critical lead-detail fields from
// `00 - TUESDAY DEMO PLAN.md` CRITICAL #8 + the enrichment columns
// populated by Gates 3B (raw_payload backfill) and 3C (Sonar + Anthropic
// enrichment).
//
// Null behavior:
//   - When `enriched_at` is null AND the field is null: render "Not yet
//     enriched" so it's clear the gap is "we haven't tried yet."
//   - When `enriched_at` is non-null AND the field is null: render "—" so
//     it's clear "we tried, no data found."
//   - Existing populated fields (project_value, lat/lon) always render
//     when present.

import * as React from 'react';

import { PF_TINTS } from '@/lib/agent-tints';
import type { Project } from '@/lib/types';

interface KeySub {
  name: string;
  role?: string;
  source_url?: string;
}

interface Props {
  project: Project;
}

function formatMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function formatDateMMDDYY(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const dt = new Date(t);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}-${pad(
    dt.getUTCFullYear() % 100,
  )}`;
}

function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  const s = formatDateMMDDYY(start);
  const e = formatDateMMDDYY(end);
  if (!s && !e) return null;
  if (s && !e) return s;
  if (!s && e) return `– ${e}`;
  return `${s} – ${e}`;
}

function ownerTypeLabel(t: string | null | undefined): string | null {
  if (!t) return null;
  switch (t) {
    case 'federal_agency':
      return 'FEDERAL';
    case 'state_agency':
      return 'STATE';
    case 'municipality':
      return 'MUNICIPALITY';
    case 'private_developer':
      return 'PRIVATE';
    case 'pe_firm':
      return 'PE FIRM';
    case 'reit':
      return 'REIT';
    case 'university':
      return 'UNIVERSITY';
    case 'nonprofit':
      return 'NONPROFIT';
    default:
      return t.toUpperCase();
  }
}

function isKeySubArray(v: unknown): v is KeySub[] {
  if (!Array.isArray(v)) return false;
  return v.every(
    (item) =>
      item != null &&
      typeof item === 'object' &&
      typeof (item as { name?: unknown }).name === 'string',
  );
}

export function ProjectFactsCard({ project }: Props): React.ReactElement {
  const isEnriched = project.enriched_at != null;
  const placeholder = isEnriched ? '—' : 'Not yet enriched';

  const ownerLabel = project.owner_name ?? null;
  const ownerChip = ownerTypeLabel(project.owner_type ?? null);

  const keySubs: KeySub[] | null = isKeySubArray(project.key_subs)
    ? project.key_subs
    : null;
  const keySubsText = keySubs && keySubs.length > 0
    ? keySubs.map((s) => (s.role ? `${s.name} (${s.role})` : s.name)).join(', ')
    : keySubs && keySubs.length === 0 && isEnriched
      ? 'None identified'
      : placeholder;

  const description = project.description_long ?? project.summary ?? null;

  const naicsLine = project.naics_code
    ? project.naics_description
      ? `${project.naics_code} · ${project.naics_description}`
      : project.naics_code
    : null;

  const locationCoords =
    project.lat != null && project.lon != null
      ? `${project.lat.toFixed(4)}, ${project.lon.toFixed(4)}`
      : null;

  const datesLine = formatDateRange(
    project.estimated_start_date ?? null,
    project.estimated_end_date ?? null,
  );

  const permitLine = project.permit_type
    ? project.permit_number
      ? `${project.permit_type} · ${project.permit_number}`
      : project.permit_type
    : null;
  const permitDate = formatDateMMDDYY(project.permit_filing_date ?? null);

  const costLine =
    project.project_value != null ? formatMoney(project.project_value) : null;

  const lotSize =
    project.lot_size_acres != null ? `${project.lot_size_acres} acres` : null;

  return (
    <section
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
        boxShadow: PF_TINTS.shadow.sm,
        padding: 14,
      }}
    >
      <h3
        style={{
          margin: '0 0 10px',
          font: `600 12px ${PF_TINTS.sans}`,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: PF_TINTS.inkSub,
        }}
      >
        Project facts
      </h3>
      <Field label="Owner">
        {ownerLabel ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ font: `500 13px ${PF_TINTS.sans}`, color: PF_TINTS.ink }}>
              {ownerLabel}
            </span>
            {ownerChip && <Chip>{ownerChip}</Chip>}
          </span>
        ) : (
          <Placeholder text={placeholder} />
        )}
      </Field>
      <Field label="Prime contractor">
        {project.prime_contractor_name ? (
          <span style={{ font: `500 13px ${PF_TINTS.sans}`, color: PF_TINTS.ink }}>
            {project.prime_contractor_name}
          </span>
        ) : (
          <Placeholder text={isEnriched && project.source === 'sam.gov' ? 'Not yet awarded' : placeholder} />
        )}
      </Field>
      <Field label="Key subs">
        <span
          style={{
            font: `400 12px ${PF_TINTS.sans}`,
            color: PF_TINTS.inkSub,
            lineHeight: 1.45,
          }}
        >
          {keySubsText}
        </span>
      </Field>
      <Field label="Description">
        {description ? (
          <span
            style={{
              font: `400 12px ${PF_TINTS.sans}`,
              color: PF_TINTS.inkSub,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
            }}
          >
            {description}
          </span>
        ) : (
          <Placeholder text={placeholder} />
        )}
      </Field>
      <Field label="NAICS">
        {naicsLine ? (
          <span style={{ font: `500 12px ${PF_TINTS.sans}`, color: PF_TINTS.ink }}>
            {naicsLine}
          </span>
        ) : (
          <Placeholder text={placeholder} />
        )}
      </Field>
      <Field label="Location">
        {project.location_text ? (
          <span style={{ display: 'block' }}>
            <span style={{ font: `500 13px ${PF_TINTS.sans}`, color: PF_TINTS.ink }}>
              {project.location_text}
            </span>
            {locationCoords && (
              <span
                style={{
                  display: 'block',
                  font: `400 11px ${PF_TINTS.mono}`,
                  color: PF_TINTS.inkDim,
                  marginTop: 2,
                }}
              >
                {locationCoords}
              </span>
            )}
          </span>
        ) : locationCoords ? (
          <span style={{ font: `400 11px ${PF_TINTS.mono}`, color: PF_TINTS.inkDim }}>
            {locationCoords}
          </span>
        ) : (
          <Placeholder text={placeholder} />
        )}
      </Field>
      <Field label="Estimated dates">
        {datesLine ? (
          <span style={{ font: `500 13px ${PF_TINTS.sans}`, color: PF_TINTS.ink }}>
            {datesLine}
          </span>
        ) : (
          <Placeholder text={placeholder} />
        )}
      </Field>
      <Field label="Permit">
        {permitLine || project.permit_jurisdiction || permitDate ? (
          <span style={{ display: 'block' }}>
            {permitLine && (
              <span style={{ font: `500 13px ${PF_TINTS.sans}`, color: PF_TINTS.ink }}>
                {permitLine}
              </span>
            )}
            {project.permit_jurisdiction && (
              <span
                style={{
                  display: 'block',
                  font: `400 11px ${PF_TINTS.sans}`,
                  color: PF_TINTS.inkDim,
                  marginTop: 2,
                }}
              >
                {project.permit_jurisdiction}
              </span>
            )}
            {permitDate && (
              <span
                style={{
                  display: 'block',
                  font: `400 11px ${PF_TINTS.mono}`,
                  color: PF_TINTS.inkDim,
                  marginTop: 2,
                }}
              >
                {permitDate}
              </span>
            )}
          </span>
        ) : (
          <Placeholder text={isEnriched && project.source !== 'harris' ? 'N/A' : placeholder} />
        )}
      </Field>
      <Field label="Estimated cost">
        {costLine ? (
          <span style={{ font: `500 14px ${PF_TINTS.sans}`, color: PF_TINTS.ink }}>
            {costLine}
          </span>
        ) : (
          <Placeholder text={placeholder} />
        )}
      </Field>
      <Field label="Lot size" last>
        {lotSize ? (
          <span style={{ font: `500 13px ${PF_TINTS.sans}`, color: PF_TINTS.ink }}>
            {lotSize}
          </span>
        ) : (
          <Placeholder text={placeholder} />
        )}
      </Field>
    </section>
  );
}

function Field({
  label,
  children,
  last = false,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}): React.ReactElement {
  return (
    <div
      style={{
        padding: '8px 0',
        borderBottom: last ? 'none' : `1px solid ${PF_TINTS.ruleHair}`,
      }}
    >
      <div
        style={{
          font: `600 10px ${PF_TINTS.sans}`,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: PF_TINTS.inkDim,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <span
      style={{
        background: PF_TINTS.bgAlt,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        color: PF_TINTS.inkSub,
        padding: '2px 6px',
        borderRadius: 3,
        font: `600 10px ${PF_TINTS.mono}`,
        letterSpacing: '0.06em',
      }}
    >
      {children}
    </span>
  );
}

function Placeholder({ text }: { text: string }): React.ReactElement {
  return (
    <span
      style={{
        font: `400 12px ${PF_TINTS.sans}`,
        color: PF_TINTS.inkDim,
        fontStyle: 'italic',
      }}
    >
      {text}
    </span>
  );
}
