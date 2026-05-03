'use client';

// components/lead/OutreachSection.tsx — Demo Polish UX Gate 9C.
//
// Wraps the v2 Outreach section per SPEC - Lead Detail Page v2.md § 7.
// Layout:
//   [Draft recommended outreach]  [Custom outreach]
//   <OutreachComposer />
//   <SentHistoryBlock />          (recent outreach_edits for this lead)
//
// The two action buttons set the composer's draft state. "Draft
// recommended outreach" calls the new POST
// /pathfinder/api/leads/[projectId]/outreach/draft endpoint, populates
// To / Subject / Body from the response. "Custom outreach" clears the
// fields. Body override + recipient override hooks from the parent
// (CrossPollinationCard's "Use this hook in outreach", ContactsCard's
// "Use as outreach recipient") pre-fill before either button is clicked.

import * as React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import type { LeadContactRow, OutreachEdit } from '@/lib/types';

import { OutreachComposer, type OutreachDraftValue } from './OutreachComposer';

interface Props {
  projectId: string;
  /** Decision-maker contacts for default recipient seeding. */
  leadContacts: LeadContactRow[];
  /** Recent sends (outreach_edits) for the Sent History sub-section. */
  recentEdits: OutreachEdit[];
  /** Hardcoded From display for Gate 9C. Gate 9D swaps with a real
   *  user_connections lookup result. */
  fromDisplay: string;
  /** Whether a provider connection exists. Drives From fallback +
   *  Send-button disabled state. */
  isConnected: boolean;
  /** Pre-fill body from a CrossPollinationCard hook click. Same nonce
   *  bridge pattern as Gate 7B's bodyOverride. */
  bodyOverride?: { text: string; nonce: number } | null;
  /** Pre-fill recipient from a ContactsCard "Use as recipient" click. */
  recipientOverride?: { email: string; nonce: number } | null;
}

export function OutreachSection({
  projectId,
  leadContacts,
  recentEdits,
  fromDisplay,
  isConnected,
  bodyOverride = null,
  recipientOverride = null,
}: Props): React.ReactElement {
  const initialRecipient = pickInitialRecipient(leadContacts);

  const [draft, setDraft] = React.useState<OutreachDraftValue>({
    to: initialRecipient,
    subject: '',
    body: '',
  });
  const [seedNonce, setSeedNonce] = React.useState(0);
  const [drafting, setDrafting] = React.useState(false);
  const [draftError, setDraftError] = React.useState<string | null>(null);
  const reseed = React.useCallback((next: OutreachDraftValue) => {
    setDraft(next);
    setSeedNonce((n) => n + 1);
  }, []);

  // Honor body / recipient overrides from sibling sections via nonce
  // bumping (Gate 7B + 8C bridge pattern). Each override updates only the
  // relevant field so the operator's other in-flight edits stick.
  const lastBodyNonce = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!bodyOverride) return;
    if (bodyOverride.nonce === lastBodyNonce.current) return;
    lastBodyNonce.current = bodyOverride.nonce;
    setDraft((prev) => {
      const next: OutreachDraftValue = {
        ...prev,
        body: prev.body
          ? `${bodyOverride.text}\n\n${prev.body}`
          : bodyOverride.text,
      };
      return next;
    });
    setSeedNonce((n) => n + 1);
  }, [bodyOverride]);

  const lastRecipientNonce = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!recipientOverride) return;
    if (recipientOverride.nonce === lastRecipientNonce.current) return;
    lastRecipientNonce.current = recipientOverride.nonce;
    setDraft((prev) => ({ ...prev, to: recipientOverride.email }));
    setSeedNonce((n) => n + 1);
  }, [recipientOverride]);

  const onDraftRecommended = async () => {
    if (drafting) return;
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await fetch(
        `/pathfinder/api/leads/${encodeURIComponent(projectId)}/outreach/draft`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        subject?: string;
        body?: string;
        suggested_recipient_email?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setDraftError(json.error ?? `Drafter failed (HTTP ${res.status})`);
        return;
      }
      reseed({
        to:
          (json.suggested_recipient_email ?? '').trim() ||
          initialRecipient ||
          '',
        subject: json.subject ?? '',
        body: json.body ?? '',
      });
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : String(e));
    } finally {
      setDrafting(false);
    }
  };

  const onCustomOutreach = () => {
    setDraftError(null);
    reseed({ to: initialRecipient, subject: '', body: '' });
  };

  return (
    <div
      data-testid="outreach-section"
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={onDraftRecommended}
          disabled={drafting}
          data-testid="outreach-draft-recommended"
          style={{
            background: '#9d35ff',
            color: '#fff',
            border: '1px solid #9d35ff',
            padding: '8px 14px',
            borderRadius: 3,
            font: `500 12.5px ${PF_TINTS.sans}`,
            cursor: drafting ? 'wait' : 'pointer',
            opacity: drafting ? 0.6 : 1,
          }}
        >
          {drafting ? 'Drafting…' : 'Draft recommended outreach'}
        </button>
        <button
          type="button"
          onClick={onCustomOutreach}
          data-testid="outreach-custom"
          style={{
            background: PF_TINTS.bg,
            color: PF_TINTS.ink,
            border: `1px solid ${PF_TINTS.ruleSoft}`,
            padding: '8px 14px',
            borderRadius: 3,
            font: `500 12.5px ${PF_TINTS.sans}`,
            cursor: 'pointer',
          }}
        >
          Custom outreach
        </button>
        {draftError && (
          <span
            data-testid="outreach-draft-error"
            style={{
              font: `500 12px ${PF_TINTS.sans}`,
              color: '#b91c1c',
              padding: '4px 8px',
              background: hexAlpha('#dc2626', 0.06),
              border: `1px solid ${hexAlpha('#dc2626', 0.4)}`,
              borderRadius: 3,
            }}
          >
            {draftError}
          </span>
        )}
      </div>

      <OutreachComposer
        projectId={projectId}
        initialDraft={draft}
        seedNonce={seedNonce}
        fromDisplay={fromDisplay}
        isConnected={isConnected}
      />

      {recentEdits.length > 0 && <SentHistoryBlock recentEdits={recentEdits} />}
    </div>
  );
}

function pickInitialRecipient(contacts: LeadContactRow[]): string {
  for (const c of contacts) {
    if (c.email) return c.email;
  }
  return '';
}

function SentHistoryBlock({
  recentEdits,
}: {
  recentEdits: OutreachEdit[];
}): React.ReactElement {
  return (
    <section
      data-testid="outreach-sent-history"
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleHair}`,
        borderRadius: PF_TINTS.r.md,
        padding: 12,
      }}
    >
      <h4
        style={{
          margin: '0 0 6px',
          font: `600 10px ${PF_TINTS.mono}`,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: PF_TINTS.inkSub,
        }}
      >
        Sent history
      </h4>
      {recentEdits.slice(0, 5).map((edit) => (
        <div
          key={edit.id}
          style={{
            padding: '6px 0',
            borderBottom: `1px solid ${PF_TINTS.ruleHair}`,
            font: `500 11px ${PF_TINTS.mono}`,
            color: edit.send_error ? '#b91c1c' : PF_TINTS.inkSub,
          }}
          title={edit.sent_subject ?? ''}
        >
          {edit.sent_at
            ? new Date(edit.sent_at).toISOString().slice(0, 16).replace('T', ' ')
            : 'failed'}
          {' · '}
          {edit.provider}
          {' · '}
          {edit.send_error ? edit.send_error : `Δ${edit.edit_distance ?? 0}`}
        </div>
      ))}
    </section>
  );
}
