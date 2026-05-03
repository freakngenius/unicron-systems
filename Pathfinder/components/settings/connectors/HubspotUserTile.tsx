'use client';

// HubspotUserTile — per-user HubSpot connection tile.
//
// SPEC - HubSpot Bridge.md §Settings page. Distinct from the org-level
// ConnectorTile used by Slack + Teams: this tile reads from
// pathfinder.user_connections (scoped to the current operator) and
// drives /api/connectors/hubspot/{install,disconnect}. Connected state
// surfaces portal name + portal id + connected-at; primary action flips
// between "Connect HubSpot" (POST install → 302) and "Disconnect"
// (POST disconnect → flips state via router.refresh()).

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';

export type HubspotUserTileState = 'disconnected' | 'connected' | 'expired' | 'error';

export interface HubspotUserTileProps {
  state: HubspotUserTileState;
  portalName?: string | null;
  portalId?: string | null;
  connectedAt?: string | null;
  errorMessage?: string | null;
  /** Operator email used as user_id today. Passed via x-operator-email
   *  header on POSTs so the install/disconnect routes can scope the
   *  user_connections row correctly. */
  operatorEmail: string | null;
}

function HubspotLogo() {
  return (
    <svg width={28} height={28} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="16" cy="14" r="5" fill="none" stroke="#FF7A59" strokeWidth="2" />
      <line x1="16" y1="9" x2="16" y2="5" stroke="#FF7A59" strokeWidth="2" />
      <circle cx="16" cy="3.5" r="2" fill="#FF7A59" />
      <circle cx="6" cy="6" r="1.5" fill="#FF7A59" />
      <line x1="7" y1="7" x2="11.5" y2="11.5" stroke="#FF7A59" strokeWidth="1.5" />
    </svg>
  );
}

interface BadgeColor {
  fg: string;
  bg: string;
  ring: string;
}

const BADGE: Record<HubspotUserTileState, { color: BadgeColor; label: string }> = {
  disconnected: {
    color: { fg: PF_TINTS.inkDim, bg: hexAlpha('#0a0a0a', 0.04), ring: PF_TINTS.ruleSoft },
    label: 'Disconnected',
  },
  connected: {
    color: { fg: '#198754', bg: 'rgba(25,135,84,0.12)', ring: 'rgba(25,135,84,0.40)' },
    label: 'Connected',
  },
  expired: {
    color: { fg: '#a06600', bg: 'rgba(160,102,0,0.12)', ring: 'rgba(160,102,0,0.40)' },
    label: 'Token expired',
  },
  error: {
    color: { fg: '#c42424', bg: 'rgba(196,36,36,0.10)', ring: 'rgba(196,36,36,0.45)' },
    label: 'Error',
  },
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

interface HubspotStatusResponse {
  state: HubspotUserTileState;
  portal_id?: string | null;
  portal_name?: string | null;
  connected_at?: string | null;
}

export function HubspotUserTile(props: HubspotUserTileProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(props.errorMessage ?? null);
  // The page passes operatorEmail=null (server can't read localStorage).
  // Self-source from localStorage on mount so the tile is autonomous.
  const [resolvedEmail, setResolvedEmail] = React.useState<string | null>(props.operatorEmail);
  React.useEffect(() => {
    if (resolvedEmail) return;
    if (typeof window === 'undefined') return;
    const fromStorage = window.localStorage.getItem('pf_email');
    if (fromStorage) setResolvedEmail(fromStorage);
  }, [resolvedEmail]);
  const [liveState, setLiveState] = React.useState<HubspotUserTileState>(props.state);
  const [livePortalName, setLivePortalName] = React.useState<string | null | undefined>(
    props.portalName,
  );
  const [livePortalId, setLivePortalId] = React.useState<string | null | undefined>(props.portalId);
  const [liveConnectedAt, setLiveConnectedAt] = React.useState<string | null | undefined>(
    props.connectedAt,
  );

  // Hydrate from server state on mount and after redirects (e.g. coming
  // back from the OAuth callback with ?connected=hubspot).
  React.useEffect(() => {
    if (!resolvedEmail) return;
    let cancelled = false;
    fetch('/pathfinder/api/connectors/hubspot/status', {
      method: 'GET',
      headers: { 'x-operator-email': resolvedEmail },
    })
      .then((res) => res.json())
      .then((data: HubspotStatusResponse) => {
        if (cancelled) return;
        setLiveState(data.state);
        setLivePortalName(data.portal_name ?? null);
        setLivePortalId(data.portal_id ?? null);
        setLiveConnectedAt(data.connected_at ?? null);
      })
      .catch(() => {
        // Leave the SSR-supplied state unchanged on transport error
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedEmail]);

  const badge = BADGE[liveState];
  const isConnected = liveState === 'connected';
  const needsReconnect = liveState === 'expired' || liveState === 'error';

  const handleConnect = React.useCallback(async () => {
    if (!resolvedEmail) {
      setErrorMsg('No operator email — set OPERATOR_EMAIL in /pathfinder/settings first.');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/pathfinder/api/connectors/hubspot/install', {
        method: 'POST',
        headers: { 'x-operator-email': resolvedEmail },
        redirect: 'manual',
      });
      // The route returns a 302; fetch with redirect:'manual' surfaces
      // it as an opaqueredirect. Read Location off the response when
      // available, else fall back to the resolved URL.
      const loc = res.headers.get('location');
      if (loc) {
        window.location.href = loc;
        return;
      }
      // Fallback for browsers that block manual-redirect inspection:
      // re-issue without manual so we follow the redirect and land on
      // HubSpot's consent page.
      window.location.href = `/pathfinder/api/connectors/hubspot/install?operator_email=${encodeURIComponent(
        resolvedEmail,
      )}`;
    } catch (err) {
      setBusy(false);
      setErrorMsg(err instanceof Error ? err.message : 'install failed');
    }
  }, [resolvedEmail]);

  const handleDisconnect = React.useCallback(async () => {
    if (!resolvedEmail) return;
    if (!window.confirm('Disconnect HubSpot? This revokes the OAuth grant.')) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/pathfinder/api/connectors/hubspot/disconnect', {
        method: 'POST',
        headers: { 'x-operator-email': resolvedEmail },
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        setErrorMsg((detail as { detail?: string }).detail ?? `disconnect failed (${res.status})`);
      } else {
        setLiveState('disconnected');
        setLivePortalName(null);
        setLivePortalId(null);
        setLiveConnectedAt(null);
        router.refresh();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'disconnect failed');
    } finally {
      setBusy(false);
    }
  }, [resolvedEmail, router]);

  const primaryLabel = isConnected ? 'Disconnect' : needsReconnect ? 'Reconnect' : 'Connect HubSpot';
  const primaryAction = isConnected ? handleDisconnect : handleConnect;

  return (
    <article
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
        boxShadow: PF_TINTS.shadow.sm,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 200,
      }}
      data-testid="connector-tile-hubspot-user"
      data-state={liveState}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <HubspotLogo />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              font: `600 14px/1.2 ${PF_TINTS.sans}`,
              color: PF_TINTS.ink,
              letterSpacing: '-0.005em',
            }}
          >
            HubSpot CRM
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span
              style={{
                font: `500 10px ${PF_TINTS.mono}`,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: badge.color.fg,
                background: badge.color.bg,
                border: `1px solid ${badge.color.ring}`,
                borderRadius: 3,
                padding: '2px 6px',
              }}
            >
              {badge.label}
            </span>
          </div>
        </div>
      </header>

      <div
        style={{
          font: `400 13px/1.45 ${PF_TINTS.sans}`,
          color: PF_TINTS.inkSub,
          flex: 1,
        }}
      >
        Two-way sync of deals, contacts, and pipeline stages. Per-user OAuth — connect your own HubSpot.
      </div>

      {isConnected && (
        <dl
          style={{
            margin: 0,
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            columnGap: 8,
            rowGap: 4,
            font: `400 12px/1.4 ${PF_TINTS.mono}`,
            color: PF_TINTS.inkSub,
          }}
        >
          {livePortalName && (
            <>
              <dt style={{ color: PF_TINTS.inkDim }}>Portal</dt>
              <dd style={{ margin: 0, color: PF_TINTS.ink }}>{livePortalName}</dd>
            </>
          )}
          {livePortalId && (
            <>
              <dt style={{ color: PF_TINTS.inkDim }}>Portal ID</dt>
              <dd style={{ margin: 0 }}>{livePortalId}</dd>
            </>
          )}
          {liveConnectedAt && (
            <>
              <dt style={{ color: PF_TINTS.inkDim }}>Connected</dt>
              <dd style={{ margin: 0 }}>{formatDate(liveConnectedAt)}</dd>
            </>
          )}
        </dl>
      )}

      {errorMsg && (
        <div
          style={{
            font: `400 12px/1.4 ${PF_TINTS.sans}`,
            color: '#c42424',
            background: 'rgba(196,36,36,0.06)',
            border: '1px solid rgba(196,36,36,0.30)',
            borderRadius: PF_TINTS.r.sm,
            padding: '6px 8px',
          }}
        >
          {errorMsg}
        </div>
      )}

      <footer style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={primaryAction}
          disabled={busy || !resolvedEmail}
          data-testid="hubspot-user-tile-primary"
          style={{
            flex: 1,
            font: `600 13px ${PF_TINTS.sans}`,
            color: '#fff',
            background: isConnected ? '#c42424' : '#FF7A59',
            border: 'none',
            borderRadius: PF_TINTS.r.sm,
            padding: '8px 12px',
            cursor: busy || !resolvedEmail ? 'not-allowed' : 'pointer',
            opacity: busy || !resolvedEmail ? 0.6 : 1,
          }}
        >
          {busy ? 'Working…' : primaryLabel}
        </button>
      </footer>
    </article>
  );
}
