'use client';

// components/lead/ActivateIntegrationModal.tsx — Demo Polish UX Gate 11B.
//
// Inline shortcut modal that surfaces when the operator hits Send and
// gets a `no_active_integration` (or `no_connection`) error from the
// outreach send endpoint. Two tiles — Gmail and Outlook — each link
// to the existing OAuth start route. The Settings page connector
// flow stays as-is; this is a faster path from the lead-detail surface.
//
// Implementation notes:
//   - Uses the existing /api/email/oauth/start endpoint (Stream B Gate B2)
//     so no new OAuth code path. Same callback writes to
//     pathfinder.email_integrations and redirects to /settings on success.
//   - For 11B MVP the OAuth completes in the same browser tab; the user
//     lands on /settings with a connected banner. A popup-with-postMessage
//     flow that returns the operator to the exact lead detail view is a
//     post-demo polish item — explicitly out of scope per dispatch.
//   - Esc + backdrop click close the modal. The lead detail's outer modal
//     still listens for Esc (LeadDetailModal); we stopPropagation on this
//     modal's keydown so closing the inner modal doesn't dismiss the lead
//     view too.

import * as React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Operator's email — used as the `actor` query param on the OAuth
   *  start URL. The existing flow keys email_integrations rows by
   *  actor_email. */
  actorEmail: string;
}

const GMAIL_TINT = '#ea4335';
const OUTLOOK_TINT = '#0078d4';

export function ActivateIntegrationModal({
  open,
  onClose,
  actorEmail,
}: Props): React.ReactElement | null {
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    // Capture phase so we beat the LeadDetailModal's Esc handler when
    // both are open.
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open, onClose]);

  if (!open) return null;

  const startUrlFor = (provider: 'gmail' | 'outlook'): string => {
    const params = new URLSearchParams({ provider, actor: actorEmail });
    return `/pathfinder/api/email/oauth/start?${params.toString()}`;
  };

  return (
    <div
      data-testid="activate-integration-modal-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop. Slightly stronger than the LeadDetailModal's so the
          inner modal reads as foreground when stacked. */}
      <div
        data-testid="activate-integration-modal-backdrop"
        aria-hidden
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(10,10,10,0.5)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
      />

      <div
        data-testid="activate-integration-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Activate email integration"
        style={{
          position: 'relative',
          width: 480,
          maxWidth: '90vw',
          background: PF_TINTS.bg,
          border: `1px solid ${PF_TINTS.ruleSoft}`,
          borderRadius: 10,
          boxShadow: '0 20px 48px rgba(10,10,10,0.32)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                font: `600 16px ${PF_TINTS.sans}`,
                color: PF_TINTS.ink,
              }}
            >
              Connect your email to send from Pathfinder
            </h2>
            <p
              style={{
                margin: '4px 0 0',
                font: `400 12.5px/1.5 ${PF_TINTS.sans}`,
                color: PF_TINTS.inkSub,
              }}
            >
              Outreach sends from your own inbox. Pick a provider to authorize.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="activate-integration-modal-close"
            aria-label="Close"
            style={{
              background: PF_TINTS.bgAlt,
              border: `1px solid ${PF_TINTS.ruleSoft}`,
              borderRadius: 4,
              width: 28,
              height: 28,
              cursor: 'pointer',
              color: PF_TINTS.ink,
              font: `500 14px ${PF_TINTS.sans}`,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </header>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
          }}
        >
          <ProviderTile
            provider="gmail"
            label="Connect Gmail"
            tint={GMAIL_TINT}
            href={startUrlFor('gmail')}
          />
          <ProviderTile
            provider="outlook"
            label="Connect Outlook"
            tint={OUTLOOK_TINT}
            href={startUrlFor('outlook')}
          />
        </div>

        <p
          style={{
            margin: 0,
            font: `400 11px ${PF_TINTS.mono}`,
            color: PF_TINTS.inkDim,
            letterSpacing: '0.04em',
          }}
        >
          You will be redirected to {actorEmail ? actorEmail.split('@')[1] || 'your provider' : 'your provider'} to authorize. After approval you will land on /settings — return to this lead and Send.
        </p>
      </div>
    </div>
  );
}

function ProviderTile({
  provider,
  label,
  tint,
  href,
}: {
  provider: 'gmail' | 'outlook';
  label: string;
  tint: string;
  href: string;
}): React.ReactElement {
  return (
    <a
      href={href}
      data-testid={`activate-integration-tile-${provider}`}
      data-provider={provider}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '20px 16px',
        background: hexAlpha(tint, 0.04),
        border: `1px solid ${hexAlpha(tint, 0.4)}`,
        borderRadius: PF_TINTS.r.md,
        cursor: 'pointer',
        textDecoration: 'none',
        color: PF_TINTS.ink,
        font: `600 13px ${PF_TINTS.sans}`,
        transition: 'background 120ms ease, border-color 120ms ease',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.background = hexAlpha(tint, 0.1);
        el.style.borderColor = tint;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = hexAlpha(tint, 0.04);
        el.style.borderColor = hexAlpha(tint, 0.4);
      }}
    >
      <span
        aria-hidden
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: tint,
        }}
      />
      {label}
    </a>
  );
}
