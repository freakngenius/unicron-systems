'use client';

// HubspotPushModal — Gate 10C "What gets pushed?" preview + Push CTA.
//
// SPEC - HubSpot Bridge.md §Lead detail. Shows the operator a summary
// of the deal/company/contacts/notes that will land in HubSpot before
// they confirm. Cancel returns to the connected-no-deal empty state;
// confirm fires the push and returns deal_id + url to the parent.

import * as React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import type { Project } from '@/lib/types';

export interface HubspotPushModalProps {
  open: boolean;
  project: Project;
  contactsCount: number;
  branchCode: string | null;
  branchName: string | null;
  portalName: string | null;
  busy: boolean;
  errorMessage: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

function formatAmount(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Not set';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export function HubspotPushModal(props: HubspotPushModalProps) {
  if (!props.open) return null;

  const dealnamePreview = props.branchCode
    ? `${props.project.title} · ${props.branchCode}`
    : props.project.title;

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="hubspot-push-modal"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.32)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 50,
      }}
      onClick={props.onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: PF_TINTS.bg,
          borderRadius: PF_TINTS.r.md,
          boxShadow: PF_TINTS.shadow.lg,
          width: 'min(560px, 100%)',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ font: `600 16px/1.25 ${PF_TINTS.sans}`, color: PF_TINTS.ink, margin: 0 }}>
            Push to HubSpot
          </h2>
          {props.portalName && (
            <span
              style={{
                font: `500 10px ${PF_TINTS.mono}`,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: PF_TINTS.inkDim,
                background: hexAlpha('#0a0a0a', 0.04),
                border: `1px solid ${PF_TINTS.ruleSoft}`,
                borderRadius: 3,
                padding: '2px 6px',
              }}
            >
              {props.portalName}
            </span>
          )}
        </header>

        <p style={{ font: `400 13px/1.5 ${PF_TINTS.sans}`, color: PF_TINTS.inkSub, margin: 0 }}>
          One click creates a HubSpot deal in your portal with the fields below.
          Idempotent — pushing the same lead twice returns the existing deal.
        </p>

        <details
          style={{
            border: `1px solid ${PF_TINTS.ruleSoft}`,
            borderRadius: PF_TINTS.r.sm,
            padding: 12,
            background: PF_TINTS.bgAlt,
          }}
        >
          <summary
            style={{
              font: `600 12px ${PF_TINTS.sans}`,
              color: PF_TINTS.ink,
              cursor: 'pointer',
            }}
          >
            What gets pushed?
          </summary>
          <dl
            style={{
              margin: '12px 0 0',
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              columnGap: 12,
              rowGap: 6,
              font: `400 12px/1.45 ${PF_TINTS.mono}`,
              color: PF_TINTS.inkSub,
            }}
          >
            <dt style={{ color: PF_TINTS.inkDim }}>Deal name</dt>
            <dd style={{ margin: 0, color: PF_TINTS.ink }}>{dealnamePreview}</dd>

            <dt style={{ color: PF_TINTS.inkDim }}>Amount</dt>
            <dd style={{ margin: 0 }}>{formatAmount(props.project.project_value)}</dd>

            <dt style={{ color: PF_TINTS.inkDim }}>Stage</dt>
            <dd style={{ margin: 0 }}>{props.project.project_stage ?? 'Announcement'}</dd>

            <dt style={{ color: PF_TINTS.inkDim }}>Branch</dt>
            <dd style={{ margin: 0 }}>{props.branchName ?? '—'}</dd>

            <dt style={{ color: PF_TINTS.inkDim }}>Contacts</dt>
            <dd style={{ margin: 0 }}>
              {props.contactsCount > 0
                ? `${props.contactsCount} associated`
                : 'No contacts to push (deal only)'}
            </dd>

            <dt style={{ color: PF_TINTS.inkDim }}>Source</dt>
            <dd style={{ margin: 0 }}>{props.project.source}</dd>

            <dt style={{ color: PF_TINTS.inkDim }}>Custom fields</dt>
            <dd style={{ margin: 0 }}>
              pathfinder_lead_id, pathfinder_score, pathfinder_branch
            </dd>
          </dl>
        </details>

        {props.errorMessage && (
          <div
            data-testid="hubspot-push-modal-error"
            style={{
              font: `400 12px/1.4 ${PF_TINTS.sans}`,
              color: '#c42424',
              background: 'rgba(196,36,36,0.06)',
              border: '1px solid rgba(196,36,36,0.30)',
              borderRadius: PF_TINTS.r.sm,
              padding: '8px 10px',
            }}
          >
            {props.errorMessage}
          </div>
        )}

        <footer style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={props.onClose}
            disabled={props.busy}
            style={{
              font: `500 13px ${PF_TINTS.sans}`,
              color: PF_TINTS.inkSub,
              background: 'transparent',
              border: `1px solid ${PF_TINTS.ruleSoft}`,
              borderRadius: PF_TINTS.r.sm,
              padding: '8px 14px',
              cursor: props.busy ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            disabled={props.busy}
            data-testid="hubspot-push-modal-confirm"
            style={{
              font: `600 13px ${PF_TINTS.sans}`,
              color: '#fff',
              background: '#FF7A59',
              border: 'none',
              borderRadius: PF_TINTS.r.sm,
              padding: '8px 14px',
              cursor: props.busy ? 'not-allowed' : 'pointer',
              opacity: props.busy ? 0.6 : 1,
            }}
          >
            {props.busy ? 'Pushing…' : 'Push to HubSpot'}
          </button>
        </footer>
      </div>
    </div>
  );
}
