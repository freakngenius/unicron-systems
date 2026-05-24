'use client';

// TopBar — floating chrome panel at the top of the dashboard. Hosts the brand mark,
// source filter pills, cross-pollination toggle, the four LiveStat slots, and the
// pulsing LIVE dot. Mirrors `TopBar` in `pathfinder-prototype/project/hifi-shell.jsx`.

import * as React from 'react';
import { LiveStat, PulsingDot } from './live';
import { EscalationPill } from './EscalationPill';
import { useHidden, unhideAll } from '@/lib/user-prefs';

const PF = {
  bg: '#ffffff',
  ink: '#0a0a0a',
  inkDim: '#6b7280',
  inkFaint: '#9ca3af',
  hi: '#22d3ee',
  warm: '#a3e635',
  ruleSoft: 'rgba(10,10,10,0.12)',
} as const;

export type SourceKey =
  | 'all'
  | 'pc'
  | 'usa'
  | 'sam'
  | 'news'
  | 'harris';

export const SOURCE_LABELS: Record<SourceKey, string> = {
  all: 'All sources',
  pc: 'Perplexity Computer',
  usa: 'USAspending',
  sam: 'SAM.gov',
  news: 'Google News',
  harris: 'Harris Co.',
};

export const SOURCE_KEYS: readonly SourceKey[] = [
  'all',
  'pc',
  'usa',
  'sam',
  'news',
  'harris',
] as const;

function UnhideButton() {
  const hidden = useHidden();
  const count = hidden.size;
  const disabled = count === 0;
  return (
    <button
      type="button"
      className="pf-pill"
      onClick={() => unhideAll()}
      disabled={disabled}
      title={
        disabled
          ? 'Nothing hidden. Hide opportunities from any project row to stash them out of the way.'
          : `Unhide all (${count}) opportunit${count === 1 ? 'y' : 'ies'} you've hidden`
      }
      aria-label="Unhide all hidden opportunities"
      style={{
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
      }}
    >
      <EyeIcon open={disabled} />
      Unhide{count > 0 ? ` · ${count}` : ''}
    </button>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  // Open eye when there's nothing to unhide; closed/struck-through eye when
  // hidden items exist (the affordance is "click to open them").
  if (open) {
    return (
      <svg
        width={11}
        height={11}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M1 8 c1.5-3 4-5 7-5 c3 0 5.5 2 7 5 c-1.5 3-4 5-7 5 c-3 0-5.5-2-7-5 z" />
        <circle cx="8" cy="8" r="2" />
      </svg>
    );
  }
  return (
    <svg
      width={11}
      height={11}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1.5 1.5 L14.5 14.5" />
      <path d="M2 8 c1-2 2.5-3.5 4.5-4.4" />
      <path d="M9.5 3.7 c2.5 .6 4.5 2.4 5.5 4.3 c-1 1.9-2.7 3.5-4.7 4.3" />
      <path d="M6 6 a 2.5 2.5 0 0 0 4 4" />
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width={11}
      height={11}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        display: 'inline-block',
        animation: spinning ? 'pf-spin 800ms linear infinite' : 'none',
      }}
      aria-hidden="true"
    >
      <path d="M14 8a6 6 0 1 1-1.76-4.24" />
      <path d="M14 2v4h-4" />
    </svg>
  );
}

if (typeof document !== 'undefined' && !document.getElementById('pf-spin-kf')) {
  const s = document.createElement('style');
  s.id = 'pf-spin-kf';
  s.textContent = `@keyframes pf-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
  document.head.appendChild(s);
}

// Drawer transitions injected as a stylesheet so we can honor
// `prefers-reduced-motion`. Inline-style transitions can't be media-queried;
// these classes can.
if (typeof document !== 'undefined' && !document.getElementById('pf-src-drawer-css')) {
  const s = document.createElement('style');
  s.id = 'pf-src-drawer-css';
  s.textContent = `
    .pf-src-chevron { transition: transform 160ms cubic-bezier(0.16, 1, 0.3, 1); }
    .pf-src-pop { transition: opacity 160ms cubic-bezier(0.16, 1, 0.3, 1), transform 160ms cubic-bezier(0.16, 1, 0.3, 1); }
    @media (prefers-reduced-motion: reduce) {
      .pf-src-chevron, .pf-src-pop { transition: none !important; }
    }
  `;
  document.head.appendChild(s);
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      width={9}
      height={9}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="pf-src-chevron"
      style={{
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        marginLeft: 2,
      }}
    >
      <path d="M3 6l5 5 5-5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width={11}
      height={11}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}

function SourcesDrawer({
  source,
  setSource,
}: {
  source: SourceKey;
  setSource: (s: SourceKey) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const popoverRef = React.useRef<HTMLDivElement | null>(null);

  // Outside-click + ESC closes. Effect runs only while open so we don't
  // attach/detach unnecessarily.
  React.useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (popoverRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={triggerRef}
        type="button"
        className="pf-pill"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="topbar-sources-popover"
        title="Filter projects by source"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        Sources
        <ChevronDownIcon open={open} />
      </button>

      <div
        ref={popoverRef}
        id="topbar-sources-popover"
        role="listbox"
        aria-label="Filter projects by source"
        className="pf-src-pop"
        style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 6,
          minWidth: 200,
          background: PF.bg,
          border: `1px solid ${PF.ruleSoft}`,
          borderRadius: 5,
          boxShadow:
            '0 12px 32px rgba(10,10,10,0.16), 0 0 0 1px rgba(10,10,10,0.08)',
          padding: 4,
          zIndex: 10,
          opacity: open ? 1 : 0,
          transform: open ? 'translateY(0)' : 'translateY(-4px)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {SOURCE_KEYS.map((s) => {
          const active = source === s;
          return (
            <button
              key={s}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => {
                setSource(s);
                setOpen(false);
                triggerRef.current?.focus();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '8px 10px',
                borderRadius: 3,
                font: '500 12px/1 var(--font-inter), system-ui, sans-serif',
                color: PF.ink,
                background: 'transparent',
                border: 0,
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
                fontWeight: active ? 600 : 500,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(10,10,10,0.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span>{SOURCE_LABELS[s]}</span>
              {active ? <CheckIcon /> : <span style={{ width: 11 }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface TopBarProps {
  source: SourceKey;
  setSource: (s: SourceKey) => void;
  crossPoll: boolean;
  setCrossPoll: (v: boolean) => void;
  /** Manually triggers an Ingestor → Ranker cycle via /api/refresh. */
  onRefresh: () => void;
  refreshing: boolean;
  /** Click handler for one of the live stats — opens the StatPopover. */
  onStatClick?: (bucket: 'new' | 'total' | 'ranked') => void;
  /** Number of Verifier-escalated projects (pass_count >= 2). */
  escalationCount?: number;
  /** Whether the EscalationPopover is currently open. */
  escalationOpen?: boolean;
  /** Click handler for the EscalationPill. */
  onEscalationClick?: () => void;
  /** Whether the Intelligence Chat panel is open. */
  chatOpen?: boolean;
  /** Click handler for the chat toggle pill. */
  onChatToggle?: () => void;
}

export function TopBar({
  source,
  setSource,
  crossPoll,
  setCrossPoll,
  onRefresh,
  refreshing,
  onStatClick,
  escalationCount = 0,
  escalationOpen = false,
  onEscalationClick,
  chatOpen = false,
  onChatToggle,
}: TopBarProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        right: 16,
        height: 52,
        background: PF.bg,
        border: `1px solid ${PF.ruleSoft}`,
        borderRadius: 5,
        boxShadow: '0 4px 12px rgba(10,10,10,0.08), 0 0 0 1px rgba(10,10,10,0.06)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 16,
        zIndex: 5,
      }}
    >
      {/* Brand mark + wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* SVG mark — basePath-aware (we serve under /pathfinder) so the
            static file resolves against `public/pathfinder_mark.svg`. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/pathfinder/pathfinder_mark.svg"
          alt="Pathfinder"
          width={28}
          height={28}
          style={{ display: 'block', flexShrink: 0 }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, whiteSpace: 'nowrap' }}>
          {/* SVG wordmark (viewBox 138.78×15.86, aspect ~8.75:1). Height
              18 / width 158 are integer pixel dimensions matching the
              SVG's natural aspect (138.78 / 15.86 = 8.75). Pinning both
              dimensions stops the browser from rendering at fractional
              pixel sizes — that fractional rounding is what made the
              wordmark look jaggy at small sizes. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/pathfinder/pathfinder_zedcor.svg"
            alt="Pathfinder · Zedcor"
            width={158}
            height={18}
            style={{ display: 'block', width: 158, height: 18 }}
          />
          <div
            className="pf-mono"
            style={{ fontSize: 9.5, color: PF.inkDim, letterSpacing: '0.04em', lineHeight: 1, marginTop: 2 }}
          >
            Powered by Unicron
          </div>
        </div>
      </div>

      <div style={{ width: 1, height: 24, background: PF.ruleSoft }} />

      {/* Chat — Demo Polish § 4.2 places this immediately after the brand
          mark, before the CONFIDENTIAL badge and the New-24h counter. Was
          previously near the right rail next to escalations; relocated so
          the flagship customer-facing surface (chat) is the first
          interaction the operator sees after the logo. */}
      {onChatToggle && (
        <button
          type="button"
          className={`pf-pill ${chatOpen ? 'pf-pill-active' : ''}`}
          onClick={onChatToggle}
          title="Open the Intelligence Chat panel — ask, draft outreach, take actions"
          aria-label={chatOpen ? 'Close Intelligence Chat' : 'Open Intelligence Chat'}
          aria-pressed={chatOpen}
        >
          <ChatBubbleIcon />
          Chat
        </button>
      )}

      {/* CONFIDENTIAL badge — § 4.4. Sits between Chat and the
          New-Opportunities counter as a small pill so operators see it
          adjacent to the data it warns about. Tooltip explains the
          policy; amber border + tinted bg make it visible without
          alarming. Replaces the prior floating-watermark stamp that
          was overlapping the Chat button. */}
      <span
        className="pf-mono"
        title="All data on this page is customer-confidential. Do not screenshot or share outside Zedcor."
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          font: '700 10px var(--font-jetbrains-mono), ui-monospace, monospace',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: '#b45309',
          background: 'rgba(245, 158, 11, 0.10)',
          border: '1px solid rgba(245, 158, 11, 0.45)',
          borderRadius: 3,
          padding: '4px 8px',
          userSelect: 'none',
          cursor: 'help',
        }}
      >
        Confidential
      </span>

      <div style={{ width: 1, height: 24, background: PF.ruleSoft }} />
      <SourcesDrawer source={source} setSource={setSource} />

      <div style={{ width: 1, height: 24, background: PF.ruleSoft }} />
      <button
        type="button"
        className={`pf-pill ${crossPoll ? 'pf-pill-warm' : ''}`}
        onClick={() => setCrossPoll(!crossPoll)}
        title="Cross-pollination — surface opportunities sitting in one branch's territory but adjacent to a customer of a different branch. The other branch can warm-intro you."
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 1,
            background: crossPoll ? PF.warm : PF.inkFaint,
            transform: 'rotate(45deg)',
            display: 'inline-block',
          }}
        />
        {crossPoll ? 'Cross-pollination · ON' : 'Cross-pollination'}
      </button>

      <button
        type="button"
        className="pf-pill"
        onClick={onRefresh}
        disabled={refreshing}
        title="Manually run Ingestor → Ranker"
        aria-label="Refresh — run Ingestor and Ranker"
        style={{
          opacity: refreshing ? 0.55 : 1,
          cursor: refreshing ? 'progress' : 'pointer',
        }}
      >
        <RefreshIcon spinning={refreshing} />
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>

      <UnhideButton />

      {onEscalationClick && escalationCount > 0 && (
        <EscalationPill
          count={escalationCount}
          open={escalationOpen}
          onClick={onEscalationClick}
        />
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20 }}>
        <LiveStat
          valueKey="new"
          label="New · 24h"
          accent="hi"
          onClick={onStatClick ? () => onStatClick('new') : undefined}
          title="New Opportunities Ingested · last 24h. Click to open the list."
        />
        <LiveStat
          valueKey="total"
          label="Tracked"
          onClick={onStatClick ? () => onStatClick('total') : undefined}
          title="Click to see every tracked opportunity, newest first"
        />
        <LiveStat
          valueKey="ranked"
          label="Ranked"
          onClick={onStatClick ? () => onStatClick('ranked') : undefined}
          title="Click to see opportunities the Ranker has scored, top score first"
        />
        <LiveStat valueKey="err" label="Errors" muted />
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingLeft: 12,
            borderLeft: `1px solid ${PF.ruleSoft}`,
          }}
        >
          <PulsingDot color={PF.warm} />
          <span className="pf-label">Live</span>
        </span>
        <a
          href="/pathfinder/settings"
          className="pf-pill"
          title="Open the operator-grade settings page"
          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
        >
          <SettingsCog />
          Settings
        </a>
      </div>
    </div>
  );
}

function SettingsCog() {
  return (
    <svg
      width={11}
      height={11}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="2.4" />
      <path d="M8 1.5v2.2 M8 12.3v2.2 M14.5 8h-2.2 M3.7 8H1.5 M12.6 3.4l-1.6 1.6 M5 11l-1.6 1.6 M12.6 12.6l-1.6-1.6 M5 5l-1.6-1.6" />
    </svg>
  );
}

function ChatBubbleIcon() {
  return (
    <svg
      width={11}
      height={11}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 3 h11 a1 1 0 0 1 1 1 v6.5 a1 1 0 0 1 -1 1 H6 L3 14 v-2.5 H2.5 a1 1 0 0 1 -1 -1 V4 a1 1 0 0 1 1 -1 z" />
    </svg>
  );
}
