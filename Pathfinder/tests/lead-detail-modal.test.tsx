// @vitest-environment jsdom
//
// tests/lead-detail-modal.test.tsx — Demo Polish UX Gate 9A.
//
// LeadDetailModal shell behavior:
//   - Renders the close button + position caption + cycle hint
//   - Esc key → close (router.push to '/' — basePath '/pathfinder' is
//     auto-prepended by Next.js, yielding '/pathfinder/' at runtime)
//   - Click on backdrop → close
//   - Arrow Right / Down → next neighbor (cycles)
//   - Arrow Left / Up → previous neighbor (cycles)
//   - Single-lead set → arrow keys are no-ops
//   - Arrow keys do NOT trigger when focus is in an input/textarea
//
// next/navigation's useRouter is mocked at the test level so we can
// assert push() calls without a real Next runtime.

import * as React from 'react';
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn(), replace: vi.fn() }),
}));

import { LeadDetailModal } from '@/components/lead/LeadDetailModal';

beforeEach(() => {
  mockPush.mockReset();
});
afterEach(() => cleanup());

function renderModal(opts: {
  current?: string;
  neighbors?: string[];
  closeHref?: string;
} = {}) {
  return render(
    <LeadDetailModal
      currentProjectId={opts.current ?? 'sam.gov:p2'}
      neighborIds={opts.neighbors ?? ['sam.gov:p1', 'sam.gov:p2', 'sam.gov:p3']}
      closeHref={opts.closeHref}
    >
      <div data-testid="lead-detail-modal-content">child content</div>
    </LeadDetailModal>,
  );
}

describe('LeadDetailModal — shell', () => {
  it('renders the modal card, backdrop, body, and close button', () => {
    renderModal();
    expect(screen.getByTestId('lead-detail-modal-root')).toBeInTheDocument();
    expect(screen.getByTestId('lead-detail-modal-backdrop')).toBeInTheDocument();
    expect(screen.getByTestId('lead-detail-modal-card')).toBeInTheDocument();
    expect(screen.getByTestId('lead-detail-modal-body')).toBeInTheDocument();
    expect(screen.getByTestId('lead-detail-modal-close')).toBeInTheDocument();
  });

  it('renders position caption "Lead 2 / 3" for current=p2 in [p1,p2,p3]', () => {
    renderModal();
    expect(screen.getByTestId('lead-detail-modal-position')).toHaveTextContent(
      '2 / 3',
    );
  });

  it('does NOT render position caption when only one neighbor', () => {
    renderModal({ neighbors: ['only'] , current: 'only' });
    expect(screen.queryByTestId('lead-detail-modal-position')).toBeNull();
  });

  it('child content is rendered inside the modal body', () => {
    renderModal();
    expect(screen.getByTestId('lead-detail-modal-content')).toBeInTheDocument();
  });
});

describe('LeadDetailModal — close behavior', () => {
  // Regression guard for Gate 12F: closeHref MUST be '/' (root-relative),
  // not '/pathfinder'. Next.js auto-prepends basePath ('/pathfinder') to
  // user-supplied URLs, so passing '/pathfinder' here yields the broken
  // '/pathfinder/pathfinder' (404). The default must stay '/'.
  it('clicking close button pushes to "/" by default (basePath auto-prepends to /pathfinder/)', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('lead-detail-modal-close'));
    expect(mockPush).toHaveBeenCalledWith('/');
    expect(mockPush).not.toHaveBeenCalledWith('/pathfinder');
  });

  it('clicking the backdrop closes the modal', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('lead-detail-modal-backdrop'));
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('Esc key closes the modal', () => {
    renderModal();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('honors a custom closeHref override', () => {
    renderModal({ closeHref: '/some/custom/path' });
    fireEvent.click(screen.getByTestId('lead-detail-modal-close'));
    expect(mockPush).toHaveBeenCalledWith('/some/custom/path');
  });
});

describe('LeadDetailModal — arrow-key cycling', () => {
  it('Arrow Right navigates to the next neighbor', () => {
    renderModal({ current: 'sam.gov:p2', neighbors: ['sam.gov:p1', 'sam.gov:p2', 'sam.gov:p3'] });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(mockPush).toHaveBeenLastCalledWith(
      '/pathfinder/leads/sam.gov%3Ap3',
    );
  });

  it('Arrow Down also navigates to the next neighbor', () => {
    renderModal({ current: 'sam.gov:p2', neighbors: ['sam.gov:p1', 'sam.gov:p2', 'sam.gov:p3'] });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(mockPush).toHaveBeenLastCalledWith(
      '/pathfinder/leads/sam.gov%3Ap3',
    );
  });

  it('Arrow Right wraps from the last neighbor back to the first', () => {
    renderModal({ current: 'sam.gov:p3', neighbors: ['sam.gov:p1', 'sam.gov:p2', 'sam.gov:p3'] });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(mockPush).toHaveBeenLastCalledWith(
      '/pathfinder/leads/sam.gov%3Ap1',
    );
  });

  it('Arrow Left navigates to the previous neighbor', () => {
    renderModal({ current: 'sam.gov:p2', neighbors: ['sam.gov:p1', 'sam.gov:p2', 'sam.gov:p3'] });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(mockPush).toHaveBeenLastCalledWith(
      '/pathfinder/leads/sam.gov%3Ap1',
    );
  });

  it('Arrow Left wraps from the first neighbor back to the last', () => {
    renderModal({ current: 'sam.gov:p1', neighbors: ['sam.gov:p1', 'sam.gov:p2', 'sam.gov:p3'] });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(mockPush).toHaveBeenLastCalledWith(
      '/pathfinder/leads/sam.gov%3Ap3',
    );
  });

  it('Arrow Up also navigates to the previous neighbor', () => {
    renderModal({ current: 'sam.gov:p2', neighbors: ['sam.gov:p1', 'sam.gov:p2', 'sam.gov:p3'] });
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(mockPush).toHaveBeenLastCalledWith(
      '/pathfinder/leads/sam.gov%3Ap1',
    );
  });

  it('arrow keys are no-ops when only one neighbor', () => {
    renderModal({ current: 'only', neighbors: ['only'] });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does NOT cycle when focus is inside a textarea', () => {
    render(
      <LeadDetailModal
        currentProjectId="sam.gov:p2"
        neighborIds={['sam.gov:p1', 'sam.gov:p2', 'sam.gov:p3']}
      >
        <textarea data-testid="composer-body" defaultValue="" />
      </LeadDetailModal>,
    );
    const ta = screen.getByTestId('composer-body');
    ta.focus();
    fireEvent.keyDown(ta, { key: 'ArrowRight' });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does NOT cycle when focus is inside an input', () => {
    render(
      <LeadDetailModal
        currentProjectId="sam.gov:p2"
        neighborIds={['sam.gov:p1', 'sam.gov:p2', 'sam.gov:p3']}
      >
        <input data-testid="composer-subject" defaultValue="" />
      </LeadDetailModal>,
    );
    const inp = screen.getByTestId('composer-subject');
    inp.focus();
    fireEvent.keyDown(inp, { key: 'ArrowLeft' });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('Esc key still closes even when focused in a textarea', () => {
    render(
      <LeadDetailModal
        currentProjectId="sam.gov:p2"
        neighborIds={['sam.gov:p1', 'sam.gov:p2', 'sam.gov:p3']}
      >
        <textarea data-testid="composer-body" defaultValue="" />
      </LeadDetailModal>,
    );
    const ta = screen.getByTestId('composer-body');
    ta.focus();
    fireEvent.keyDown(ta, { key: 'Escape' });
    expect(mockPush).toHaveBeenCalledWith('/');
  });
});

// Gate 15A — Modal backdrop styling.
//
// The lead detail now ships as an intercepting route over the live
// dashboard map (app/@modal/(.)leads/[projectId]/page.tsx). The
// backdrop is 40% black + 12px blur (Tailwind backdrop-blur-md
// equivalent) so the map is visible through the dim. Standalone direct
// URL loads no longer go through this modal shell.
describe('LeadDetailModal — backdrop styling (Gate 15A)', () => {
  it('renders a 40%-opacity black backdrop with 12px blur', () => {
    renderModal();
    const backdrop = screen.getByTestId('lead-detail-modal-backdrop');
    const bg = backdrop.style.background || backdrop.style.backgroundColor;
    // Must be an rgba() black fill at ~40% opacity — never solid white.
    expect(bg).toMatch(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0?\.4\s*\)/);
    expect(bg).not.toMatch(/#fff/i);
    expect(bg).not.toMatch(/white/i);
    // Alpha must read through (not near-opaque) so the underlying map
    // remains visible behind the modal.
    const alphaMatch = bg.match(
      /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*(0?\.\d+)\s*\)/,
    );
    expect(alphaMatch).not.toBeNull();
    const alpha = Number(alphaMatch![1]);
    expect(alpha).toBeGreaterThan(0.2);
    expect(alpha).toBeLessThanOrEqual(0.5);
    // Blur upgraded from 8px → 12px (Tailwind backdrop-blur-md
    // equivalent) per Gate 15A.
    expect(backdrop.style.backdropFilter).toBe('blur(12px)');
    expect(
      (backdrop.style as unknown as Record<string, string>)[
        'WebkitBackdropFilter'
      ],
    ).toBe('blur(12px)');
  });

  it('backdrop covers the viewport (position absolute, inset 0)', () => {
    renderModal();
    const backdrop = screen.getByTestId('lead-detail-modal-backdrop');
    expect(backdrop.style.position).toBe('absolute');
    // jsdom serializes `inset: 0` as `'0'` (no unit) on the inline style.
    expect(['0', '0px']).toContain(backdrop.style.inset);
  });
});
