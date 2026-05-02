'use client';

// WelcomeStep — step 1 of the C-4A onboarding wizard. Sets the value
// prop, lists what's about to get connected, and surfaces the ~3-min
// time estimate.
//
// Spec: SPEC - Connectors (Slack, Teams, HubSpot).md § 7.3.

import * as React from 'react';

import { PF_TINTS } from '@/lib/agent-tints';

export interface WelcomeStepProps {
  onContinue: () => void;
  /** Listed connector names — used in the "what gets connected" copy. */
  connectorNames: string[];
}

export function WelcomeStep({ onContinue, connectorNames }: WelcomeStepProps) {
  return (
    <section
      data-testid="onboarding-welcome-step"
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
        boxShadow: PF_TINTS.shadow.sm,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      <header>
        <h2
          style={{
            font: `600 22px/1.2 ${PF_TINTS.sans}`,
            color: PF_TINTS.ink,
            margin: '0 0 4px',
            letterSpacing: '-0.01em',
          }}
        >
          Wire Pathfinder into the tools you already use.
        </h2>
        <p style={{ margin: 0, color: PF_TINTS.inkSub, maxWidth: 640 }}>
          Pathfinder talks to your team where they already are — Slack, Microsoft Teams, and
          HubSpot. We don&apos;t make your reps log into another tool. We feed them leads in their
          inbox, their channel, their pipeline.
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        <ValueCard
          title="Real-time alerts"
          body="Verified leads land in your chat tool the moment the Verifier confirms them."
        />
        <ValueCard
          title="Daily + weekly briefs"
          body="A 6 AM rep summary and a Friday performance digest, posted where your team already reads."
        />
        <ValueCard
          title="Bi-directional CRM sync"
          body="Pathfinder pushes verified leads into HubSpot and listens for stage changes back."
        />
      </div>

      <div
        style={{
          background: PF_TINTS.bgAlt,
          border: `1px solid ${PF_TINTS.ruleSoft}`,
          borderRadius: PF_TINTS.r.sm,
          padding: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 13,
          color: PF_TINTS.inkSub,
        }}
      >
        <span
          className="pf-mono"
          style={{
            fontSize: 9,
            color: PF_TINTS.inkDim,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
          }}
        >
          ~3 min
        </span>
        <span>
          We&apos;ll connect {connectorNames.join(', ')} and pick a starter set of routing rules.
          Skip anything you want to handle later.
        </span>
      </div>

      <footer style={{ display: 'flex', gap: 8 }}>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          data-testid="onboarding-welcome-continue"
          onClick={onContinue}
          style={{
            font: `500 12px ${PF_TINTS.sans}`,
            color: PF_TINTS.bg,
            background: PF_TINTS.ink,
            border: `1px solid ${PF_TINTS.ink}`,
            borderRadius: 3,
            padding: '10px 20px',
            cursor: 'pointer',
            letterSpacing: '-0.005em',
          }}
        >
          Get started →
        </button>
      </footer>
    </section>
  );
}

function ValueCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.sm,
        padding: 12,
      }}
    >
      <div
        style={{
          font: `600 13px/1.3 ${PF_TINTS.sans}`,
          color: PF_TINTS.ink,
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      <div style={{ color: PF_TINTS.inkSub, fontSize: 12, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}
