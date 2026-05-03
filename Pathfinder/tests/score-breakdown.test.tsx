// @vitest-environment jsdom
//
// tests/score-breakdown.test.tsx — Demo Polish UX Gate 7C.
//
// ScoreBreakdown is collapsed by default (per spec § 7 — most reps don't
// drill in). Tests cover: composite-only collapsed shell, expand toggle,
// per-component rows + weights + contributions, total row, per-component
// rationale toggle, fallback path when no breakdown was computable.

import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { ScoreBreakdown } from '@/components/lead/ScoreBreakdown';
import type { ScoringOutput } from '@/lib/scoring';
import type { Project } from '@/lib/types';

afterEach(() => cleanup());

function baseProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p',
    source: 'sam.gov',
    source_id: 'X',
    title: 't',
    summary: null,
    lat: null,
    lon: null,
    project_value: null,
    project_stage: null,
    posted_date: null,
    raw_payload: null,
    rationale: null,
    rationale_streamed_at: null,
    score: 87,
    nearest_branch_id: null,
    distance_miles: null,
    outreach_hook: null,
    warm_for_customer_id: null,
    ingested_at: '2026-04-21T00:00:00Z',
    ranked_at: null,
    ...overrides,
  };
}

function breakdown(overrides: Partial<ScoringOutput> = {}): ScoringOutput {
  return {
    nearest_branch_id: 'b1',
    distance_miles: 12,
    in_coverage: true,
    warm_for_customer_id: null,
    geo_score: 90,
    stage_score: 80,
    customer_score: 70,
    composite_score: 83,
    ...overrides,
  };
}

describe('ScoreBreakdown — collapsed default', () => {
  it('shows composite score in the toggle label', () => {
    render(<ScoreBreakdown project={baseProject()} breakdown={breakdown()} />);
    // Composite from breakdown takes precedence over project.score.
    expect(screen.getByTestId('score-breakdown-toggle')).toHaveTextContent(/83/);
  });

  it('falls back to project.score when no breakdown provided', () => {
    render(<ScoreBreakdown project={baseProject({ score: 75 })} />);
    expect(screen.getByTestId('score-breakdown-toggle')).toHaveTextContent(/75/);
  });

  it('hides detail by default', () => {
    render(<ScoreBreakdown project={baseProject()} breakdown={breakdown()} />);
    expect(screen.queryByTestId('score-breakdown-detail')).toBeNull();
  });
});

describe('ScoreBreakdown — expanded with breakdown', () => {
  function open(): void {
    fireEvent.click(screen.getByTestId('score-breakdown-toggle'));
  }

  it('renders three component rows + total row when expanded', () => {
    render(<ScoreBreakdown project={baseProject()} breakdown={breakdown()} />);
    open();
    expect(screen.getByTestId('score-breakdown-row-geo_score')).toBeInTheDocument();
    expect(screen.getByTestId('score-breakdown-row-stage_score')).toBeInTheDocument();
    expect(screen.getByTestId('score-breakdown-row-customer_score')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('shows component scores + weights + contributions', () => {
    render(<ScoreBreakdown project={baseProject()} breakdown={breakdown({ geo_score: 100, stage_score: 50, customer_score: 0, composite_score: 65 })} />);
    open();
    const geoRow = screen.getByTestId('score-breakdown-row-geo_score');
    expect(geoRow).toHaveTextContent('Geographic fit');
    expect(geoRow).toHaveTextContent('100');
    expect(geoRow).toHaveTextContent('50%');
    // contribution = 100 * 0.5 = 50
    expect(geoRow).toHaveTextContent('+50');

    const stageRow = screen.getByTestId('score-breakdown-row-stage_score');
    expect(stageRow).toHaveTextContent('Stage');
    expect(stageRow).toHaveTextContent('30%');
    // contribution = 50 * 0.3 = 15
    expect(stageRow).toHaveTextContent('+15');

    const custRow = screen.getByTestId('score-breakdown-row-customer_score');
    expect(custRow).toHaveTextContent('Customer adjacency');
    expect(custRow).toHaveTextContent('20%');
    // contribution = 0 * 0.2 = 0
    expect(custRow).toHaveTextContent('+0');
  });

  it('per-component rationale row toggles open/closed on click', () => {
    render(<ScoreBreakdown project={baseProject()} breakdown={breakdown()} />);
    open();
    expect(screen.queryByTestId('score-breakdown-row-geo_score-rationale')).toBeNull();
    fireEvent.click(screen.getByTestId('score-breakdown-row-geo_score'));
    expect(screen.getByTestId('score-breakdown-row-geo_score-rationale')).toBeInTheDocument();
    // Click again collapses
    fireEvent.click(screen.getByTestId('score-breakdown-row-geo_score'));
    expect(screen.queryByTestId('score-breakdown-row-geo_score-rationale')).toBeNull();
  });

  it('only one rationale row open at a time (mutually exclusive)', () => {
    render(<ScoreBreakdown project={baseProject()} breakdown={breakdown()} />);
    open();
    fireEvent.click(screen.getByTestId('score-breakdown-row-geo_score'));
    expect(screen.getByTestId('score-breakdown-row-geo_score-rationale')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('score-breakdown-row-stage_score'));
    expect(screen.queryByTestId('score-breakdown-row-geo_score-rationale')).toBeNull();
    expect(screen.getByTestId('score-breakdown-row-stage_score-rationale')).toBeInTheDocument();
  });
});

describe('ScoreBreakdown — fallback path when breakdown unavailable', () => {
  it('renders the explanatory fallback when expanded with no breakdown', () => {
    render(<ScoreBreakdown project={baseProject({ score: 60 })} />);
    fireEvent.click(screen.getByTestId('score-breakdown-toggle'));
    const detail = screen.getByTestId('score-breakdown-detail');
    expect(detail).toHaveTextContent(/breakdown unavailable/i);
    // Fallback path doesn't render component rows.
    expect(screen.queryByTestId('score-breakdown-row-geo_score')).toBeNull();
  });
});
