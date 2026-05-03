'use client';

// components/lead/SourceCitations.tsx — Demo Polish UX Gate 7A.
//
// Section 11 (footer) of the redesigned lead detail page. Lists every source
// URL the agent used to enrich this lead (per SPEC § 11).
//
// Reads `pathfinder.projects.enrichment_citations` (jsonb column added by
// migration 0111). Shape per row: { url, fact_supported, confidence }.
//
// Gate 7A scope: full render. The data is empty until the enricher is
// updated to write citations (deferred to a future enrichment-spec gate),
// but the component handles empty + populated states correctly today.

import * as React from 'react';

import { PF_TINTS } from '@/lib/agent-tints';
import type { Project } from '@/lib/types';

interface Citation {
  url: string;
  fact_supported: string;
  confidence: number;
}

function isCitationArray(v: unknown): v is Citation[] {
  if (!Array.isArray(v)) return false;
  return v.every(
    (item) =>
      item != null &&
      typeof item === 'object' &&
      typeof (item as { url?: unknown }).url === 'string',
  );
}

interface Props {
  project: Project;
}

export function SourceCitations({ project }: Props): React.ReactElement | null {
  const citations = isCitationArray(project.enrichment_citations)
    ? project.enrichment_citations
    : null;

  // Hide footer entirely when no citations — the trust-and-verify backstop is
  // optional, and the section header would be empty noise without rows.
  if (!citations || citations.length === 0) return null;

  // Default rendering: hostname-only line. Spec says click expands to full
  // citation list; that interaction lands in 7B.
  return (
    <footer
      data-testid="source-citations"
      style={{
        marginTop: 24,
        paddingTop: 12,
        borderTop: `1px solid ${PF_TINTS.ruleHair}`,
        font: `400 11px ${PF_TINTS.mono}`,
        color: PF_TINTS.inkDim,
        letterSpacing: '0.02em',
      }}
    >
      Sources:{' '}
      {citations.map((c, i) => {
        let host: string;
        try {
          host = new URL(c.url).hostname;
        } catch {
          host = c.url;
        }
        return (
          <React.Fragment key={`${c.url}-${i}`}>
            {i > 0 && ' · '}
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: PF_TINTS.inkDim, textDecoration: 'underline' }}
            >
              {host}
            </a>
          </React.Fragment>
        );
      })}
    </footer>
  );
}
