'use client';

// StepIndicator — visual progress bar for the C-4A onboarding wizard.
// Six steps, hairline-bordered pills, soft shadows. Mirrors the
// connector tile styling in components/settings/connectors/ConnectorTile.tsx
// so the wizard reads as part of the same surface.
//
// Spec: SPEC - Connectors (Slack, Teams, HubSpot).md § 7.3.

import * as React from 'react';

import { PF_TINTS, hexAlpha } from '@/lib/agent-tints';

export interface StepDef {
  id: string;
  label: string;
}

export interface StepIndicatorProps {
  steps: StepDef[];
  currentStep: number; // 0-indexed
  onStepClick?: (index: number) => void;
}

export function StepIndicator({ steps, currentStep, onStepClick }: StepIndicatorProps) {
  return (
    <ol
      data-testid="onboarding-step-indicator"
      style={{
        display: 'flex',
        gap: 8,
        padding: 0,
        margin: 0,
        listStyle: 'none',
        flexWrap: 'wrap',
      }}
    >
      {steps.map((step, idx) => {
        const isActive = idx === currentStep;
        const isComplete = idx < currentStep;
        const clickable = Boolean(onStepClick) && idx <= currentStep;

        let bg: string = PF_TINTS.bg;
        let fg: string = PF_TINTS.inkSub;
        let ring: string = PF_TINTS.ruleSoft;
        if (isActive) {
          bg = PF_TINTS.ink;
          fg = PF_TINTS.bg;
          ring = PF_TINTS.ink;
        } else if (isComplete) {
          bg = hexAlpha('#198754', 0.12);
          fg = '#198754';
          ring = 'rgba(25,135,84,0.40)';
        }

        return (
          <li key={step.id} style={{ flex: '0 1 auto' }}>
            <button
              type="button"
              data-testid={`onboarding-step-pill-${idx}`}
              data-state={isActive ? 'active' : isComplete ? 'complete' : 'pending'}
              onClick={clickable && onStepClick ? () => onStepClick(idx) : undefined}
              disabled={!clickable}
              aria-current={isActive ? 'step' : undefined}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: bg,
                color: fg,
                border: `1px solid ${ring}`,
                borderRadius: 3,
                padding: '6px 10px',
                font: `500 11px ${PF_TINTS.sans}`,
                cursor: clickable ? 'pointer' : 'default',
                boxShadow: isActive ? PF_TINTS.shadow.sm : 'none',
                letterSpacing: '-0.005em',
              }}
            >
              <span
                className="pf-mono"
                aria-hidden="true"
                style={{
                  fontSize: 9,
                  letterSpacing: '0.08em',
                  opacity: 0.7,
                }}
              >
                {String(idx + 1).padStart(2, '0')}
              </span>
              <span>{step.label}</span>
              {isComplete && (
                <span aria-hidden="true" style={{ fontSize: 11 }}>
                  ✓
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
