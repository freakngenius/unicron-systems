'use client';

// HubspotSection — Gate 10C lead-detail surface for the HubSpot bridge.
//
// SPEC - HubSpot Bridge.md §Lead detail. Three states the section
// renders against, all driven by /api/leads/[id]/hubspot/status:
//
//   no-connection      → Connect prompt → Settings link
//   connected-no-deal  → "Push to HubSpot" CTA + What-gets-pushed modal
//   pushed             → stage chip + amount + owner + last activity +
//                        Refresh + Add Note (10D — env-flag-gated stub)
//                        + Push update (10D — disabled)
//                        + Open in HubSpot
//
// Slots between §5 Contacts and §6 Relationship Context in LeadDetail.

import * as React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import { SectionHeading } from '@/components/lead/SectionHeading';
import { HubspotPushModal } from '@/components/lead/HubspotPushModal';
import type { Project } from '@/lib/types';

export type HubspotSectionState = 'no-connection' | 'connected-no-deal' | 'pushed';

export interface HubspotDealSummary {
  hubspot_deal_id: string;
  hubspot_deal_url: string | null;
  portal_id: string | null;
  portal_name: string | null;
  pushed_at: string | null;
  last_synced_at: string | null;
  current_stage: string | null;
  current_stage_label: string | null;
  current_amount: number | null;
  current_owner_name: string | null;
  last_activity_at: string | null;
  status: string | null;
}

export interface HubspotSectionProps {
  project: Project;
  branchCode: string | null;
  branchName: string | null;
  contactsCount: number;
  /** When true, the Add Note button is live; otherwise renders a
   *  "Notes coming soon" tooltip stub. Default false. Flipped on once
   *  Kyle upgrades the sandbox tier and engagement scopes are granted. */
  noteButtonEnabled: boolean;
}

interface StatusResponse {
  state: HubspotSectionState;
  portal_id?: string | null;
  portal_name?: string | null;
  deal?: HubspotDealSummary | null;
  reason?: string;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatAmount(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function StageChip({ stage }: { stage: string | null }) {
  const label = stage ?? 'Unknown';
  return (
    <span
      data-testid="hubspot-section-stage-chip"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        font: `500 10px ${PF_TINTS.mono}`,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: '#FF7A59',
        background: 'rgba(255,122,89,0.10)',
        border: '1px solid rgba(255,122,89,0.45)',
        borderRadius: 3,
        padding: '3px 8px',
      }}
    >
      {label}
    </span>
  );
}

function operatorEmailFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('pf_email');
}

export function HubspotSection(props: HubspotSectionProps) {
  const [state, setState] = React.useState<HubspotSectionState>('no-connection');
  const [portalName, setPortalName] = React.useState<string | null>(null);
  const [deal, setDeal] = React.useState<HubspotDealSummary | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [pushing, setPushing] = React.useState(false);
  const [pushError, setPushError] = React.useState<string | null>(null);
  const [hydrated, setHydrated] = React.useState(false);
  const [operatorEmail, setOperatorEmail] = React.useState<string | null>(null);

  React.useEffect(() => {
    const e = operatorEmailFromStorage();
    setOperatorEmail(e);
  }, []);

  const refreshStatus = React.useCallback(async () => {
    if (!operatorEmail) {
      setHydrated(true);
      return;
    }
    try {
      const res = await fetch(
        `/pathfinder/api/leads/${encodeURIComponent(props.project.id)}/hubspot/status`,
        { headers: { 'x-operator-email': operatorEmail } },
      );
      const data = (await res.json()) as StatusResponse;
      setState(data.state);
      setPortalName(data.portal_name ?? null);
      setDeal(data.deal ?? null);
    } catch {
      // Leave the prior state as-is on transport failure.
    } finally {
      setHydrated(true);
    }
  }, [operatorEmail, props.project.id]);

  React.useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handleOpenPush = React.useCallback(() => {
    setPushError(null);
    setModalOpen(true);
  }, []);

  const handleConfirmPush = React.useCallback(async () => {
    if (!operatorEmail) {
      setPushError('No operator email — set OPERATOR_EMAIL in /pathfinder/settings first.');
      return;
    }
    setPushing(true);
    setPushError(null);
    try {
      const res = await fetch(
        `/pathfinder/api/leads/${encodeURIComponent(props.project.id)}/hubspot/push`,
        {
          method: 'POST',
          headers: { 'x-operator-email': operatorEmail, 'Content-Type': 'application/json' },
          body: '{}',
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setPushError(data?.detail ?? data?.message ?? `Push failed (${res.status})`);
        return;
      }
      setModalOpen(false);
      // Optimistic: flip to 'pushed' immediately + re-fetch status to
      // pick up any deal-fields the server resolved.
      setState('pushed');
      setDeal({
        hubspot_deal_id: data.hubspot_deal_id,
        hubspot_deal_url: data.hubspot_deal_url ?? null,
        portal_id: data.portal_id ?? null,
        portal_name: portalName,
        pushed_at: new Date().toISOString(),
        last_synced_at: null,
        current_stage: null,
        current_stage_label: null,
        current_amount: props.project.project_value ?? null,
        current_owner_name: null,
        last_activity_at: null,
        status: 'active',
      });
      void refreshStatus();
    } catch (err) {
      setPushError(err instanceof Error ? err.message : 'push failed');
    } finally {
      setPushing(false);
    }
  }, [operatorEmail, portalName, props.project.id, props.project.project_value, refreshStatus]);

  const handleCloseModal = React.useCallback(() => {
    if (!pushing) setModalOpen(false);
  }, [pushing]);

  // Pre-hydration: render the connected-no-deal CTA shell so the
  // section doesn't flash an empty box. Once /status returns we flip
  // to the real state.
  const renderState: HubspotSectionState = hydrated ? state : 'no-connection';

  return (
    <section data-testid="lead-detail-section-hubspot" data-state={renderState}>
      <SectionHeading title="HubSpot" sub={portalName ?? null} />

      {renderState === 'no-connection' && (
        <div
          data-testid="hubspot-section-no-connection"
          style={{
            background: PF_TINTS.bg,
            border: `1px solid ${PF_TINTS.ruleSoft}`,
            borderRadius: PF_TINTS.r.md,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ font: `600 14px ${PF_TINTS.sans}`, color: PF_TINTS.ink }}>
            Connect HubSpot to push this lead
          </div>
          <div style={{ font: `400 13px/1.45 ${PF_TINTS.sans}`, color: PF_TINTS.inkSub }}>
            Push leads from Pathfinder to your HubSpot portal as deals.
            Track stage updates, owner changes, and activity timestamps
            from this page.
          </div>
          <div>
            <a
              href="/pathfinder/settings/connectors"
              data-testid="hubspot-section-connect-link"
              style={{
                display: 'inline-block',
                marginTop: 4,
                font: `600 13px ${PF_TINTS.sans}`,
                color: '#fff',
                background: '#FF7A59',
                border: 'none',
                borderRadius: PF_TINTS.r.sm,
                padding: '8px 12px',
                textDecoration: 'none',
              }}
            >
              Connect HubSpot
            </a>
          </div>
        </div>
      )}

      {renderState === 'connected-no-deal' && (
        <div
          data-testid="hubspot-section-connected-no-deal"
          style={{
            background: PF_TINTS.bg,
            border: `1px solid ${PF_TINTS.ruleSoft}`,
            borderRadius: PF_TINTS.r.md,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ font: `600 14px ${PF_TINTS.sans}`, color: PF_TINTS.ink }}>
            This lead is not yet in HubSpot
          </div>
          <div style={{ font: `400 13px/1.45 ${PF_TINTS.sans}`, color: PF_TINTS.inkSub }}>
            Push the lead as a deal in your portal{portalName ? ` (${portalName})` : ''}.
            Includes deal name, amount, stage, branch, and {props.contactsCount} associated contact{props.contactsCount === 1 ? '' : 's'}.
          </div>
          <div>
            <button
              type="button"
              onClick={handleOpenPush}
              data-testid="hubspot-section-push-button"
              style={{
                font: `600 13px ${PF_TINTS.sans}`,
                color: '#fff',
                background: '#FF7A59',
                border: 'none',
                borderRadius: PF_TINTS.r.sm,
                padding: '8px 14px',
                cursor: 'pointer',
              }}
            >
              Push to HubSpot
            </button>
          </div>
        </div>
      )}

      {renderState === 'pushed' && deal && (
        <div
          data-testid="hubspot-section-pushed"
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <StageChip stage={deal.current_stage_label ?? deal.current_stage ?? null} />
            <span style={{ font: `500 13px ${PF_TINTS.mono}`, color: PF_TINTS.ink }}>
              {formatAmount(deal.current_amount ?? props.project.project_value ?? null)}
            </span>
            {deal.current_owner_name && (
              <span style={{ font: `400 12px ${PF_TINTS.sans}`, color: PF_TINTS.inkSub }}>
                Owner: {deal.current_owner_name}
              </span>
            )}
          </div>

          <dl
            style={{
              margin: 0,
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              columnGap: 10,
              rowGap: 4,
              font: `400 12px/1.4 ${PF_TINTS.mono}`,
              color: PF_TINTS.inkSub,
            }}
          >
            <dt style={{ color: PF_TINTS.inkDim }}>Pushed</dt>
            <dd style={{ margin: 0 }}>{formatDateTime(deal.pushed_at)}</dd>
            <dt style={{ color: PF_TINTS.inkDim }}>Last synced</dt>
            <dd style={{ margin: 0 }}>{formatDateTime(deal.last_synced_at)}</dd>
            <dt style={{ color: PF_TINTS.inkDim }}>Last activity</dt>
            <dd style={{ margin: 0 }}>{formatDateTime(deal.last_activity_at)}</dd>
          </dl>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {deal.hubspot_deal_url && (
              <a
                href={deal.hubspot_deal_url}
                target="_blank"
                rel="noreferrer"
                data-testid="hubspot-section-open-link"
                style={{
                  font: `600 12px ${PF_TINTS.sans}`,
                  color: '#FF7A59',
                  background: 'transparent',
                  border: '1px solid rgba(255,122,89,0.45)',
                  borderRadius: PF_TINTS.r.sm,
                  padding: '6px 10px',
                  textDecoration: 'none',
                }}
              >
                Open in HubSpot ↗
              </a>
            )}
            <button
              type="button"
              disabled
              title="Live status refresh ships in Gate 10D"
              data-testid="hubspot-section-refresh-button"
              style={{
                font: `500 12px ${PF_TINTS.sans}`,
                color: PF_TINTS.inkDim,
                background: hexAlpha('#0a0a0a', 0.04),
                border: `1px solid ${PF_TINTS.ruleSoft}`,
                borderRadius: PF_TINTS.r.sm,
                padding: '6px 10px',
                cursor: 'not-allowed',
              }}
            >
              Refresh status
            </button>
            <button
              type="button"
              disabled
              title="Push update ships in Gate 10D"
              data-testid="hubspot-section-push-update-button"
              style={{
                font: `500 12px ${PF_TINTS.sans}`,
                color: PF_TINTS.inkDim,
                background: hexAlpha('#0a0a0a', 0.04),
                border: `1px solid ${PF_TINTS.ruleSoft}`,
                borderRadius: PF_TINTS.r.sm,
                padding: '6px 10px',
                cursor: 'not-allowed',
              }}
            >
              Push update
            </button>
            <button
              type="button"
              disabled={!props.noteButtonEnabled}
              title={
                props.noteButtonEnabled
                  ? 'Add a HubSpot engagement note (live)'
                  : 'Notes coming soon — requires HubSpot Sales Hub Starter+'
              }
              data-testid="hubspot-section-note-button"
              data-feature-enabled={props.noteButtonEnabled ? 'true' : 'false'}
              style={{
                font: `500 12px ${PF_TINTS.sans}`,
                color: props.noteButtonEnabled ? PF_TINTS.ink : PF_TINTS.inkDim,
                background: hexAlpha('#0a0a0a', 0.04),
                border: `1px solid ${PF_TINTS.ruleSoft}`,
                borderRadius: PF_TINTS.r.sm,
                padding: '6px 10px',
                cursor: props.noteButtonEnabled ? 'pointer' : 'not-allowed',
              }}
            >
              Add Note
            </button>
          </div>
        </div>
      )}

      <HubspotPushModal
        open={modalOpen}
        project={props.project}
        contactsCount={props.contactsCount}
        branchCode={props.branchCode}
        branchName={props.branchName}
        portalName={portalName}
        busy={pushing}
        errorMessage={pushError}
        onConfirm={handleConfirmPush}
        onClose={handleCloseModal}
      />
    </section>
  );
}
