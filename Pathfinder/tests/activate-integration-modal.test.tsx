// @vitest-environment jsdom
//
// tests/activate-integration-modal.test.tsx — Demo Polish UX Gate 11B.
//
// ActivateIntegrationModal surface:
//   - Renders backdrop + card + Gmail/Outlook tiles when open
//   - Renders nothing when closed
//   - Esc + close button + backdrop click → onClose
//   - Each tile links to /pathfinder/api/email/oauth/start with the right
//     provider + actor params

import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { ActivateIntegrationModal } from '@/components/lead/ActivateIntegrationModal';

afterEach(() => cleanup());

describe('ActivateIntegrationModal — render', () => {
  it('renders nothing when closed', () => {
    render(
      <ActivateIntegrationModal
        open={false}
        onClose={() => undefined}
        actorEmail="kyle@freakngenius.com"
      />,
    );
    expect(screen.queryByTestId('activate-integration-modal-root')).toBeNull();
  });

  it('renders modal + Gmail + Outlook tiles when open', () => {
    render(
      <ActivateIntegrationModal
        open={true}
        onClose={() => undefined}
        actorEmail="kyle@freakngenius.com"
      />,
    );
    expect(screen.getByTestId('activate-integration-modal-root')).toBeInTheDocument();
    expect(screen.getByTestId('activate-integration-modal-card')).toBeInTheDocument();
    expect(screen.getByTestId('activate-integration-tile-gmail')).toBeInTheDocument();
    expect(screen.getByTestId('activate-integration-tile-outlook')).toBeInTheDocument();
  });

  it('renders the headline copy from spec', () => {
    render(
      <ActivateIntegrationModal
        open={true}
        onClose={() => undefined}
        actorEmail="kyle@freakngenius.com"
      />,
    );
    expect(screen.getByText(/Connect your email to send from Pathfinder/i)).toBeInTheDocument();
  });
});

describe('ActivateIntegrationModal — OAuth tile hrefs', () => {
  it('Gmail tile links to /api/email/oauth/start with provider=gmail and actor', () => {
    render(
      <ActivateIntegrationModal
        open={true}
        onClose={() => undefined}
        actorEmail="kyle@freakngenius.com"
      />,
    );
    const tile = screen.getByTestId('activate-integration-tile-gmail');
    const href = tile.getAttribute('href') ?? '';
    expect(href).toContain('/pathfinder/api/email/oauth/start');
    expect(href).toContain('provider=gmail');
    expect(href).toContain('actor=kyle%40freakngenius.com');
  });

  it('Outlook tile links to /api/email/oauth/start with provider=outlook', () => {
    render(
      <ActivateIntegrationModal
        open={true}
        onClose={() => undefined}
        actorEmail="kyle@freakngenius.com"
      />,
    );
    const tile = screen.getByTestId('activate-integration-tile-outlook');
    expect(tile.getAttribute('href')).toContain('provider=outlook');
  });
});

describe('ActivateIntegrationModal — close behavior', () => {
  it('Close button triggers onClose', () => {
    const onClose = vi.fn();
    render(
      <ActivateIntegrationModal
        open={true}
        onClose={onClose}
        actorEmail="kyle@freakngenius.com"
      />,
    );
    fireEvent.click(screen.getByTestId('activate-integration-modal-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('Backdrop click triggers onClose', () => {
    const onClose = vi.fn();
    render(
      <ActivateIntegrationModal
        open={true}
        onClose={onClose}
        actorEmail="kyle@freakngenius.com"
      />,
    );
    fireEvent.click(screen.getByTestId('activate-integration-modal-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('Esc keydown triggers onClose', () => {
    const onClose = vi.fn();
    render(
      <ActivateIntegrationModal
        open={true}
        onClose={onClose}
        actorEmail="kyle@freakngenius.com"
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
