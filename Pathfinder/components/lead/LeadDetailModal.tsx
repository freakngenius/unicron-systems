'use client';

// components/lead/LeadDetailModal.tsx — Demo Polish UX Gate 9A.
//
// Full-screen modal shell wrapping LeadDetail at the page route. The lead
// view is presented as a 75%-viewport-wide, 90vh-tall card with 10px
// rounded corners on a dim + blur backdrop. The shell handles:
//
//   - Close button (top-right ✕) → router back to /pathfinder
//   - Esc key → router back to /pathfinder
//   - Arrow Right / Arrow Down → next lead (cycles)
//   - Arrow Left  / Arrow Up   → previous lead (cycles)
//   - Body scroll lock while open
//
// Neighbor IDs are server-fetched on the page route and passed as
// `neighborIds`. When fewer than two leads in the set, arrow keys are
// no-ops (single-lead view).

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';

interface Props {
  /** Project ID currently displayed; used to find prev/next in neighborIds. */
  currentProjectId: string;
  /** Ranked project ID list (score desc, posted_date desc) — see page.tsx. */
  neighborIds: string[];
  /** The LeadDetail tree to render inside the modal body. */
  children: React.ReactNode;
  /** Override route for Close / Esc. Defaults to /pathfinder dashboard. */
  closeHref?: string;
}

export function LeadDetailModal({
  currentProjectId,
  neighborIds,
  children,
  closeHref = '/pathfinder',
}: Props): React.ReactElement {
  const router = useRouter();

  const close = React.useCallback(() => {
    router.push(closeHref);
  }, [router, closeHref]);

  const navigateToNeighbor = React.useCallback(
    (delta: 1 | -1) => {
      if (neighborIds.length < 2) return;
      const idx = neighborIds.indexOf(currentProjectId);
      // If current id isn't in the neighbor list (e.g. filter-mismatch
      // deep-link), fall back to the first neighbor.
      const base = idx === -1 ? 0 : idx;
      const next = (base + delta + neighborIds.length) % neighborIds.length;
      const nextId = neighborIds[next];
      if (nextId === currentProjectId) return;
      router.push(`/pathfinder/leads/${encodeURIComponent(nextId)}`);
    },
    [router, currentProjectId, neighborIds],
  );

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't hijack arrow keys while the operator is typing in an input
      // / textarea / contenteditable surface (Outreach composer, search,
      // etc.) — that would make typing in the body feel broken.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        tag === 'input' ||
        tag === 'textarea' ||
        target?.isContentEditable === true;

      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (isEditable) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        navigateToNeighbor(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        navigateToNeighbor(-1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close, navigateToNeighbor]);

  // Lock body scroll while the modal is open. The shell's own body is
  // the scroll container.
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Position in the ranked set — surfaced as a small mono caption so
  // the operator can see "lead 3 of 50" while cycling.
  const idx = neighborIds.indexOf(currentProjectId);
  const positionLabel =
    neighborIds.length > 1 && idx !== -1
      ? `${idx + 1} / ${neighborIds.length}`
      : null;

  return (
    <div
      data-testid="lead-detail-modal-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Backdrop — click-to-close + dim + blur.
       *
       * Gate 15A: the lead detail now ships as an intercepting route
       * (`app/@modal/(.)leads/[projectId]/page.tsx`) over the dashboard
       * map. Backdrop is 40% black + 12px blur (Tailwind
       * backdrop-blur-md equivalent) so the live map reads through the
       * dim. The standalone route at `app/leads/[projectId]/page.tsx`
       * no longer wraps in this shell, so we no longer need the
       * Gate-12A near-opaque dark fill that covered the white body
       * background.
       */}
      <div
        data-testid="lead-detail-modal-backdrop"
        onClick={close}
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      />

      {/* Card — 75% viewport width, 90vh, 10px rounded corners, scrollable. */}
      <div
        data-testid="lead-detail-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Lead detail"
        style={{
          position: 'relative',
          width: '75vw',
          maxWidth: 1400,
          height: '90vh',
          background: PF_TINTS.bgAlt,
          border: `1px solid ${PF_TINTS.ruleSoft}`,
          borderRadius: 10,
          boxShadow: '0 24px 64px rgba(10,10,10,0.32), 0 0 0 1px rgba(10,10,10,0.06)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Top bar — Close button + position caption + Esc hint. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            borderBottom: `1px solid ${PF_TINTS.ruleHair}`,
            background: PF_TINTS.bg,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              font: `500 10px ${PF_TINTS.mono}`,
              color: PF_TINTS.inkDim,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {positionLabel && (
              <span data-testid="lead-detail-modal-position">
                Lead {positionLabel}
              </span>
            )}
            {neighborIds.length > 1 && (
              <span
                style={{
                  paddingLeft: 12,
                  borderLeft: `1px solid ${PF_TINTS.ruleHair}`,
                  color: PF_TINTS.inkDim,
                }}
              >
                ← / → to cycle
              </span>
            )}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                font: `500 10px ${PF_TINTS.mono}`,
                color: PF_TINTS.inkDim,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Esc to close
            </span>
            <button
              type="button"
              onClick={close}
              data-testid="lead-detail-modal-close"
              aria-label="Close lead detail"
              style={{
                background: PF_TINTS.bgAlt,
                border: `1px solid ${PF_TINTS.ruleSoft}`,
                borderRadius: 4,
                width: 32,
                height: 28,
                font: `500 14px ${PF_TINTS.sans}`,
                color: PF_TINTS.ink,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  hexAlpha(PF_TINTS.ink, 0.06);
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  PF_TINTS.bgAlt;
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable body — owns the lead view. */}
        <div
          data-testid="lead-detail-modal-body"
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            background: PF_TINTS.bgAlt,
          }}
          className="pf-scrollbar"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
