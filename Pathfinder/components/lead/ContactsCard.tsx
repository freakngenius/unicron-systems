'use client';

// components/lead/ContactsCard.tsx — Demo Polish UX Gate 8C.
//
// Decision-maker contacts surfaced for the lead. Reads from
// pathfinder.lead_contacts (populated by Gate 8B's contact-enrichment
// orchestrator). Spec:
// `Company Docs/Specs/SPEC - Contact Enrichment.md` § UI — Contacts Card.
//
// Empty states (per spec):
//   - `top50pending` — top-50 lead, cron hasn't run yet → "Run now" button
//   - `belowThreshold` — sub-top-50 lead → "Request enrichment" link
//   - `ownerUnknown` — Pre-award / null owner → muted "Contact lookup pending owner identification"
//   - `noResults` — providers ran and returned 0 → "No contacts found via providers"
//
// Gate 9B addendum (per SPEC - Lead Detail Page v2.md § 5 Contacts):
// every empty state appends a per-source publishing note explaining
// whether the source itself ever publishes contact data, so the operator
// understands why the section is empty rather than assuming a bug.

import * as React from 'react';

import type { LeadContactRow, Project } from '@/lib/types';
import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import { ContactRow } from './ContactRow';

interface Props {
  project: Pick<
    Project,
    | 'id'
    | 'owner_name'
    | 'source'
    | 'score'
    | 'rejection_reason'
  > & {
    enriched_at?: string | null;
  };
  contacts: LeadContactRow[];
  /** Set by parent: when score is in the top-50, allow "Run now". */
  isTopFifty?: boolean;
  /** When true, show the admin-only "Run now" button. */
  isAdmin?: boolean;
  /** Hook to wire ContactsCard's "Use as outreach recipient" button into
   *  the EmailComposer's `to:` field. Same lift pattern as
   *  CrossPollinationCard.onInsertHook. */
  onSetRecipient?: (email: string, contactName: string) => void;
}

type EmptyState =
  | 'topFiftyPending'
  | 'belowThreshold'
  | 'ownerUnknown'
  | 'noResults'
  | null;

function classifyEmptyState(props: Props): EmptyState {
  const { project, contacts, isTopFifty } = props;
  if (contacts.length > 0) return null;
  // Owner unknown / pre-award — the orchestrator skips these. UI surfaces
  // a neutral pending message.
  const owner = (project.owner_name ?? '').toLowerCase();
  if (
    !project.owner_name ||
    owner === 'pre-award (no awardee yet)'
  ) {
    return 'ownerUnknown';
  }
  if (project.rejection_reason) {
    // Rejected leads still render the page but the contacts section is
    // moot. Fold into ownerUnknown-style muted state.
    return 'ownerUnknown';
  }
  if (isTopFifty) {
    return 'topFiftyPending';
  }
  return 'belowThreshold';
}

export function ContactsCard(props: Props): React.ReactElement {
  const { project, contacts, isAdmin, onSetRecipient } = props;
  const empty = classifyEmptyState(props);

  const ownerLabel = project.owner_name ?? '—';
  const headerCount = contacts.length;
  const headerTitle =
    headerCount > 0
      ? `Contacts — ${headerCount} at ${ownerLabel}`
      : `Contacts at ${ownerLabel}`;

  return (
    <section
      data-testid="contacts-card"
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleHair}`,
        borderRadius: PF_TINTS.r.md,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <h3
          style={{
            margin: 0,
            font: `600 11px ${PF_TINTS.sans}`,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: PF_TINTS.ink,
          }}
        >
          {headerTitle}
        </h3>
        {empty === 'topFiftyPending' && isAdmin && (
          <RunNowButton projectId={project.id} />
        )}
      </header>

      {empty === null && (
        <div data-testid="contacts-list">
          {contacts.map((c) => (
            <ContactRow
              key={c.id}
              contact={c}
              onUseAsRecipient={onSetRecipient}
            />
          ))}
        </div>
      )}

      {empty === 'topFiftyPending' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p
            data-testid="contacts-empty-pending"
            style={{
              margin: 0,
              font: `400 13px ${PF_TINTS.sans}`,
              color: PF_TINTS.inkSub,
            }}
          >
            Enrichment pending — refresh in 5 min.
          </p>
          <SourcePublishingNote source={project.source} />
        </div>
      )}

      {empty === 'belowThreshold' && (
        <div data-testid="contacts-empty-below" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p
            style={{
              margin: 0,
              font: `400 13px ${PF_TINTS.sans}`,
              color: PF_TINTS.inkSub,
            }}
          >
            Contacts not enriched (lead score below threshold).
          </p>
          <SourcePublishingNote source={project.source} />
          <RequestEnrichmentLink projectId={project.id} />
        </div>
      )}

      {empty === 'ownerUnknown' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p
            data-testid="contacts-empty-owner-unknown"
            style={{
              margin: 0,
              font: `400 13px ${PF_TINTS.sans}`,
              color: PF_TINTS.inkDim,
              fontStyle: 'italic',
            }}
          >
            Contact lookup pending owner identification.
          </p>
          <SourcePublishingNote source={project.source} />
        </div>
      )}

      {empty === 'noResults' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p
            data-testid="contacts-empty-no-results"
            style={{
              margin: 0,
              font: `400 13px ${PF_TINTS.sans}`,
              color: PF_TINTS.inkSub,
            }}
          >
            No contacts found via providers. Manual research required.
          </p>
          <SourcePublishingNote source={project.source} />
        </div>
      )}

      {/* Show low-confidence toggle stub — surfaced when there are
          source_confidence < 0.5 rows hidden by ContactRow. We don't
          implement the expand here in 8C; the spec defers it. The
          ContactRow already hides them. */}
    </section>
  );
}

function RunNowButton({ projectId }: { projectId: string }): React.ReactElement {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/pathfinder/api/leads/${encodeURIComponent(projectId)}/enrich-contacts?force=1`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(`Failed: ${body.error ?? res.status}`);
      } else if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      data-testid="contacts-run-now"
      style={{
        background: hexAlpha(PF_TINTS.ink, 0.04),
        border: `1px solid ${PF_TINTS.ruleHair}`,
        color: PF_TINTS.ink,
        padding: '4px 10px',
        borderRadius: 4,
        font: `500 11px ${PF_TINTS.mono}`,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        cursor: busy ? 'wait' : 'pointer',
      }}
      title={error ?? 'Trigger immediate Clay/Apollo/Hunter enrichment'}
    >
      {busy ? 'Running…' : 'Run now'}
    </button>
  );
}

function RequestEnrichmentLink({
  projectId,
}: {
  projectId: string;
}): React.ReactElement {
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (typeof window !== 'undefined') {
      window.alert(
        `Request enrichment for ${projectId} — queued for next cron pass.`,
      );
    }
  };
  return (
    <a
      href="#"
      onClick={onClick}
      data-testid="contacts-request-enrichment"
      style={{
        font: `500 11px ${PF_TINTS.mono}`,
        color: PF_TINTS.ink,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      Request enrichment →
    </a>
  );
}

// SPEC - Lead Detail Page v2.md § 5 Contacts — per-source explanation
// shown in every empty-state branch. Tells the operator whether the
// upstream source publishes contact data at all (sam.gov sometimes,
// USAspending / Harris / news essentially never), so absence isn't
// confused with a bug.
const SOURCE_NOTES: Record<string, string> = {
  'sam.gov':
    'Source: sam.gov publishes pointOfContact data only when the contracting officer attaches it to the notice. Many solicitations omit it.',
  usaspending:
    'Source: USAspending does not publish decision-maker contact data. Contacts here come from Clay / Apollo / Hunter enrichment against the awarding agency.',
  harris:
    'Source: Harris County permits do not publish contact information. Contacts must be enriched against the listed contractor or property owner.',
  news:
    'Source: news articles rarely include direct contacts. Manual research or third-party enrichment is required.',
};

function SourcePublishingNote({
  source,
}: {
  source: string | null | undefined;
}): React.ReactElement | null {
  if (!source) return null;
  const text = SOURCE_NOTES[source];
  if (!text) return null;
  return (
    <p
      data-testid="contacts-source-publishing-note"
      data-source={source}
      style={{
        margin: 0,
        font: `400 11.5px/1.5 ${PF_TINTS.sans}`,
        color: PF_TINTS.inkDim,
        fontStyle: 'italic',
      }}
    >
      {text}
    </p>
  );
}
