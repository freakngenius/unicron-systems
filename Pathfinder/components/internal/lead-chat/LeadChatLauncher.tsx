'use client';

// LeadChatLauncher — floating bottom-right launcher for the Internal Lead
// Chat Agent. Click toggles the LeadChatPanel. Minimize collapses back to
// the launcher pip without losing the in-memory thread (history is in
// pathfinder.lead_chat_messages anyway).
//
// Mounted only on Internal surfaces. Other orgs never see this component.
//
// Stream H mounted a black pill with "CHAT" / "CLOSE" text. The restyle
// (Pathfinder/docs/SPEC-Chat-Launcher-Restyle.md) makes it a white circle
// with a centered black chat glyph, no text, subtle shadow, hover scale,
// focus-visible ring, aria-label "Open chat". Presentation only; the
// click behavior and the panel are unchanged.

import * as React from 'react';
import { LeadChatPanel } from './LeadChatPanel';
import type { LeadUnitSchema } from '@/lib/catalog/modules/ranked-feed/labels';

const C = {
  surface: '#ffffff',
  glyph: '#000000',
  ring: '#0a0a0a',
} as const;

const RESTING_SHADOW = '0 6px 20px rgba(10,10,10,0.15)';
const HOVER_SHADOW = '0 10px 28px rgba(10,10,10,0.22)';

export interface LeadChatLauncherProps {
  orgSlug: string;
  orgId: string;
  companyId?: string | null;
  companyName?: string | null;
  filteredCompanyIds?: string[];
  scopeLabel: string;
  // SPEC-Chat-Fixes.md defect 3: the panel renders referenced leads as
  // shared CompanyLeadCard tiles, which need the org's lead_unit schema
  // to resolve display labels. The two server mount sites already have
  // it from architecture.lead_unit.schema.
  schema: LeadUnitSchema;
}

export function LeadChatLauncher(props: LeadChatLauncherProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const [hover, setHover] = React.useState(false);

  return (
    <>
      <style>{`
        [data-testid="lead-chat-launcher"]:focus-visible {
          outline: 2px solid ${C.ring};
          outline-offset: 2px;
        }
      `}</style>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label={open ? 'Close chat' : 'Open chat'}
        aria-expanded={open}
        data-testid="lead-chat-launcher"
        data-launcher-open={open ? 'true' : 'false'}
        style={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: C.surface,
          border: 'none',
          padding: 0,
          boxShadow: hover ? HOVER_SHADOW : RESTING_SHADOW,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: hover ? 'scale(1.06)' : 'scale(1)',
          transition: 'transform 140ms ease, box-shadow 140ms ease',
          zIndex: 70,
          color: C.glyph,
        }}
      >
        {open ? <CloseGlyph /> : <ChatGlyph />}
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
        schema={props.schema}
      />
    </>
  );
}

// lucide MessageCircle, inlined to avoid pulling lucide-react into the
// runtime dependency tree for a single icon. Stroke-only, currentColor so
// the parent's color property drives the ink.
function ChatGlyph(): React.ReactElement {
  return (
    <svg
      aria-hidden
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-launcher-icon="chat"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

// lucide X, inlined for the open-state toggle.
function CloseGlyph(): React.ReactElement {
  return (
    <svg
      aria-hidden
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-launcher-icon="close"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
