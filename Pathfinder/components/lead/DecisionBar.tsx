'use client';

// components/lead/DecisionBar.tsx — Demo Polish UX Gate 7B (full impl).
//
// Single horizontal strip below the header on the redesigned lead detail
// page. Three responsibilities (per SPEC § 2):
//   1. Verdict line (left) — generated from score + verifier + cross-poll
//   2. Primary CTA (center) — driven by lead's current pipeline stage
//   3. Secondary actions (right) — Send via Gmail / Outlook
//
// Verdict-line + CTA logic encapsulated in pure helpers below the component
// so they're trivially unit-testable (no DOM render needed).

import * as React from 'react';

import type { CrossPollinationMatchRow } from '@/components/zedcor/ZedcorRelationshipContext';
import { PF_TINTS } from '@/lib/agent-tints';
import type { Project } from '@/lib/types';

// Element id on the EmailComposer container — DecisionBar's CTA + Send
// buttons scroll-to-focus this. LeadDetail's RedesignedBody renders the
// composer with this id.
export const EMAIL_COMPOSER_ANCHOR_ID = 'lead-email-composer';

export type VerdictTone = 'strong' | 'speculative' | 'urgent' | 'pending' | 'neutral';

export interface DecisionBarVerdict {
  text: string;
  tone: VerdictTone;
}

export type CTAKind = 'open-outreach' | 'schedule-survey' | 'wait-for-award';

export interface DecisionBarCTA {
  kind: CTAKind;
  label: string;
  /** When true, the button renders as informational (cursor: not-allowed). */
  informational: boolean;
}

interface Props {
  project: Project;
  /** Cross-poll matches; used by the verdict generator and the warm-intro flag. */
  matches?: CrossPollinationMatchRow[];
  /** Optional override — useful for unit tests / deterministic timing. */
  now?: Date;
}

export function DecisionBar({
  project,
  matches = [],
  now = new Date(),
}: Props): React.ReactElement {
  const verdict = generateVerdict(project, matches);
  const cta = generateCTA(project, now);
  const verdictColor = toneToColor(verdict.tone);

  return (
    <section
      data-testid="decision-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '12px 16px',
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
        marginBottom: 18,
      }}
    >
      <div
        data-testid="decision-bar-verdict"
        data-tone={verdict.tone}
        style={{
          font: `500 13px ${PF_TINTS.sans}`,
          color: verdictColor,
          flex: '1 1 auto',
        }}
      >
        {verdict.text}
      </div>
      <div
        data-testid="decision-bar-cta"
        data-cta-kind={cta.kind}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flex: '0 0 auto',
        }}
      >
        <PrimaryCTA cta={cta} />
        <SendButtons />
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Pure helpers — verdict + CTA generation
// ────────────────────────────────────────────────────────────────────────

/**
 * Generate the verdict line per spec § 2 rules. Pure function — exported
 * for unit tests.
 */
export function generateVerdict(
  project: Project,
  matches: CrossPollinationMatchRow[],
): DecisionBarVerdict {
  const score = project.score ?? null;
  const verified = project.verified === true;
  const exactMatches = matches.filter((m) => m.match_layer === 'exact');
  const sites = exactMatches.reduce((sum, m) => sum + (m.active_site_count ?? 0), 0);
  const customer = exactMatches[0]?.customer_canonical
    ? toTitle(exactMatches[0].customer_canonical)
    : null;

  // Rule 1: Strong fit — verified + score ≥ 80 + at least one EXACT match
  if (verified && score != null && score >= 80 && customer && sites > 0) {
    return {
      text: `Strong fit. Verified. ${customer} already serves the customer at ${sites} site${sites === 1 ? '' : 's'}.`,
      tone: 'strong',
    };
  }

  // Rule 2: Speculative — news source with no permit
  if (project.source === 'news' && !project.permit_number) {
    return {
      text: 'Speculative. News mention only, no permit.',
      tone: 'speculative',
    };
  }

  // Rule 3: Pre-bid window closing — sam.gov solicitation w/ start_date
  // (= responseDeadLine) within 30 days of `now`.
  if (project.source === 'sam.gov' && project.estimated_start_date) {
    const deadline = Date.parse(project.estimated_start_date);
    if (!Number.isNaN(deadline)) {
      const days = Math.ceil((deadline - Date.now()) / (1000 * 60 * 60 * 24));
      if (days >= 0 && days <= 30) {
        return {
          text: `Pre-bid window closes in ${days} day${days === 1 ? '' : 's'}.`,
          tone: 'urgent',
        };
      }
    }
  }

  // Rule 4: Pending rank
  if (score == null) {
    return { text: 'Pending rank', tone: 'pending' };
  }

  // Default: neutral concatenation of score + verifier + warm-intro flag
  const parts: string[] = [`Score ${score}`];
  if (verified) parts.push('verified');
  if (matches.length > 0) parts.push('warm intro available');
  return { text: parts.join(' · '), tone: 'neutral' };
}

/**
 * Generate the stage-aware CTA per spec § 2 rules. Pure function — exported
 * for unit tests. `now` injectable for deterministic test runs.
 */
export function generateCTA(project: Project, now: Date = new Date()): DecisionBarCTA {
  // Wait for award notice — sam.gov with no awardee yet
  if (project.source === 'sam.gov' && !project.prime_contractor_name) {
    return { kind: 'wait-for-award', label: 'Wait for award notice', informational: true };
  }

  // Schedule site survey — permit data + start date within 30 days
  if (project.permit_type && project.estimated_start_date) {
    const start = Date.parse(project.estimated_start_date);
    if (!Number.isNaN(start)) {
      const days = Math.ceil((start - now.getTime()) / (1000 * 60 * 60 * 24));
      if (days >= 0 && days <= 30) {
        return { kind: 'schedule-survey', label: 'Schedule site survey', informational: false };
      }
    }
  }

  // Default
  return { kind: 'open-outreach', label: 'Open in Outreach', informational: false };
}

function toneToColor(tone: VerdictTone): string {
  switch (tone) {
    case 'strong':
      return PF_TINTS.ink; // white-on-dark / ink-on-light
    case 'speculative':
      return '#b45309'; // amber
    case 'urgent':
      return '#b91c1c'; // red
    case 'pending':
      return PF_TINTS.inkDim;
    case 'neutral':
    default:
      return PF_TINTS.ink;
  }
}

function toTitle(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

// ────────────────────────────────────────────────────────────────────────
// Internal — primary + send buttons
// ────────────────────────────────────────────────────────────────────────

function scrollToComposer(): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(EMAIL_COMPOSER_ANCHOR_ID);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function PrimaryCTA({ cta }: { cta: DecisionBarCTA }) {
  const onClick = cta.informational ? undefined : scrollToComposer;
  return (
    <button
      type="button"
      data-testid="decision-bar-cta-button"
      onClick={onClick}
      disabled={cta.informational}
      style={{
        background: cta.informational ? 'transparent' : '#9d35ff',
        color: cta.informational ? PF_TINTS.inkDim : '#fff',
        border: cta.informational
          ? `1px solid ${PF_TINTS.ruleSoft}`
          : '1px solid #9d35ff',
        padding: '8px 14px',
        borderRadius: 3,
        font: `500 12px ${PF_TINTS.sans}`,
        cursor: cta.informational ? 'not-allowed' : 'pointer',
        opacity: cta.informational ? 0.7 : 1,
      }}
    >
      {cta.label}
    </button>
  );
}

function SendButtons() {
  return (
    <>
      <button
        type="button"
        data-testid="decision-bar-send-gmail"
        onClick={scrollToComposer}
        style={sendButtonStyle()}
      >
        Send via Gmail
      </button>
      <button
        type="button"
        data-testid="decision-bar-send-outlook"
        onClick={scrollToComposer}
        style={sendButtonStyle()}
      >
        Send via Outlook
      </button>
    </>
  );
}

function sendButtonStyle(): React.CSSProperties {
  return {
    background: 'transparent',
    color: PF_TINTS.inkSub,
    border: `1px solid ${PF_TINTS.ruleSoft}`,
    padding: '6px 10px',
    borderRadius: 3,
    font: `500 11px ${PF_TINTS.sans}`,
    cursor: 'pointer',
  };
}
