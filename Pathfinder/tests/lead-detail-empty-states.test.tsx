// @vitest-environment jsdom
//
// tests/lead-detail-empty-states.test.tsx — Demo Polish UX Gate 7B.
//
// Page-level empty states per SPEC § "Empty states (page-level)":
//   - Lead is rejected → muted state + rejection-reason banner
//   - Lead has score but no enrichment → "Request enrichment" banner
//   - Lead has no rationale + no score → ScoreBreakdown suppressed

import * as React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { LeadDetail } from '@/components/lead/LeadDetail';
import type { Project } from '@/lib/types';

afterEach(() => cleanup());

function baseProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p',
    source: 'sam.gov',
    source_id: 'X',
    title: 'Test project',
    summary: null,
    lat: null,
    lon: null,
    project_value: null,
    project_stage: null,
    posted_date: null,
    raw_payload: null,
    rationale: 'Strong solicitation. Worth a 30-minute call this week.',
    rationale_streamed_at: null,
    score: 80,
    nearest_branch_id: null,
    distance_miles: null,
    outreach_hook: null,
    warm_for_customer_id: null,
    ingested_at: '2026-04-21T00:00:00Z',
    ranked_at: null,
    enriched_at: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

function renderRedesigned(project: Project) {
  return render(
    <LeadDetail
      project={project}
      latestEmailDraft={null}
      contacts={[]}
      recentEdits={[]}
      timelineEvents={[]}
      crossPollMatches={[]}
      zedcorBranch={null}
      redesignEnabled={true}
    />,
  );
}

describe('LeadDetail — rejected state', () => {
  it('renders the rejection banner when project.rejection_reason is set', () => {
    renderRedesigned(
      baseProject({
        rejection_reason: 'out_of_country',
        rejected_at: '2026-04-30T00:00:00Z',
      }),
    );
    const banner = screen.getByTestId('lead-detail-rejected-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/out_of_country/);
    expect(banner).toHaveTextContent(/2026-04-30/);
  });

  it('applies a muted opacity (0.6) to the redesigned body when rejected', () => {
    renderRedesigned(baseProject({ rejection_reason: 'no_branch_coverage' }));
    const body = screen.getByTestId('lead-detail-redesigned');
    expect(body).toHaveAttribute('data-rejected', 'true');
    expect(body.style.opacity).toBe('0.6');
  });

  it('does NOT render the rejection banner when rejection_reason is null', () => {
    renderRedesigned(baseProject({ rejection_reason: null }));
    expect(screen.queryByTestId('lead-detail-rejected-banner')).toBeNull();
  });
});

describe('LeadDetail — enrichment request banner', () => {
  it('renders the banner when score is set but enriched_at is null', () => {
    renderRedesigned(baseProject({ score: 75, enriched_at: null }));
    expect(screen.getByTestId('lead-detail-enrichment-banner')).toBeInTheDocument();
  });

  it('does NOT render the banner when enriched_at is set', () => {
    renderRedesigned(baseProject({ score: 75, enriched_at: '2026-05-01T00:00:00Z' }));
    expect(screen.queryByTestId('lead-detail-enrichment-banner')).toBeNull();
  });

  it('does NOT render the banner when score is null', () => {
    renderRedesigned(baseProject({ score: null, enriched_at: null }));
    expect(screen.queryByTestId('lead-detail-enrichment-banner')).toBeNull();
  });

  it('does NOT render the banner when rejected (rejection state owns the page)', () => {
    renderRedesigned(
      baseProject({ score: 75, enriched_at: null, rejection_reason: 'out_of_country' }),
    );
    expect(screen.queryByTestId('lead-detail-enrichment-banner')).toBeNull();
  });

  it('clicking the request-enrichment link triggers an alert (Gate 8 placeholder)', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    renderRedesigned(baseProject({ id: 'project-xyz', score: 75, enriched_at: null }));
    fireEvent.click(screen.getByTestId('lead-detail-enrichment-request-link'));
    expect(alertSpy).toHaveBeenCalled();
    expect(alertSpy.mock.calls[0][0]).toContain('project-xyz');
    alertSpy.mockRestore();
  });
});

describe('LeadDetail — pending-rank suppression', () => {
  it('does NOT render ScoreBreakdown when both rationale and score are null', () => {
    renderRedesigned(baseProject({ rationale: null, score: null }));
    expect(screen.queryByTestId('score-breakdown')).toBeNull();
  });

  it('renders ScoreBreakdown when score is present even if rationale is null', () => {
    renderRedesigned(baseProject({ rationale: null, score: 70 }));
    expect(screen.getByTestId('score-breakdown')).toBeInTheDocument();
  });
});

describe('LeadDetail — flag-off path is unchanged', () => {
  it('does NOT render the redesigned body when flag is off', () => {
    render(
      <LeadDetail
        project={baseProject()}
        latestEmailDraft={null}
        contacts={[]}
        recentEdits={[]}
        timelineEvents={[]}
        crossPollMatches={[]}
        zedcorBranch={null}
        redesignEnabled={false}
      />,
    );
    expect(screen.queryByTestId('lead-detail-redesigned')).toBeNull();
  });
});
