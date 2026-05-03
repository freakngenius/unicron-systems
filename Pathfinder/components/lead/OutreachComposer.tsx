'use client';

// components/lead/OutreachComposer.tsx — Demo Polish UX Gate 9C.
//
// New v2 outreach composer per SPEC - Lead Detail Page v2.md § 7. Replaces
// the legacy EmailComposer's two-channel UI (Send via Gmail / Send via
// Outlook) with a single Send button. The "From" field shows the user's
// connected provider identity; Gate 9D wires the real connection lookup
// and the new connection-routed Send endpoint. For 9C, From defaults to
// a hardcoded display string and Send hits the existing /api/outreach/send
// path so the demo's send capability stays end-to-end.

import * as React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';

export interface OutreachDraftValue {
  to: string;
  subject: string;
  body: string;
}

interface Props {
  projectId: string;
  /** Initial draft value populated from the drafter response or blank. */
  initialDraft: OutreachDraftValue;
  /** Bump this counter to force a re-seed of the composer fields from
   *  `initialDraft` regardless of whether the values changed. Lets parents
   *  flush operator-typed state when "Draft recommended outreach" or
   *  "Custom outreach" are clicked and the resulting seed values happen
   *  to match the prior seed. */
  seedNonce: number;
  /** Display string for the read-only From field. Gate 9D replaces with real
   *  user_connections lookup. */
  fromDisplay: string;
  /** Indicates whether the user has a connected provider. When false, the
   *  Send button is disabled and the From field shows a "Connect" affordance. */
  isConnected: boolean;
  /** Settings link target for connecting a provider when not connected. */
  settingsHref?: string;
  /** Optional. Fired after a successful send so the parent can refresh
   *  the sent-history sub-section. */
  onSendComplete?: () => void;
}

export function OutreachComposer({
  projectId,
  initialDraft,
  seedNonce,
  fromDisplay,
  isConnected,
  settingsHref = '/pathfinder/settings/connections',
  onSendComplete,
}: Props): React.ReactElement {
  const [to, setTo] = React.useState(initialDraft.to);
  const [subject, setSubject] = React.useState(initialDraft.subject);
  const [body, setBody] = React.useState(initialDraft.body);
  const [submitting, setSubmitting] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{
    kind: 'ok' | 'err';
    message: string;
  } | null>(null);

  // Re-seed fields when the parent bumps `seedNonce`. Watching nonce
  // (not the draft values) lets the parent reset operator-typed state
  // even when the seed values happen to be unchanged (e.g. Custom
  // outreach clicked while the form is already empty).
  const lastSeen = React.useRef<number>(seedNonce);
  React.useEffect(() => {
    if (seedNonce === lastSeen.current) return;
    lastSeen.current = seedNonce;
    setTo(initialDraft.to);
    setSubject(initialDraft.subject);
    setBody(initialDraft.body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedNonce]);

  const onSend = async () => {
    if (submitting) return;
    setFeedback(null);
    if (!to.trim()) {
      setFeedback({ kind: 'err', message: 'Recipient required.' });
      return;
    }
    if (!body.trim()) {
      setFeedback({ kind: 'err', message: 'Body required.' });
      return;
    }
    setSubmitting(true);
    try {
      // Gate 9C uses the existing /api/outreach/send for now. Gate 9D
      // adds /pathfinder/api/leads/[id]/outreach/send with connection
      // routing; this composer will switch when 9D lands.
      const res = await fetch('/pathfinder/api/outreach/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          actor_email: extractEmail(fromDisplay),
          provider: extractProvider(fromDisplay),
          recipient_email: to,
          draft_subject: subject,
          draft_body: body,
          sent_subject: subject,
          sent_body: body,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (res.ok && json.ok) {
        setFeedback({ kind: 'ok', message: 'Sent.' });
        if (onSendComplete) onSendComplete();
      } else {
        setFeedback({
          kind: 'err',
          message: json.error ?? `Send failed (HTTP ${res.status})`,
        });
      }
    } catch (e) {
      setFeedback({
        kind: 'err',
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      data-testid="outreach-composer"
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <Field label="From">
        <div
          data-testid="outreach-composer-from"
          style={{
            font: `500 12.5px ${PF_TINTS.mono}`,
            color: isConnected ? PF_TINTS.ink : PF_TINTS.inkDim,
          }}
        >
          {isConnected ? (
            fromDisplay
          ) : (
            <span>
              Not connected.{' '}
              <a
                data-testid="outreach-composer-connect-link"
                href={settingsHref}
                style={{
                  color: '#9d35ff',
                  textDecoration: 'underline',
                }}
              >
                Connect Gmail or Outlook in Settings.
              </a>
            </span>
          )}
        </div>
      </Field>

      <Field label="To">
        <input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="recipient@example.com"
          data-testid="outreach-composer-to"
          style={inputStyle}
        />
      </Field>

      <Field label="Subject">
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject line"
          data-testid="outreach-composer-subject"
          style={inputStyle}
        />
      </Field>

      <Field label="Body">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Compose body…"
          rows={10}
          data-testid="outreach-composer-body"
          style={{
            ...inputStyle,
            font: `400 13px/1.5 ${PF_TINTS.sans}`,
            resize: 'vertical',
          }}
        />
        <div
          style={{
            marginTop: 4,
            font: `500 11px ${PF_TINTS.mono}`,
            color: PF_TINTS.inkDim,
          }}
        >
          {body.length} chars · {wordCount(body)} words
        </div>
      </Field>

      {feedback && (
        <div
          role="alert"
          data-testid="outreach-composer-feedback"
          data-kind={feedback.kind}
          style={{
            padding: '8px 12px',
            border: `1px solid ${
              feedback.kind === 'ok' ? hexAlpha('#16a34a', 0.4) : hexAlpha('#dc2626', 0.4)
            }`,
            background:
              feedback.kind === 'ok'
                ? hexAlpha('#16a34a', 0.06)
                : hexAlpha('#dc2626', 0.06),
            color: feedback.kind === 'ok' ? '#15803d' : '#b91c1c',
            borderRadius: PF_TINTS.r.sm,
            font: `500 12px ${PF_TINTS.sans}`,
          }}
        >
          {feedback.message}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <button
          type="button"
          onClick={onSend}
          disabled={submitting || !isConnected}
          data-testid="outreach-composer-send"
          style={{
            background: '#9d35ff',
            color: '#fff',
            border: '1px solid #9d35ff',
            padding: '8px 18px',
            borderRadius: 3,
            font: `500 13px ${PF_TINTS.sans}`,
            cursor: submitting || !isConnected ? 'not-allowed' : 'pointer',
            opacity: submitting || !isConnected ? 0.5 : 1,
          }}
        >
          {submitting ? 'Sending…' : 'Send'}
        </button>
      </div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label style={{ display: 'block' }}>
      <div
        style={{
          font: `500 11px ${PF_TINTS.mono}`,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: PF_TINTS.inkDim,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: PF_TINTS.bg,
  color: PF_TINTS.ink,
  border: `1px solid ${PF_TINTS.ruleSoft}`,
  borderRadius: 3,
  padding: '8px 10px',
  font: `500 13px ${PF_TINTS.sans}`,
};

function wordCount(s: string): number {
  const trimmed = s.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// Pull the email + provider out of the From display string. Format:
// "<email> via <Provider>". Falls back to empty values when the format
// doesn't match — Gate 9D replaces this with a real lookup so the
// fallback only matters during the 9C → 9D window.
function extractEmail(display: string): string {
  const match = display.match(/^([^\s]+@[^\s]+)/);
  return match ? match[1] : '';
}
function extractProvider(display: string): 'gmail' | 'outlook' {
  return /outlook/i.test(display) ? 'outlook' : 'gmail';
}
