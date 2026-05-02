'use client';

// Wizard — top-level client component for the C-4A onboarding wizard.
// Owns step state, URL-fragment sync, skip-state localStorage
// persistence, and orchestrates the per-step components.
//
// Spec: SPEC - Connectors (Slack, Teams, HubSpot).md § 7.3.
//
// State model:
//   - `step` is 0..5 (six steps total).
//   - URL fragment mirrors `step` as `#step-N` (1-indexed in the URL
//     for human readability — `#step-1` is Welcome).
//   - `skipped` is the set of connector ids the user explicitly skipped
//     in this session OR in a prior browser session (localStorage).
//
// localStorage key: `pathfinder.onboarding.skipped` — value is a JSON
// array of connector ids (`['slack', 'teams']`). No PII; survives reload
// per spec.

import * as React from 'react';

import { PF_TINTS } from '@/lib/agent-tints';
import type { ConnectorTileState } from '@/components/settings/connectors/ConnectorTile';
import type { ConnectorType } from '@/lib/types';
import { StepIndicator, type StepDef } from './StepIndicator';
import { WelcomeStep } from './WelcomeStep';
import { ConnectStep } from './ConnectStep';
import {
  QuickPickRulesStep,
  defaultSelection,
  type ConnectedConnectorInfo,
  type QuickPickRulesSelection,
} from './QuickPickRulesStep';
import { Done, type DoneSummaryConnector } from './Done';

export interface WizardConnectorSeed {
  type: ConnectorType;
  name: string;
  state: ConnectorTileState;
  authStartHref: string;
  /** When true, the OAuth route hasn't shipped yet — render Coming-soon. */
  comingSoon: boolean;
  whatItDoes: string[];
}

export interface WizardProps {
  orgId: string;
  connectors: WizardConnectorSeed[];
}

const STORAGE_KEY = 'pathfinder.onboarding.skipped';

const STEPS: StepDef[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'slack', label: 'Slack' },
  { id: 'teams', label: 'Teams' },
  { id: 'hubspot', label: 'HubSpot' },
  { id: 'rules', label: 'Routing rules' },
  { id: 'done', label: 'Done' },
];

export const TOTAL_STEPS = STEPS.length;

const CONNECTOR_AT_STEP: Record<number, ConnectorType> = {
  1: 'slack',
  2: 'teams',
  3: 'hubspot',
};

function readSkipped(): Set<ConnectorType> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    const valid: ConnectorType[] = [];
    for (const v of parsed) {
      if (v === 'slack' || v === 'teams' || v === 'hubspot') valid.push(v);
    }
    return new Set(valid);
  } catch {
    return new Set();
  }
}

function writeSkipped(set: Set<ConnectorType>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // localStorage may be disabled (private mode) — degrade silently.
  }
}

function parseStepFromHash(): number | null {
  if (typeof window === 'undefined') return null;
  const m = window.location.hash.match(/^#step-(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]) - 1;
  if (Number.isNaN(n) || n < 0 || n >= TOTAL_STEPS) return null;
  return n;
}

function writeStepToHash(step: number): void {
  if (typeof window === 'undefined') return;
  const target = `#step-${step + 1}`;
  if (window.location.hash !== target) {
    // Use replaceState so the back button doesn't trap inside the wizard.
    window.history.replaceState(null, '', target);
  }
}

export function Wizard({ orgId, connectors }: WizardProps) {
  const [step, setStep] = React.useState<number>(0);
  const [skipped, setSkipped] = React.useState<Set<ConnectorType>>(() => new Set());
  const [selection, setSelection] = React.useState<QuickPickRulesSelection>({});
  const [hydrated, setHydrated] = React.useState(false);

  // Hydrate from URL fragment + localStorage on mount.
  React.useEffect(() => {
    const fromHash = parseStepFromHash();
    if (fromHash !== null) setStep(fromHash);
    setSkipped(readSkipped());
    setHydrated(true);
    // Listen for hash changes so back/forward navigation works.
    const onHashChange = () => {
      const next = parseStepFromHash();
      if (next !== null) setStep(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Mirror step → URL hash.
  React.useEffect(() => {
    if (!hydrated) return;
    writeStepToHash(step);
  }, [step, hydrated]);

  // Initialise quick-pick selection once we know which connectors are
  // connected. Only run on first transition into step 4 so we don't
  // clobber user edits.
  const selectionInitedRef = React.useRef(false);
  React.useEffect(() => {
    if (step !== 4) return;
    if (selectionInitedRef.current) return;
    const connected = connectors
      .filter((c) => c.state === 'connected' && !skipped.has(c.type))
      .map<ConnectedConnectorInfo>((c) => ({ type: c.type, name: c.name }));
    setSelection(defaultSelection(connected));
    selectionInitedRef.current = true;
  }, [step, connectors, skipped]);

  const goTo = React.useCallback((next: number) => {
    if (next < 0 || next >= TOTAL_STEPS) return;
    setStep(next);
  }, []);

  const skipConnector = React.useCallback((type: ConnectorType) => {
    setSkipped((prev) => {
      const next = new Set(prev);
      next.add(type);
      writeSkipped(next);
      return next;
    });
  }, []);

  const renderStep = () => {
    if (step === 0) {
      return (
        <WelcomeStep
          connectorNames={connectors.map((c) => c.name)}
          onContinue={() => goTo(1)}
        />
      );
    }
    if (step >= 1 && step <= 3) {
      const type = CONNECTOR_AT_STEP[step];
      const seed = connectors.find((c) => c.type === type);
      if (!seed) {
        return <div data-testid={`onboarding-missing-connector-${type}`}>Missing connector seed for {type}.</div>;
      }
      return (
        <ConnectStep
          connectorId={seed.type}
          name={seed.name}
          authStartHref={seed.authStartHref}
          comingSoon={seed.comingSoon}
          state={seed.state}
          whatItDoes={seed.whatItDoes}
          isSkipped={skipped.has(seed.type)}
          isLastConnector={step === 3}
          onSkip={() => {
            skipConnector(seed.type);
            goTo(step + 1);
          }}
          onContinue={() => goTo(step + 1)}
        />
      );
    }
    if (step === 4) {
      const connected = connectors
        .filter((c) => c.state === 'connected' && !skipped.has(c.type))
        .map<ConnectedConnectorInfo>((c) => ({ type: c.type, name: c.name }));
      return (
        <QuickPickRulesStep
          connectedConnectors={connected}
          selection={selection}
          onSelectionChange={setSelection}
          onBack={() => goTo(3)}
          onContinue={() => goTo(5)}
        />
      );
    }
    // step === 5 → Done
    const summary: DoneSummaryConnector[] = connectors.map((c) => ({
      type: c.type,
      name: c.name,
      status:
        c.state === 'connected'
          ? 'connected'
          : c.comingSoon
            ? 'coming-soon'
            : skipped.has(c.type)
              ? 'skipped'
              : 'skipped',
    }));
    return <Done connectors={summary} selection={selection} onBack={() => goTo(4)} />;
  };

  return (
    <div
      data-testid="onboarding-wizard-root"
      data-current-step={step}
      style={{
        minHeight: '100vh',
        background: PF_TINTS.bgAlt,
        color: PF_TINTS.ink,
        font: `400 13px/1.5 ${PF_TINTS.sans}`,
      }}
    >
      <style>{`@keyframes pf-spin { to { transform: rotate(360deg); } }`}</style>

      <header
        style={{
          height: 56,
          background: PF_TINTS.bg,
          borderBottom: `1px solid ${PF_TINTS.ruleSoft}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          gap: 16,
        }}
      >
        <span
          style={{
            font: `600 13px ${PF_TINTS.sans}`,
            color: PF_TINTS.ink,
            letterSpacing: '-0.005em',
          }}
        >
          Pathfinder
        </span>
        <span
          className="pf-mono"
          style={{
            fontSize: 9,
            color: PF_TINTS.inkDim,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
          }}
        >
          / onboarding / connectors
        </span>
        <span style={{ flex: 1 }} />
        <span
          className="pf-mono"
          data-testid="onboarding-org-pill"
          style={{
            fontSize: 9,
            color: PF_TINTS.inkDim,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            padding: '3px 8px',
            border: `1px solid ${PF_TINTS.ruleSoft}`,
            borderRadius: 3,
          }}
        >
          org / {orgId}
        </span>
      </header>

      <main style={{ maxWidth: 880, margin: '0 auto', padding: '32px 24px 64px' }}>
        <div style={{ marginBottom: 24 }}>
          <StepIndicator steps={STEPS} currentStep={step} onStepClick={goTo} />
        </div>
        {renderStep()}
      </main>
    </div>
  );
}
