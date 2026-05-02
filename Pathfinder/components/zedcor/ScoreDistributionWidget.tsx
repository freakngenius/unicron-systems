// Z-D Wave 3 (#12) — Score distribution summary widget.
//
// TUESDAY DEMO PLAN.md item 12: render the per-branch ranked-lead score
// distribution as a top-of-page header card on the Zedcor lead list. Three
// target branches per the demo plan: Nashville TN, Pittsburgh PA
// (`branch_name='Pennsylvania'` in the seed — operator note in
// `lib/zedcor/branch-centroids.ts`), and Los Angeles CA.
//
// Server component. Pure presentation; data fetched in
// `app/zedcor/leads/page.tsx` via a single SQL aggregate.

import * as React from 'react';

const BG = 'rgba(91, 127, 255, 0.06)';
const BORDER = 'rgba(91, 127, 255, 0.20)';
const TEXT = '#e6e9ef';
const TEXT_MUTED = '#9aa3b2';
const ACCENT = '#5B7FFF';
const HI = '#FFB454';
const GREEN = '#3DDC97';
const MONO = 'var(--font-jetbrains-mono), ui-monospace, monospace';

export interface BranchScoreDistribution {
  /** Branch display label, e.g. "Nashville, TN". */
  label: string;
  /** Total leads ingested in last 7 days. */
  total: number;
  /** Score >= 90. */
  gte90: number;
  /** 80 <= score < 90. */
  ge80lt90: number;
  /** Score < 80 (and not null). */
  lt80: number;
}

export interface ScoreDistributionWidgetProps {
  branches: BranchScoreDistribution[];
}

export function ScoreDistributionWidget({ branches }: ScoreDistributionWidgetProps) {
  return (
    <section
      style={{
        background: BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        padding: '14px 18px',
        marginBottom: 16,
        display: 'grid',
        gridTemplateColumns: `repeat(${branches.length}, minmax(0, 1fr))`,
        gap: 16,
      }}
      aria-label="7-day score distribution by demo branch"
    >
      {branches.map((b) => (
        <BranchSummary key={b.label} branch={b} />
      ))}
    </section>
  );
}

function BranchSummary({ branch }: { branch: BranchScoreDistribution }) {
  // Exact rendered text — captured verbatim in the PR body.
  const summary = renderSummaryText(branch);
  return (
    <div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 11,
          letterSpacing: '0.10em',
          color: TEXT_MUTED,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {branch.label}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.45, color: TEXT }}>
        {summary}
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 11,
          color: TEXT_MUTED,
          marginTop: 6,
          display: 'flex',
          gap: 12,
        }}
      >
        <span>
          <span style={{ color: HI }}>●</span> ≥90: {branch.gte90}
        </span>
        <span>
          <span style={{ color: ACCENT }}>●</span> ≥80: {branch.ge80lt90}
        </span>
        <span>
          <span style={{ color: GREEN }}>●</span> &lt;80: {branch.lt80}
        </span>
      </div>
    </div>
  );
}

/** The exact plain-language line spec'd in TUESDAY DEMO PLAN.md item 12.
 * Exported so tests / PR-body capture can re-render it deterministically. */
export function renderSummaryText(b: BranchScoreDistribution): string {
  // The brief says: "X leads ingested in last 7 days. Y above score 90.
  // Z above 80. W below 80." The "above 80" line in the brief is the
  // 80-89 bucket — explicit so reviewers can read the gradient.
  return `${b.total} leads ingested in last 7 days. ${b.gte90} above score 90. ${b.ge80lt90} above 80. ${b.lt80} below 80.`;
}
