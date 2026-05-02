// @vitest-environment jsdom
//
// tests/onboarding-connectors/wizard-state.test.tsx
//
// Behavioral tests for the C-4A onboarding wizard:
//   - step navigation (welcome → slack → teams → hubspot → rules → done)
//   - skip-state localStorage persistence across remount
//   - URL-fragment sync on step change
//   - graceful degrade for connectors marked `comingSoon` (Teams pre-C-2A,
//     HubSpot pre-C-3A)
//   - Connect button href routes to the OAuth start endpoint with org_id

import * as React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { Wizard, type WizardConnectorSeed } from '@/components/onboarding/Wizard';

const STORAGE_KEY = 'pathfinder.onboarding.skipped';

function makeSeeds(overrides: Partial<Record<WizardConnectorSeed['type'], Partial<WizardConnectorSeed>>> = {}): WizardConnectorSeed[] {
  const base: WizardConnectorSeed[] = [
    {
      type: 'slack',
      name: 'Slack',
      state: 'disconnected',
      authStartHref: '/pathfinder/api/connectors/slack/auth?org_id=zedcor',
      comingSoon: false,
      whatItDoes: ['alert', 'brief'],
    },
    {
      type: 'teams',
      name: 'Microsoft Teams',
      state: 'disconnected',
      authStartHref: '/pathfinder/api/connectors/teams/auth?org_id=zedcor',
      comingSoon: true,
      whatItDoes: ['alert', 'brief'],
    },
    {
      type: 'hubspot',
      name: 'HubSpot',
      state: 'disconnected',
      authStartHref: '/pathfinder/api/connectors/hubspot/auth?org_id=zedcor',
      comingSoon: true,
      whatItDoes: ['sync', 'pipeline'],
    },
  ];
  return base.map((c) => ({ ...c, ...(overrides[c.type] ?? {}) }));
}

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.location.hash = '';
});

describe('Wizard — step navigation', () => {
  it('starts on the welcome step and advances on Get started', () => {
    render(<Wizard orgId="zedcor" connectors={makeSeeds()} />);
    expect(screen.getByTestId('onboarding-welcome-step')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-wizard-root')).toHaveAttribute('data-current-step', '0');

    fireEvent.click(screen.getByTestId('onboarding-welcome-continue'));
    expect(screen.getByTestId('onboarding-wizard-root')).toHaveAttribute('data-current-step', '1');
    expect(screen.getByTestId('onboarding-connect-step-slack')).toBeInTheDocument();
  });

  it('renders the Slack Connect button as a link to the OAuth start endpoint with org_id', () => {
    render(<Wizard orgId="zedcor" connectors={makeSeeds()} />);
    fireEvent.click(screen.getByTestId('onboarding-welcome-continue'));
    const link = screen.getByTestId('onboarding-connect-step-slack-connect');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/pathfinder/api/connectors/slack/auth?org_id=zedcor');
  });

  it('shows the Coming-soon block for Teams when comingSoon=true and hides the Connect button', () => {
    render(<Wizard orgId="zedcor" connectors={makeSeeds()} />);
    // Jump to step 2 (Teams)
    fireEvent.click(screen.getByTestId('onboarding-welcome-continue'));
    fireEvent.click(screen.getByTestId('onboarding-connect-step-slack-skip'));
    expect(screen.getByTestId('onboarding-connect-step-teams-coming-soon')).toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-connect-step-teams-connect')).not.toBeInTheDocument();
  });

  it('reaches the Done step after walking through all connector steps', () => {
    render(<Wizard orgId="zedcor" connectors={makeSeeds()} />);
    fireEvent.click(screen.getByTestId('onboarding-welcome-continue'));
    fireEvent.click(screen.getByTestId('onboarding-connect-step-slack-skip'));
    fireEvent.click(screen.getByTestId('onboarding-connect-step-teams-skip'));
    fireEvent.click(screen.getByTestId('onboarding-connect-step-hubspot-skip'));
    // Now on routing-rules step (4)
    expect(screen.getByTestId('onboarding-quick-pick-step')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('onboarding-quick-pick-continue'));
    // Now on done step (5)
    expect(screen.getByTestId('onboarding-done')).toBeInTheDocument();
  });
});

describe('Wizard — skip state', () => {
  it('persists skipped connectors to localStorage', () => {
    render(<Wizard orgId="zedcor" connectors={makeSeeds()} />);
    fireEvent.click(screen.getByTestId('onboarding-welcome-continue'));
    fireEvent.click(screen.getByTestId('onboarding-connect-step-slack-skip'));
    const stored = window.localStorage.getItem(STORAGE_KEY);
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored ?? '[]')).toContain('slack');
  });

  it('rehydrates skip state from localStorage on remount', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['slack']));
    render(<Wizard orgId="zedcor" connectors={makeSeeds()} />);
    // Walk to slack step
    fireEvent.click(screen.getByTestId('onboarding-welcome-continue'));
    expect(screen.getByTestId('onboarding-connect-step-slack-skipped-badge')).toBeInTheDocument();
  });

  it('ignores malformed localStorage values', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');
    expect(() =>
      render(<Wizard orgId="zedcor" connectors={makeSeeds()} />),
    ).not.toThrow();
  });
});

describe('Wizard — URL fragment', () => {
  it('mirrors the current step into the URL hash as #step-N (1-indexed)', () => {
    render(<Wizard orgId="zedcor" connectors={makeSeeds()} />);
    fireEvent.click(screen.getByTestId('onboarding-welcome-continue'));
    expect(window.location.hash).toBe('#step-2');
  });

  it('starts at the step indicated by the hash on mount', async () => {
    window.location.hash = '#step-3'; // Teams
    render(<Wizard orgId="zedcor" connectors={makeSeeds()} />);
    // Effect runs on mount; the wizard root reflects step 2 (0-indexed).
    expect(screen.getByTestId('onboarding-wizard-root')).toHaveAttribute('data-current-step', '2');
    expect(screen.getByTestId('onboarding-connect-step-teams')).toBeInTheDocument();
  });

  it('responds to hashchange events (back/forward navigation)', () => {
    render(<Wizard orgId="zedcor" connectors={makeSeeds()} />);
    fireEvent.click(screen.getByTestId('onboarding-welcome-continue'));
    expect(screen.getByTestId('onboarding-wizard-root')).toHaveAttribute('data-current-step', '1');

    act(() => {
      window.location.hash = '#step-1';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByTestId('onboarding-wizard-root')).toHaveAttribute('data-current-step', '0');
  });
});

describe('Wizard — quick-pick rules', () => {
  it('only shows quick-pick blocks for connectors that are connected and not skipped', () => {
    const seeds = makeSeeds({
      slack: { state: 'connected' },
      teams: { state: 'connected', comingSoon: false },
    });
    render(<Wizard orgId="zedcor" connectors={seeds} />);
    // Skip through to step 4
    fireEvent.click(screen.getByTestId('onboarding-welcome-continue'));
    fireEvent.click(screen.getByTestId('onboarding-connect-step-slack-continue'));
    fireEvent.click(screen.getByTestId('onboarding-connect-step-teams-continue'));
    fireEvent.click(screen.getByTestId('onboarding-connect-step-hubspot-skip'));
    expect(screen.getByTestId('onboarding-quick-pick-block-slack')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-quick-pick-block-teams')).toBeInTheDocument();
    // HubSpot is skipped + has no quick-pick rules anyway
    expect(screen.queryByTestId('onboarding-quick-pick-block-hubspot')).not.toBeInTheDocument();
  });

  it('shows the empty-state copy when no chat connectors are connected', () => {
    render(<Wizard orgId="zedcor" connectors={makeSeeds()} />);
    fireEvent.click(screen.getByTestId('onboarding-welcome-continue'));
    fireEvent.click(screen.getByTestId('onboarding-connect-step-slack-skip'));
    fireEvent.click(screen.getByTestId('onboarding-connect-step-teams-skip'));
    fireEvent.click(screen.getByTestId('onboarding-connect-step-hubspot-skip'));
    expect(screen.getByTestId('onboarding-quick-pick-empty')).toBeInTheDocument();
  });
});

describe('Wizard — done summary', () => {
  it('lists each connector in the summary with its final status', () => {
    const seeds = makeSeeds({ slack: { state: 'connected' } });
    render(<Wizard orgId="zedcor" connectors={seeds} />);
    fireEvent.click(screen.getByTestId('onboarding-welcome-continue'));
    fireEvent.click(screen.getByTestId('onboarding-connect-step-slack-continue'));
    fireEvent.click(screen.getByTestId('onboarding-connect-step-teams-skip'));
    fireEvent.click(screen.getByTestId('onboarding-connect-step-hubspot-skip'));
    fireEvent.click(screen.getByTestId('onboarding-quick-pick-continue'));

    expect(screen.getByTestId('onboarding-done-connector-slack')).toHaveTextContent(/connected/i);
    expect(screen.getByTestId('onboarding-done-connector-teams')).toHaveTextContent(/coming soon|skipped/i);
    expect(screen.getByTestId('onboarding-done-connector-hubspot')).toHaveTextContent(/coming soon|skipped/i);
    expect(screen.getByTestId('onboarding-done-cta').getAttribute('href')).toBe(
      '/pathfinder/settings/connectors',
    );
  });
});
