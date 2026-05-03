// @vitest-environment jsdom
//
// tests/lead-detail-redesign-stubs.test.tsx — Demo Polish UX Gate 7A.
//
// Smoke tests for the 6 stub components that render alongside the full
// QuickFactsGrid in the redesigned LeadDetail layout. Each stub must:
//   1. Render without crashing
//   2. Honor the spec's "hide entirely when empty" rules where applicable
//
// Full-behavior tests for these components land alongside their full
// implementations in Gate 7B / 7C.

import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { CrossPollinationCard } from '@/components/lead/CrossPollinationCard';
import { DecisionBar } from '@/components/lead/DecisionBar';
import { ProjectStory } from '@/components/lead/ProjectStory';
import { RecommendedAction } from '@/components/lead/RecommendedAction';
import { ScoreBreakdown } from '@/components/lead/ScoreBreakdown';
import { SourceCitations } from '@/components/lead/SourceCitations';
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
    score: 80,
    nearest_branch_id: null,
    distance_miles: null,
    outreach_hook: null,
    warm_for_customer_id: null,
    ingested_at: '2026-04-21T00:00:00Z',
    ranked_at: null,
    verified: true,
    ...overrides,
  };
}

describe('DecisionBar (stub)', () => {
  it('renders verdict line including score + verifier when set', () => {
    render(<DecisionBar project={baseProject({ score: 92, verified: true })} hasCrossPollMatches={false} />);
    expect(screen.getByTestId('decision-bar-verdict')).toHaveTextContent(/Score 92/);
    expect(screen.getByTestId('decision-bar-verdict')).toHaveTextContent(/verified/);
  });

  it('includes "warm intro available" when hasCrossPollMatches is true', () => {
    render(<DecisionBar project={baseProject()} hasCrossPollMatches={true} />);
    expect(screen.getByTestId('decision-bar-verdict')).toHaveTextContent(/warm intro/);
  });

  it('falls back to "Pending rank" when score is null and not verified', () => {
    render(<DecisionBar project={baseProject({ score: null, verified: null })} hasCrossPollMatches={false} />);
    expect(screen.getByTestId('decision-bar-verdict')).toHaveTextContent(/Pending rank/);
  });
});

describe('CrossPollinationCard (stub)', () => {
  it('renders nothing when matches array is empty (per spec § 4)', () => {
    const { container } = render(<CrossPollinationCard matches={[]} targetRegion={null} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('RecommendedAction (stub)', () => {
  it('renders nothing in 7A (parse-rationale always falls back)', () => {
    const { container } = render(<RecommendedAction project={baseProject({ rationale: 'Call them.' })} />);
    // 7A: stub returns null when fallback === true, which is always.
    expect(container.firstChild).toBeNull();
  });
});

describe('ProjectStory (stub)', () => {
  it('renders description_long when present', () => {
    render(
      <ProjectStory
        project={baseProject({
          description_long: 'A detailed multi-sentence description of the project.',
        })}
      />,
    );
    expect(
      screen.getByTestId('project-story-description'),
    ).toHaveTextContent(/detailed multi-sentence/);
  });

  it('falls back to summary when description_long is null', () => {
    render(<ProjectStory project={baseProject({ summary: 'short summary' })} />);
    expect(screen.getByTestId('project-story-description')).toHaveTextContent('short summary');
  });

  it('renders monolithic rationale fallback block when rationale present', () => {
    render(<ProjectStory project={baseProject({ rationale: 'Strong fit. Verified.' })} />);
    expect(
      screen.getByTestId('project-story-rationale-fallback'),
    ).toHaveTextContent('Strong fit. Verified.');
  });
});

describe('ScoreBreakdown (stub)', () => {
  it('renders the score in the toggle label', () => {
    render(<ScoreBreakdown project={baseProject({ score: 87 })} />);
    expect(screen.getByTestId('score-breakdown-toggle')).toHaveTextContent(/87/);
  });

  it('hides detail by default and reveals on click', () => {
    render(<ScoreBreakdown project={baseProject({ score: 87 })} />);
    expect(screen.queryByTestId('score-breakdown-detail')).toBeNull();
    fireEvent.click(screen.getByTestId('score-breakdown-toggle'));
    expect(screen.getByTestId('score-breakdown-detail')).toBeInTheDocument();
  });
});

describe('SourceCitations', () => {
  it('renders nothing when enrichment_citations is null', () => {
    const { container } = render(<SourceCitations project={baseProject()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when enrichment_citations is empty array', () => {
    const { container } = render(
      <SourceCitations project={baseProject({ enrichment_citations: [] })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders hostnames as anchor links when citations are present', () => {
    render(
      <SourceCitations
        project={baseProject({
          enrichment_citations: [
            { url: 'https://sam.gov/opp/TXDOT-I45-2026-001', fact_supported: 'owner', confidence: 0.95 },
            { url: 'https://txdot.gov/news/i45-corridor', fact_supported: 'description', confidence: 0.8 },
          ],
        })}
      />,
    );
    expect(screen.getByText('sam.gov')).toBeInTheDocument();
    expect(screen.getByText('txdot.gov')).toBeInTheDocument();
  });
});
