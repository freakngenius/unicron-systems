'use client';

// DisconnectConfirm — modal that confirms a disconnect before firing
// the irreversible (until reconnect) revoke flow. Spec: § 5.5.

import * as React from 'react';

import { PF_TINTS } from '@/lib/agent-tints';
import { getUserEmail } from '@/lib/settings';
import type { ConnectorId } from './ConnectorTile';

const API_BASE = '/pathfinder/api';

const PROVIDER_LABELS: Record<ConnectorId, string> = {
  slack: 'Slack workspace',
  teams: 'Microsoft Teams tenant',
  hubspot: 'HubSpot portal',
};

interface DisconnectConfirmProps {
  connectorId: string;
  connectorType: ConnectorId;
  onClose: () => void;
  onComplete: () => void;
}

export function DisconnectConfirm(props: DisconnectConfirmProps) {
  const { connectorId, connectorType, onClose, onComplete } = props;
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const email = getUserEmail();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (email) headers['x-operator-email'] = email;
      const res = await fetch(`${API_BASE}/connectors/instances/${connectorId}/disconnect`, {
        method: 'POST',
        headers,
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(`Disconnect failed — ${json?.error ?? res.status}`);
        setSubmitting(false);
        return;
      }
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  const provider = PROVIDER_LABELS[connectorType];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="disconnect-confirm-title"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10,10,10,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="disconnect-confirm-modal"
        style={{
          background: PF_TINTS.bg,
          border: `1px solid ${PF_TINTS.ruleSoft}`,
          borderRadius: PF_TINTS.r.md,
          boxShadow: PF_TINTS.shadow.lg,
          maxWidth: 480,
          width: '100%',
          padding: 24,
          font: `400 13px/1.5 ${PF_TINTS.sans}`,
          color: PF_TINTS.ink,
        }}
      >
        <h2
          id="disconnect-confirm-title"
          style={{ font: `600 16px/1.3 ${PF_TINTS.sans}`, margin: '0 0 4px' }}
        >
          Disconnect {connectorType}?
        </h2>
        <p
          className="pf-mono"
          style={{
            fontSize: 9,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: PF_TINTS.inkDim,
            margin: '0 0 16px',
          }}
        >
          / irreversible (until reconnect)
        </p>
        <p style={{ color: PF_TINTS.inkSub, margin: '0 0 12px' }}>
          This will revoke Pathfinder&apos;s access to your {provider}. Connected
          reps will stop receiving alerts. You can reconnect anytime from this
          page.
        </p>
        <ul style={{ paddingLeft: 18, margin: '0 0 20px', color: PF_TINTS.inkSub, fontSize: 12 }}>
          <li>Routing rules are kept (deactivated) so reconnecting restores them.</li>
          <li>Audit log is retained for 90 days per Section 5.5.</li>
          <li>Token plaintext is purged immediately.</li>
        </ul>
        {error && (
          <p
            data-testid="disconnect-confirm-error"
            style={{ color: '#c42424', fontSize: 12, margin: '0 0 12px' }}
          >
            {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            data-testid="disconnect-confirm-cancel"
            disabled={submitting}
            style={{
              font: `500 12px ${PF_TINTS.sans}`,
              color: PF_TINTS.inkSub,
              background: 'transparent',
              border: `1px solid ${PF_TINTS.ruleSoft}`,
              borderRadius: 3,
              padding: '8px 16px',
              cursor: submitting ? 'wait' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            Keep connected
          </button>
          <button
            type="button"
            onClick={onConfirm}
            data-testid="disconnect-confirm-submit"
            disabled={submitting}
            style={{
              font: `500 12px ${PF_TINTS.sans}`,
              color: '#fff',
              background: '#c42424',
              border: '1px solid #c42424',
              borderRadius: 3,
              padding: '8px 16px',
              cursor: submitting ? 'wait' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Disconnecting…' : 'Yes, disconnect'}
          </button>
        </div>
      </div>
    </div>
  );
}
