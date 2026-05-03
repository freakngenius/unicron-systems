'use client';

// components/lead/ProjectStory.tsx — Demo Polish UX Gate 7A.
//
// Section 6 of the redesigned lead detail page. Two sub-sections (per
// SPEC § 6):
//   - Description (description_long, fall back to summary)
//   - Why this lead (rationale split into fit / market / geography)
//
// Gate 7A scope: minimal. Renders Description correctly (cheap; pure data).
// "Why this lead" structured render is parse-rationale-dependent — 7A
// shows the monolithic rationale text de-emphasized per spec fallback rule.

import * as React from 'react';

import { parseRationale } from '@/lib/leads/parse-rationale';
import { PF_TINTS } from '@/lib/agent-tints';
import type { Project } from '@/lib/types';

interface Props {
  project: Project;
}

export function ProjectStory({ project }: Props): React.ReactElement {
  const description = project.description_long ?? project.summary ?? null;
  const parsed = parseRationale(project.rationale);

  return (
    <section
      data-testid="project-story"
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
        padding: 14,
      }}
    >
      <h3
        style={{
          margin: '0 0 8px',
          font: `600 11px ${PF_TINTS.sans}`,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: PF_TINTS.inkSub,
        }}
      >
        Project story
      </h3>

      {description && (
        <div
          data-testid="project-story-description"
          style={{
            font: `400 13px/1.5 ${PF_TINTS.sans}`,
            color: PF_TINTS.ink,
            marginBottom: parsed.monolithic ? 12 : 0,
          }}
        >
          {description}
        </div>
      )}

      {parsed.fallback && parsed.monolithic && (
        <div
          data-testid="project-story-rationale-fallback"
          style={{
            font: `400 12px/1.5 ${PF_TINTS.sans}`,
            color: PF_TINTS.inkSub,
            whiteSpace: 'pre-wrap',
          }}
        >
          {parsed.monolithic}
        </div>
      )}

      {!parsed.fallback && (
        <div data-testid="project-story-structured">
          {parsed.fitWithProductMix && (
            <p style={{ margin: '8px 0', font: `400 13px/1.5 ${PF_TINTS.sans}`, color: PF_TINTS.ink }}>
              <strong>Fit:</strong> {parsed.fitWithProductMix}
            </p>
          )}
          {parsed.marketSignalStrength && (
            <p style={{ margin: '8px 0', font: `400 13px/1.5 ${PF_TINTS.sans}`, color: PF_TINTS.ink }}>
              <strong>Market signal:</strong> {parsed.marketSignalStrength}
            </p>
          )}
          {parsed.geographicFit && (
            <p style={{ margin: '8px 0', font: `400 13px/1.5 ${PF_TINTS.sans}`, color: PF_TINTS.ink }}>
              <strong>Geography:</strong> {parsed.geographicFit}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
