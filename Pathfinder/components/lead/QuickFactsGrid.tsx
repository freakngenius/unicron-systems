'use client';

// components/lead/QuickFactsGrid.tsx — Demo Polish UX Gate 7A.
//
// Section 3 of the redesigned lead detail page (per SPEC § 3). Replaces the
// existing 4-column metadata strip + sidebar ProjectFactsCard with a 3-col
// responsive grid of 9 label-over-value cells. Mobile collapses to 1 col.
//
// Cells (in order):
//   1. Owner               (owner_name + owner_type chip, color-coded)
//   2. Prime Contractor    (prime_contractor_name; pre-award handling)
//   3. Project Value       ($X.XM; "Not disclosed" for sam.gov pre-award)
//   4. Industry            (NAICS code + description)
//   5. Stage               (project_stage normalized)
//   6. Timing              (estimated_start_date – estimated_end_date)
//   7. Location            (location_text + coords subtitle)
//   8. Permit              (permit_type · permit_number + jurisdiction)
//   9. Lot Size            (X.X acres; hidden for linear infra)
//
// Empty-state rules (per spec):
//   - Never render bare `—` without a label
//   - "Not disclosed" → source-known-not-to-have (sam.gov pre-award value,
//     federal-contract permit)
//   - "Not yet enriched" → source-could-have-but-system-didn't
//     (lot_size, sub-tier roster) — gated on enriched_at == null
//   - "—" → last resort when the field genuinely doesn't apply

import * as React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import type { Project } from '@/lib/types';

interface Props {
  project: Project;
}

// Owner-type chip colors per spec § 3 cell 1: federal=blue, municipality=
// teal, PE=magenta, etc. Returns a hex; the chip applies it as border +
// faded background.
function ownerTypeColor(t: Project['owner_type']): string {
  switch (t) {
    case 'federal_agency':
      return '#3b82f6'; // blue
    case 'state_agency':
      return '#14b8a6'; // teal
    case 'municipality':
      return '#0d9488'; // teal-darker
    case 'private_developer':
      return '#6b7280'; // gray
    case 'pe_firm':
      return '#d946ef'; // magenta
    case 'reit':
      return '#f97316'; // orange
    case 'university':
      return '#6366f1'; // indigo
    case 'nonprofit':
      return '#22c55e'; // green
    default:
      return '#9ca3af'; // light gray
  }
}

function ownerTypeLabel(t: Project['owner_type']): string | null {
  if (!t) return null;
  switch (t) {
    case 'federal_agency':
      return 'FEDERAL AGENCY';
    case 'state_agency':
      return 'STATE AGENCY';
    case 'municipality':
      return 'MUNICIPALITY';
    case 'private_developer':
      return 'PRIVATE DEVELOPER';
    case 'pe_firm':
      return 'PE FIRM';
    case 'reit':
      return 'REIT';
    case 'university':
      return 'UNIVERSITY';
    case 'nonprofit':
      return 'NONPROFIT';
    case 'other':
      return 'OTHER';
    default:
      return null;
  }
}

function formatMoneyShort(n: number): string {
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

function monthsBetween(start: string, end: string): number | null {
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return null;
  return Math.round((e - s) / (1000 * 60 * 60 * 24 * 30.44));
}

// Linear-infrastructure NAICS codes — projects where "lot size" is
// meaningless (highways, pipelines, power lines, rail). Per spec § 3 cell 9
// the cell is hidden entirely for these.
//
// 237310 — Highway, Street, and Bridge Construction
// 237120 — Oil and Gas Pipeline and Related Structures Construction
// 237130 — Power and Communication Line and Related Structures Construction
// 237990 — Other Heavy and Civil Engineering Construction (often includes
//          rail / transit corridor work)
const LINEAR_INFRA_NAICS = new Set(['237310', '237120', '237130', '237990']);

function isLinearInfra(project: Project): boolean {
  if (project.naics_code && LINEAR_INFRA_NAICS.has(project.naics_code)) return true;
  return false;
}

// "sam.gov pre-award" — solicitation source with no awardee row. Per
// SPEC - Lead Detail Enrichment.md § 2: pre-award sam.gov rows have
// prime_contractor_name = null at backfill, and the enricher only fills it
// when raw_payload.award is non-null. So a sam.gov source + null
// prime_contractor_name reliably signals pre-award even when enriched_at is
// non-null.
function isSamGovPreAward(project: Project): boolean {
  return project.source === 'sam.gov' && !project.prime_contractor_name;
}

// "federal contract" — owner is a federal agency. Used to pick the right
// permit empty-state ("federal contracts don't carry city permits").
function isFederalContract(project: Project): boolean {
  return project.owner_type === 'federal_agency';
}

export function QuickFactsGrid({ project }: Props): React.ReactElement {
  const isEnriched = project.enriched_at != null;
  const linearInfra = isLinearInfra(project);
  const samGovPreAward = isSamGovPreAward(project);
  const federalContract = isFederalContract(project);

  // Cell 1 — Owner
  const ownerCell = (
    <Cell label="Owner">
      {project.owner_name ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ font: `500 14px ${PF_TINTS.sans}`, color: PF_TINTS.ink }}>
            {project.owner_name}
          </span>
          {project.owner_type && (
            <Chip color={ownerTypeColor(project.owner_type)}>
              {ownerTypeLabel(project.owner_type)}
            </Chip>
          )}
        </span>
      ) : (
        <Empty kind={isEnriched ? 'unknown' : 'pending'} />
      )}
    </Cell>
  );

  // Cell 2 — Prime Contractor
  const primeCell = (
    <Cell label="Prime Contractor">
      {project.prime_contractor_name ? (
        <Plain>{project.prime_contractor_name}</Plain>
      ) : samGovPreAward ? (
        <Empty kind="pre-award" />
      ) : (
        <Empty kind={isEnriched ? 'unknown' : 'pending'} />
      )}
    </Cell>
  );

  // Cell 3 — Project Value
  const valueCell = (
    <Cell label="Project Value">
      {project.project_value != null ? (
        <span style={{ font: `500 16px ${PF_TINTS.sans}`, color: PF_TINTS.ink }}>
          {formatMoneyShort(project.project_value)}
        </span>
      ) : samGovPreAward ? (
        <Empty kind="not-disclosed" detail="open solicitation" />
      ) : (
        <Empty kind={isEnriched ? 'unknown' : 'pending'} />
      )}
    </Cell>
  );

  // Cell 4 — Industry (NAICS)
  const naicsLine = project.naics_code
    ? project.naics_description
      ? `${project.naics_code} · ${project.naics_description}`
      : project.naics_code
    : null;
  const industryCell = (
    <Cell label="Industry">
      {naicsLine ? (
        <Plain>{naicsLine}</Plain>
      ) : (
        <Empty kind={isEnriched ? 'unknown' : 'pending'} />
      )}
    </Cell>
  );

  // Cell 5 — Stage. Spec calls for normalization to a small enum; the raw
  // values vary by source. 7A renders the raw value capitalized and defers
  // the enum normalization to a future gate (touches the Ranker).
  const stageCell = (
    <Cell label="Stage">
      {project.project_stage ? (
        <Plain>{project.project_stage}</Plain>
      ) : (
        <Empty kind={isEnriched ? 'unknown' : 'pending'} />
      )}
    </Cell>
  );

  // Cell 6 — Timing. sam.gov solicitations: estimated_start_date holds the
  // bid deadline (responseDeadLine per Gate 3 enrichment). Render
  // distinctly so the operator doesn't think construction starts then.
  let timingNode: React.ReactNode;
  if (samGovPreAward && project.estimated_start_date) {
    const d = formatDateMMDDYY(project.estimated_start_date);
    timingNode = <Plain>RFP closes {d}</Plain>;
  } else if (project.estimated_start_date && project.estimated_end_date) {
    const s = formatDateMMDDYY(project.estimated_start_date);
    const e = formatDateMMDDYY(project.estimated_end_date);
    const months = monthsBetween(project.estimated_start_date, project.estimated_end_date);
    timingNode = (
      <span style={{ display: 'block' }}>
        <Plain>
          {s} – {e}
        </Plain>
        {months != null && months > 0 && (
          <span
            style={{
              display: 'block',
              font: `400 11px ${PF_TINTS.sans}`,
              color: PF_TINTS.inkDim,
              marginTop: 2,
            }}
          >
            ~{months} months
          </span>
        )}
      </span>
    );
  } else if (project.estimated_start_date) {
    const s = formatDateMMDDYY(project.estimated_start_date);
    timingNode = (
      <span style={{ display: 'block' }}>
        <Plain>{s}</Plain>
        <span
          style={{
            display: 'block',
            font: `400 11px ${PF_TINTS.sans}`,
            color: PF_TINTS.inkDim,
            marginTop: 2,
          }}
        >
          End TBD
        </span>
      </span>
    );
  } else {
    timingNode = <Empty kind={isEnriched ? 'unknown' : 'pending'} />;
  }
  const timingCell = <Cell label="Timing">{timingNode}</Cell>;

  // Cell 7 — Location
  const coords =
    project.lat != null && project.lon != null
      ? `${project.lat.toFixed(4)}, ${project.lon.toFixed(4)}`
      : null;
  const locationCell = (
    <Cell label="Location">
      {project.location_text ? (
        <span style={{ display: 'block' }}>
          <Plain>{project.location_text}</Plain>
          {coords && (
            <span
              style={{
                display: 'block',
                font: `400 11px ${PF_TINTS.mono}`,
                color: PF_TINTS.inkDim,
                marginTop: 2,
              }}
            >
              {coords}
            </span>
          )}
        </span>
      ) : coords ? (
        <span style={{ font: `400 12px ${PF_TINTS.mono}`, color: PF_TINTS.inkDim }}>
          {coords}
        </span>
      ) : (
        <Empty kind={isEnriched ? 'unknown' : 'pending'} />
      )}
    </Cell>
  );

  // Cell 8 — Permit
  const permitLine = project.permit_type
    ? project.permit_number
      ? `${project.permit_type} · ${project.permit_number}`
      : project.permit_type
    : null;
  const permitDate = formatDateMMDDYY(project.permit_filing_date ?? null);
  const hasAnyPermit =
    permitLine || project.permit_jurisdiction || permitDate;
  const permitCell = (
    <Cell label="Permit">
      {hasAnyPermit ? (
        <span style={{ display: 'block' }}>
          {permitLine && <Plain>{permitLine}</Plain>}
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
              Filed {permitDate}
            </span>
          )}
        </span>
      ) : federalContract ? (
        <Empty kind="not-disclosed" detail="federal contract" />
      ) : (
        <Empty kind={isEnriched ? 'unknown' : 'pending'} />
      )}
    </Cell>
  );

  // Cell 9 — Lot Size. Hidden entirely for linear infra (highways /
  // pipelines / etc) where the field is meaningless.
  const lotSizeCell = !linearInfra ? (
    <Cell label="Lot Size">
      {project.lot_size_acres != null ? (
        <Plain>{project.lot_size_acres.toFixed(1)} acres</Plain>
      ) : (
        <Empty kind={isEnriched ? 'unknown' : 'pending'} />
      )}
    </Cell>
  ) : null;

  return (
    <section
      data-testid="quick-facts-grid"
      style={{
        display: 'grid',
        // 3-col on desktop, 2-col on tablet-ish, 1-col on mobile. CSS-in-JS
        // can't carry a media query — the responsive collapse uses
        // grid-template-columns auto-fit + minmax to approximate.
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 16,
        padding: 16,
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
      }}
    >
      {ownerCell}
      {primeCell}
      {valueCell}
      {industryCell}
      {stageCell}
      {timingCell}
      {locationCell}
      {permitCell}
      {lotSizeCell}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Cell primitives
// ────────────────────────────────────────────────────────────────────────

function Cell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div data-testid={`quick-facts-cell-${label.toLowerCase().replace(/\s+/g, '-')}`}>
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

function Plain({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <span style={{ font: `500 14px ${PF_TINTS.sans}`, color: PF_TINTS.ink }}>
      {children}
    </span>
  );
}

function Chip({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <span
      style={{
        background: hexAlpha(color, 0.12),
        border: `1px solid ${hexAlpha(color, 0.5)}`,
        color: PF_TINTS.ink,
        padding: '2px 7px',
        borderRadius: 3,
        font: `600 10px ${PF_TINTS.mono}`,
        letterSpacing: '0.06em',
      }}
    >
      {children}
    </span>
  );
}

// Empty-state renderer. Three kinds (per spec § 3 empty-state rules):
//
//   - "pending"       → not yet enriched (system could fill but didn't try
//                       this lead). Shown when enriched_at is null.
//   - "unknown"       → tried, no data found. Shown when enriched_at is
//                       non-null and the field is still null.
//   - "not-disclosed" → source known not to carry the field
//                       (sam.gov pre-award value, federal-contract permit).
//                       Optional `detail` clarifies why.
//   - "pre-award"     → sam.gov solicitation, no awardee yet (Prime
//                       Contractor cell only). Verbatim spec text.
function Empty({
  kind,
  detail,
}: {
  kind: 'pending' | 'unknown' | 'not-disclosed' | 'pre-award';
  detail?: string;
}): React.ReactElement {
  let text: string;
  switch (kind) {
    case 'pending':
      text = 'Not yet enriched';
      break;
    case 'not-disclosed':
      text = detail ? `Not disclosed (${detail})` : 'Not disclosed';
      break;
    case 'pre-award':
      text = 'Pre-award (no awardee yet)';
      break;
    case 'unknown':
    default:
      // Spec: "—" only as a last resort when the field genuinely doesn't
      // apply. The cell label above is always present, so the operator
      // still sees the field name.
      text = '—';
  }
  return (
    <span
      style={{
        font: `400 13px ${PF_TINTS.sans}`,
        color: PF_TINTS.inkDim,
        fontStyle: kind === 'unknown' ? 'normal' : 'italic',
      }}
    >
      {text}
    </span>
  );
}
