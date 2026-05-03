'use client';

// components/lead/ScoreBreakdown.tsx — Demo Polish UX Gate 7C (full impl).
//
// Section 7 of the redesigned lead detail page (per SPEC § 7). Per-component
// score breakdown with weights + contribution to total. Default collapsed —
// most reps don't drill in; sales managers expand.
//
// Data path: `pathfinder.score_components` doesn't exist. The Ranker writes
// only `composite_score` to `projects.score`. To show the breakdown, the
// page route re-runs `lib/scoring.ts:scoreProject()` with the project +
// branches + customers (small data) and passes the resulting `ScoringOutput`
// as the `breakdown` prop. When `breakdown` is null (recompute couldn't run
// — e.g., project missing lat/lon), we render the collapsed composite-only
// shell.
//
// Future: persist the per-component scores on `pathfinder.projects` so the
// recompute isn't needed on every page load. Tracked as operator-todo
// `2026-05-03-pathfinder-persist-score-components.md`.

import * as React from 'react';

import { PF_TINTS } from '@/lib/agent-tints';
import type { ScoringOutput } from '@/lib/scoring';
import type { Project } from '@/lib/types';

// Weights mirror the constants in `lib/scoring.ts:scoreProject` —
// composite = 0.5*geo + 0.3*stage + 0.2*customer.
const WEIGHTS: Array<{
  key: 'geo_score' | 'stage_score' | 'customer_score';
  label: string;
  weight: number;
  rationale: string;
}> = [
  {
    key: 'geo_score',
    label: 'Geographic fit',
    weight: 0.5,
    rationale: 'Distance from project to nearest branch, scaled against the branch coverage radius.',
  },
  {
    key: 'stage_score',
    label: 'Stage',
    weight: 0.3,
    rationale: 'Project stage maturity (RFP > Pre-bid > Planning > News).',
  },
  {
    key: 'customer_score',
    label: 'Customer adjacency',
    weight: 0.2,
    rationale: 'Proximity to an existing customer site (cross-pollination signal).',
  },
];

interface Props {
  project: Project;
  /** Pre-computed scoring breakdown from page-route's scoreProject() call. */
  breakdown?: ScoringOutput | null;
}

export function ScoreBreakdown({ project, breakdown = null }: Props): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const composite = breakdown?.composite_score ?? project.score ?? null;
  // Track which component row's rationale is expanded (-1 = none).
  const [expandedRow, setExpandedRow] = React.useState<number>(-1);

  return (
    <section
      data-testid="score-breakdown"
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
        padding: 14,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="score-breakdown-toggle"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: PF_TINTS.inkSub,
        }}
      >
        <span
          style={{
            font: `600 11px ${PF_TINTS.sans}`,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          Score breakdown {composite != null ? `· ${composite}` : ''}
        </span>
        <span style={{ font: `500 11px ${PF_TINTS.mono}` }}>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div data-testid="score-breakdown-detail" style={{ marginTop: 10 }}>
          {breakdown ? (
            <>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  font: `400 12px ${PF_TINTS.sans}`,
                  color: PF_TINTS.ink,
                }}
              >
                <thead>
                  <tr>
                    <Th>Component</Th>
                    <Th align="right">Score</Th>
                    <Th align="right">Weight</Th>
                    <Th align="right">Contribution</Th>
                  </tr>
                </thead>
                <tbody>
                  {WEIGHTS.map((w, i) => {
                    const score = breakdown[w.key];
                    const contribution = Math.round(score * w.weight);
                    const isExpanded = expandedRow === i;
                    return (
                      <React.Fragment key={w.key}>
                        <tr
                          data-testid={`score-breakdown-row-${w.key}`}
                          onClick={() => setExpandedRow(isExpanded ? -1 : i)}
                          style={{
                            cursor: 'pointer',
                            borderBottom: `1px solid ${PF_TINTS.ruleHair}`,
                          }}
                        >
                          <Td>{w.label}</Td>
                          <Td align="right">{score}</Td>
                          <Td align="right">{Math.round(w.weight * 100)}%</Td>
                          <Td align="right" mono>
                            +{contribution}
                          </Td>
                        </tr>
                        {isExpanded && (
                          <tr data-testid={`score-breakdown-row-${w.key}-rationale`}>
                            <td
                              colSpan={4}
                              style={{
                                padding: '6px 4px 10px',
                                font: `400 italic 11px/1.5 ${PF_TINTS.sans}`,
                                color: PF_TINTS.inkSub,
                              }}
                            >
                              {w.rationale}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  <tr style={{ borderTop: `2px solid ${PF_TINTS.ruleSoft}` }}>
                    <Td>
                      <strong>Total</strong>
                    </Td>
                    <Td align="right">—</Td>
                    <Td align="right">100%</Td>
                    <Td align="right" mono>
                      <strong>{breakdown.composite_score}</strong>
                    </Td>
                  </tr>
                </tbody>
              </table>
              <div
                style={{
                  marginTop: 10,
                  font: `400 italic 11px ${PF_TINTS.sans}`,
                  color: PF_TINTS.inkDim,
                }}
              >
                Click any component row for an explanation of how that score is computed.
              </div>
            </>
          ) : (
            <div
              style={{
                font: `400 italic 12px ${PF_TINTS.sans}`,
                color: PF_TINTS.inkDim,
              }}
            >
              Per-component breakdown unavailable — project missing geographic
              data required to recompute.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}): React.ReactElement {
  return (
    <th
      style={{
        textAlign: align,
        padding: '6px 4px',
        font: `600 10px ${PF_TINTS.sans}`,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: PF_TINTS.inkDim,
        borderBottom: `1px solid ${PF_TINTS.ruleSoft}`,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  mono = false,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  mono?: boolean;
}): React.ReactElement {
  return (
    <td
      style={{
        textAlign: align,
        padding: '6px 4px',
        font: mono ? `500 12px ${PF_TINTS.mono}` : `400 12px ${PF_TINTS.sans}`,
      }}
    >
      {children}
    </td>
  );
}
