'use client';

// components/lead/ContactRow.tsx — Demo Polish UX Gate 8C.
//
// Per-contact rendering inside the ContactsCard. Spec:
// `Company Docs/Specs/SPEC - Contact Enrichment.md` § UI — Contacts Card.
//
// Renders: name + role + seniority chip + decision-authority chip +
// email + email-status dot + phone + phone-type chip + linkedin link +
// source citation + confidence chip + per-row actions
// (Copy email / Copy phone / Use as outreach recipient).

import * as React from 'react';

import type { LeadContactRow } from '@/lib/types';
import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';

const COLORS = {
  signer: '#16a34a', // green
  influencer: '#0d9488', // teal
  gatekeeper: '#d97706', // amber
  champion: '#d946ef', // magenta
  unknown: '#6b7280', // gray
} as const;

const EMAIL_STATUS_COLORS = {
  verified: '#16a34a',
  guessed: '#d97706',
  invalid: '#dc2626',
  unknown: '#6b7280',
} as const;

interface Props {
  contact: LeadContactRow;
  onCopyEmail?: (email: string) => void;
  onCopyPhone?: (phone: string) => void;
  onUseAsRecipient?: (email: string, contactName: string) => void;
}

function chip(label: string, color: string, opts: { bold?: boolean } = {}) {
  return (
    <span
      style={{
        display: 'inline-block',
        background: hexAlpha(color, 0.12),
        border: `1px solid ${hexAlpha(color, 0.5)}`,
        color,
        padding: '2px 6px',
        borderRadius: 3,
        font: `${opts.bold ? '600' : '500'} 10px ${PF_TINTS.mono}`,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
  );
}

function dot(color: string, title?: string) {
  return (
    <span
      aria-hidden
      title={title}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: 8,
        background: color,
        marginRight: 4,
        verticalAlign: 'middle',
      }}
    />
  );
}

function smallButton(
  label: string,
  onClick?: () => void,
  testid?: string,
): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      data-testid={testid}
      style={{
        background: 'transparent',
        border: `1px solid ${PF_TINTS.ruleHair}`,
        color: onClick ? PF_TINTS.ink : PF_TINTS.inkDim,
        padding: '3px 8px',
        borderRadius: 4,
        font: `500 10px ${PF_TINTS.mono}`,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        cursor: onClick ? 'pointer' : 'not-allowed',
      }}
    >
      {label}
    </button>
  );
}

export function ContactRow({
  contact,
  onCopyEmail,
  onCopyPhone,
  onUseAsRecipient,
}: Props): React.ReactElement {
  const [toast, setToast] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1400);
    return () => clearTimeout(t);
  }, [toast]);

  const handleCopyEmail = () => {
    if (!contact.email) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(contact.email).catch(() => {});
    }
    setToast(`Email copied: ${contact.email}`);
    onCopyEmail?.(contact.email);
  };
  const handleCopyPhone = () => {
    if (!contact.phone) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(contact.phone).catch(() => {});
    }
    setToast(`Phone copied: ${contact.phone}`);
    onCopyPhone?.(contact.phone);
  };
  const handleUseAsRecipient = () => {
    if (!contact.email) return;
    onUseAsRecipient?.(contact.email, contact.contact_name);
    setToast(`Composer recipient set to ${contact.email}`);
  };

  const decisionColor =
    COLORS[(contact.decision_authority ?? 'unknown') as keyof typeof COLORS] ??
    COLORS.unknown;
  const emailStatusColor =
    EMAIL_STATUS_COLORS[
      (contact.email_status ?? 'unknown') as keyof typeof EMAIL_STATUS_COLORS
    ] ?? EMAIL_STATUS_COLORS.unknown;

  const senioritySuffix = contact.seniority && contact.seniority !== 'unknown'
    ? contact.seniority.replace(/_/g, ' ')
    : null;

  const showLowConfidence =
    contact.source_confidence == null || contact.source_confidence >= 0.5;
  if (!showLowConfidence) return <></>;

  return (
    <div
      data-testid="contact-row"
      data-contact-id={contact.id}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '10px 0',
        borderTop: `1px solid ${PF_TINTS.ruleHair}`,
      }}
    >
      {/* line 1 — name + role + chips */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          style={{
            font: `600 14px ${PF_TINTS.sans}`,
            color: PF_TINTS.ink,
          }}
        >
          {contact.contact_name}
        </span>
        {contact.role && (
          <span
            style={{
              font: `500 12px ${PF_TINTS.sans}`,
              color: PF_TINTS.inkSub,
            }}
          >
            {contact.role}
          </span>
        )}
        {senioritySuffix && chip(senioritySuffix, '#475569')}
        {contact.decision_authority &&
          chip(contact.decision_authority, decisionColor, { bold: true })}
      </div>

      {/* line 2 — email + phone + linkedin */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
          font: `400 12px ${PF_TINTS.mono}`,
          color: PF_TINTS.inkSub,
        }}
      >
        {contact.email ? (
          <span data-testid="contact-email">
            {dot(emailStatusColor, contact.email_status ?? 'unknown')}
            <a
              href={`mailto:${contact.email}`}
              style={{ color: PF_TINTS.ink, textDecoration: 'none' }}
            >
              {contact.email}
            </a>
            {contact.email_status === 'guessed' && (
              <span
                style={{ marginLeft: 6, color: PF_TINTS.inkDim, fontStyle: 'italic' }}
                title="Email pattern inferred (firstname.lastname@domain) — not provider-verified"
              >
                guessed
              </span>
            )}
            {contact.email_status === 'invalid' && (
              <span
                style={{ marginLeft: 6, color: '#dc2626', fontStyle: 'italic' }}
                title="Provider rejected this address as undeliverable"
              >
                invalid
              </span>
            )}
          </span>
        ) : (
          <span style={{ color: PF_TINTS.inkDim }}>no email</span>
        )}
        {contact.phone ? (
          <span data-testid="contact-phone">
            <a
              href={`tel:${contact.phone}`}
              style={{ color: PF_TINTS.ink, textDecoration: 'none' }}
            >
              {contact.phone}
            </a>{' '}
            {contact.phone_type && contact.phone_type !== 'unknown' && (
              <span style={{ color: PF_TINTS.inkDim }}>
                ({contact.phone_type})
              </span>
            )}
          </span>
        ) : (
          <span style={{ color: PF_TINTS.inkDim }}>no phone</span>
        )}
        {contact.linkedin_url && (
          <a
            href={contact.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="contact-linkedin"
            style={{
              color: '#0a66c2',
              textDecoration: 'none',
              font: `500 11px ${PF_TINTS.sans}`,
            }}
          >
            LinkedIn ↗
          </a>
        )}
      </div>

      {/* line 3 — source + actions */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            font: `500 10px ${PF_TINTS.mono}`,
            color: PF_TINTS.inkDim,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          <span>source: {contact.source}</span>
          {contact.source_confidence != null && (
            <span>· conf {(contact.source_confidence * 100).toFixed(0)}%</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {smallButton(
            'Copy email',
            contact.email ? handleCopyEmail : undefined,
            'contact-copy-email',
          )}
          {smallButton(
            'Copy phone',
            contact.phone ? handleCopyPhone : undefined,
            'contact-copy-phone',
          )}
          {smallButton(
            'Use as recipient',
            contact.email && onUseAsRecipient ? handleUseAsRecipient : undefined,
            'contact-use-recipient',
          )}
        </div>
      </div>
      {toast && (
        <div
          role="status"
          aria-live="polite"
          data-testid="contact-toast"
          style={{
            font: `500 11px ${PF_TINTS.mono}`,
            color: '#16a34a',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
