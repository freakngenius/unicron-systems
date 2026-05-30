'use client';

// components/catalog/modules/HubspotSync.tsx, Stream C Detail surface.
//
// Slot: detail.outreach with slotMode='action-affordance'. Renders inside
// outreach-composer's action row, not as a second claim on the slot.
//
// Hard-gated on the hubspot integration at the catalog level. When the
// gate is unmet the renderer drops the affordance before mounting; the
// component below also defends in depth and renders the gated affordance
// with reason text if it ever does mount in an ungated org.
//
// Wires to the existing endpoint /api/leads/[projectId]/hubspot/push.

import * as React from 'react';

import {
  color,
  font,
  fontSize,
  fontWeight,
  radius,
} from '@/components/design';
import type { ModuleComponentProps } from '@/lib/catalog/types';

import { useCompanyDetail } from '../CompanyDetailContext';

void React;

interface PushResult {
  ok?: boolean;
  hubspot_deal_url?: string | null;
  error?: string;
  message?: string;
}

export default function HubspotSync(_props: ModuleComponentProps): React.ReactElement {
  const { architecture, project } = useCompanyDetail();
  const hubspotPresent = (architecture.integrations ?? []).includes('hubspot');
  const [state, setState] = React.useState<'idle' | 'pending' | 'ok' | 'err'>('idle');
  const [feedback, setFeedback] = React.useState<{ message: string; href?: string | null } | null>(null);

  const onClick = async () => {
    if (!hubspotPresent || state === 'pending') return;
    setState('pending');
    setFeedback(null);
    try {
      const res = await fetch(`/pathfinder/api/leads/${encodeURIComponent(project.id)}/hubspot/push`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      const json: PushResult = await res.json().catch(() => ({} as PushResult));
      if (res.ok && json.ok) {
        setState('ok');
        setFeedback({
          message: 'Pushed to HubSpot.',
          href: json.hubspot_deal_url ?? null,
        });
      } else {
        setState('err');
        const detail = json.error ?? `HTTP ${res.status}`;
        const note = json.message ? `: ${json.message}` : '';
        setFeedback({ message: `Push failed (${detail}${note}).` });
      }
    } catch (e) {
      setState('err');
      setFeedback({ message: e instanceof Error ? e.message : String(e) });
    }
  };

  const label =
    state === 'pending'
      ? 'Pushing…'
      : state === 'ok'
        ? 'Pushed'
        : state === 'err'
          ? 'Retry push'
          : 'Push to HubSpot';

  if (!hubspotPresent) {
    return (
      <span
        data-stream-c-module="hubspot-sync"
        data-hubspot-sync-state="gated"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: color.textDim,
          fontFamily: font.sans,
          fontSize: fontSize.micro,
          padding: `4px 10px`,
          borderRadius: radius.sm,
          border: `1px dashed ${color.border}`,
          background: color.bgSubtle,
          cursor: 'not-allowed',
        }}
        title="HubSpot integration not connected for this org."
      >
        Push to HubSpot (HubSpot not connected)
      </span>
    );
  }

  return (
    <span
      data-stream-c-module="hubspot-sync"
      data-hubspot-sync-state={state}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={state === 'pending'}
        style={{
          background: color.bg,
          color: color.accent,
          border: `1px solid ${color.border}`,
          padding: `6px 12px`,
          borderRadius: radius.sm,
          fontFamily: font.sans,
          fontSize: fontSize.micro,
          fontWeight: fontWeight.medium,
          cursor: state === 'pending' ? 'wait' : 'pointer',
          opacity: state === 'pending' ? 0.7 : 1,
        }}
      >
        {label}
      </button>
      {feedback ? (
        <span
          style={{
            color: state === 'err' ? color.danger : color.textMuted,
            fontFamily: font.sans,
            fontSize: fontSize.micro,
          }}
        >
          {feedback.message}
          {feedback.href ? (
            <>
              {' '}
              <a
                href={feedback.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: color.accent, textDecoration: 'none' }}
              >
                Open deal
              </a>
            </>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
