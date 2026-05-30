'use client';

// LeadChatLauncher — floating bottom-right launcher for the Internal Lead
// Chat Agent. Click toggles the LeadChatPanel. Minimize collapses back to
// the launcher pip without losing the in-memory thread (history is in
// pathfinder.lead_chat_messages anyway).
//
// Mounted only on Internal surfaces. Other orgs never see this component.
//
// Plan: Pathfinder/docs/PLAN-stream-h.md.

import * as React from 'react';
import { LeadChatPanel } from './LeadChatPanel';

const PF = {
  ink: '#0a0a0a',
  bg: '#ffffff',
  warm: '#a3e635',
  ruleSoft: 'rgba(10,10,10,0.12)',
} as const;

export interface LeadChatLauncherProps {
  orgSlug: string;
  orgId: string;
  companyId?: string | null;
  companyName?: string | null;
  filteredCompanyIds?: string[];
  scopeLabel: string;
}

export function LeadChatLauncher(props: LeadChatLauncherProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close Lead Chat' : 'Open Lead Chat'}
        data-testid="lead-chat-launcher"
        style={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          width: 52,
          height: 52,
          borderRadius: 26,
          background: PF.ink,
          color: PF.bg,
          border: `1px solid ${PF.ruleSoft}`,
          boxShadow: '0 6px 24px rgba(10,10,10,0.18)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          font: '500 11px var(--font-inter), system-ui, sans-serif',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          zIndex: 70,
        }}
      >
        {open ? 'CLOSE' : 'CHAT'}
      </button>
      <LeadChatPanel
        open={open}
        onClose={() => setOpen(false)}
        onMinimize={() => setOpen(false)}
        orgSlug={props.orgSlug}
        orgId={props.orgId}
        companyId={props.companyId ?? null}
        companyName={props.companyName ?? null}
        filteredCompanyIds={props.filteredCompanyIds}
        scopeLabel={props.scopeLabel}
      />
    </>
  );
}
