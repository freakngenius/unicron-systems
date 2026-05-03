// @vitest-environment jsdom
//
// tests/decision-bar.test.tsx — Demo Polish UX Gate 7B.
//
// Verdict-line matrix + stage-aware CTA matrix per SPEC § 2. Pure helpers
// (`generateVerdict`, `generateCTA`) tested directly so the matrix is
// readable; render tests cover the wiring.

import * as React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import {
  DecisionBar,
  EMAIL_COMPOSER_ANCHOR_ID,
  VERDICT_RENDERED_MARK,
  generateCTA,
  generateVerdict,
} from '@/components/lead/DecisionBar';
import type { CrossPollinationMatchRow } from '@/components/zedcor/ZedcorRelationshipContext';
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
    score: null,
    nearest_branch_id: null,
    distance_miles: null,
    outreach_hook: null,
    warm_for_customer_id: null,
    ingested_at: '2026-04-21T00:00:00Z',
    ranked_at: null,
    ...overrides,
  };
}

function exactMatch(overrides: Partial<CrossPollinationMatchRow> = {}): CrossPollinationMatchRow {
  return {
    id: 'm',
    customer_canonical: 'memorial hermann',
    customer_org_id: 'mh',
    match_layer: 'exact',
    match_confidence: 0.95,
    primary_branch_id: 'b1',
    primary_branch_name: 'Houston',
    branch_count: 1,
    active_site_count: 3,
    most_recent_site_date: '2025-12-01',
    national_account: false,
    matched_field: 'project_owner',
    matched_value_raw: 'Memorial Hermann',
    ...overrides,
  };
}

describe('generateVerdict — Strong fit rule', () => {
  it('renders Strong fit when verified + score ≥ 80 + exact-match cross-poll with sites', () => {
    const v = generateVerdict(
      baseProject({ verified: true, score: 92 }),
      [exactMatch({ active_site_count: 3 })],
    );
    expect(v.tone).toBe('strong');
    expect(v.text).toContain('Strong fit');
    expect(v.text).toContain('Memorial Hermann');
    expect(v.text).toContain('3 sites');
  });

  it('does NOT trigger Strong fit when score is 79 (below threshold)', () => {
    const v = generateVerdict(
      baseProject({ verified: true, score: 79 }),
      [exactMatch()],
    );
    expect(v.tone).not.toBe('strong');
  });

  it('singularizes "site" when only one active site', () => {
    const v = generateVerdict(
      baseProject({ verified: true, score: 90 }),
      [exactMatch({ active_site_count: 1 })],
    );
    expect(v.text).toContain('1 site.');
    expect(v.text).not.toContain('1 sites');
  });
});

describe('generateVerdict — Speculative rule', () => {
  it('renders Speculative for news source with no permit', () => {
    const v = generateVerdict(baseProject({ source: 'news', permit_number: null }), []);
    expect(v.tone).toBe('speculative');
    expect(v.text).toContain('Speculative');
    expect(v.text).toContain('News mention');
  });

  it('does NOT trigger Speculative when news source has a permit', () => {
    const v = generateVerdict(baseProject({ source: 'news', permit_number: 'P-1' }), []);
    expect(v.tone).not.toBe('speculative');
  });
});

describe('generateVerdict — Pre-bid window closing rule', () => {
  it('renders urgent verdict when sam.gov deadline within 30 days', () => {
    const future = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
    const v = generateVerdict(
      baseProject({ source: 'sam.gov', estimated_start_date: future }),
      [],
    );
    expect(v.tone).toBe('urgent');
    expect(v.text).toContain('14 day');
  });

  it('does NOT trigger urgent when deadline beyond 30 days', () => {
    const future = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);
    const v = generateVerdict(
      baseProject({ source: 'sam.gov', estimated_start_date: future }),
      [],
    );
    expect(v.tone).not.toBe('urgent');
  });

  it('does NOT trigger urgent when deadline already passed', () => {
    const past = new Date(Date.now() - 5 * 86400_000).toISOString().slice(0, 10);
    const v = generateVerdict(
      baseProject({ source: 'sam.gov', estimated_start_date: past }),
      [],
    );
    expect(v.tone).not.toBe('urgent');
  });
});

describe('generateVerdict — fallback paths', () => {
  it('renders "Pending rank" when score is null', () => {
    const v = generateVerdict(baseProject({ score: null }), []);
    expect(v.tone).toBe('pending');
    expect(v.text).toBe('Pending rank');
  });

  it('renders neutral score-based verdict otherwise', () => {
    const v = generateVerdict(
      baseProject({ source: 'usaspending', score: 70, verified: true }),
      [exactMatch()],
    );
    expect(v.tone).toBe('neutral');
    expect(v.text).toContain('Score 70');
    expect(v.text).toContain('verified');
    expect(v.text).toContain('warm intro available');
  });
});

describe('generateCTA — stage-aware CTA matrix', () => {
  it('returns "Wait for award notice" for sam.gov pre-award', () => {
    const cta = generateCTA(baseProject({ source: 'sam.gov', prime_contractor_name: null }));
    expect(cta.kind).toBe('wait-for-award');
    expect(cta.informational).toBe(true);
  });

  it('returns "Schedule site survey" when permit + start date within 30 days', () => {
    const start = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
    const cta = generateCTA(
      baseProject({
        source: 'harris',
        prime_contractor_name: 'Acme',
        permit_type: 'commercial-renovation',
        estimated_start_date: start,
      }),
    );
    expect(cta.kind).toBe('schedule-survey');
  });

  it('falls back to "Open in Outreach" when no other rule matches', () => {
    const cta = generateCTA(baseProject({ source: 'harris', prime_contractor_name: 'Acme' }));
    expect(cta.kind).toBe('open-outreach');
  });
});

describe('DecisionBar render — verdict + CTA wiring', () => {
  it('exposes data-tone attribute matching generated verdict tone', () => {
    render(<DecisionBar project={baseProject({ source: 'news', permit_number: null })} matches={[]} />);
    expect(screen.getByTestId('decision-bar-verdict')).toHaveAttribute('data-tone', 'speculative');
  });

  it('exposes data-cta-kind attribute matching generated CTA', () => {
    render(<DecisionBar project={baseProject({ source: 'sam.gov', prime_contractor_name: null })} matches={[]} />);
    expect(screen.getByTestId('decision-bar-cta')).toHaveAttribute('data-cta-kind', 'wait-for-award');
  });

  it('CTA button is disabled when CTA is informational (Wait for award notice)', () => {
    render(<DecisionBar project={baseProject({ source: 'sam.gov', prime_contractor_name: null })} matches={[]} />);
    expect(screen.getByTestId('decision-bar-cta-button')).toBeDisabled();
  });

  it('clicking the CTA scrolls to the EmailComposer anchor element', () => {
    const composer = document.createElement('div');
    composer.id = EMAIL_COMPOSER_ANCHOR_ID;
    composer.scrollIntoView = vi.fn();
    document.body.appendChild(composer);

    render(<DecisionBar project={baseProject({ source: 'harris', prime_contractor_name: 'Acme' })} matches={[]} />);
    fireEvent.click(screen.getByTestId('decision-bar-cta-button'));
    expect(composer.scrollIntoView).toHaveBeenCalled();

    document.body.removeChild(composer);
  });

  it('always renders Send via Gmail and Send via Outlook buttons', () => {
    render(<DecisionBar project={baseProject()} matches={[]} />);
    expect(screen.getByTestId('decision-bar-send-gmail')).toBeInTheDocument();
    expect(screen.getByTestId('decision-bar-send-outlook')).toBeInTheDocument();
  });
});

// ────────────────────────────────────────────────────────────────────────
// Gate 7C — verdict-line ≤ 200 ms acceptance criterion #4 instrumentation
// ────────────────────────────────────────────────────────────────────────
//
// Speed Insights / Web Vitals isn't wired in this codebase as of 7C. Per
// operator dispatch, the criterion is deferred. These tests assert the
// underlying constraint that makes the criterion satisfiable: DecisionBar
// renders fully synchronously (no Suspense, no async data hook) and emits a
// performance.mark for future Speed Insights to consume.

describe('DecisionBar — synchronous render (acceptance #4 underlying constraint)', () => {
  it('renders verdict line in the same synchronous render as mount (no Suspense / no async)', () => {
    render(<DecisionBar project={baseProject({ score: 80, verified: true })} matches={[]} />);
    // If render were async / suspended, verdict element wouldn't be in the
    // DOM after the synchronous render call. Asserting presence post-render
    // proves DecisionBar is fully sync.
    expect(screen.getByTestId('decision-bar-verdict')).toBeInTheDocument();
  });

  it('emits performance.mark for verdict-rendered after first paint', () => {
    if (typeof performance === 'undefined') return; // node-only env guard
    performance.clearMarks(VERDICT_RENDERED_MARK);
    render(<DecisionBar project={baseProject()} matches={[]} />);
    const marks = performance.getEntriesByName(VERDICT_RENDERED_MARK);
    expect(marks.length).toBe(1);
  });

  it('does not double-mark across re-renders within the same session', () => {
    if (typeof performance === 'undefined') return;
    performance.clearMarks(VERDICT_RENDERED_MARK);
    const { rerender } = render(
      <DecisionBar project={baseProject({ score: 70 })} matches={[]} />,
    );
    rerender(<DecisionBar project={baseProject({ score: 80 })} matches={[]} />);
    rerender(<DecisionBar project={baseProject({ score: 90 })} matches={[]} />);
    const marks = performance.getEntriesByName(VERDICT_RENDERED_MARK);
    expect(marks.length).toBe(1);
  });
});
