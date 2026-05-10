import { useEffect, useState } from 'react';
import { ActivityFeed } from './ActivityFeed';

const STORAGE_KEY = 'metacron.live.activitySidebar.expanded';

type Props = {
  onArchitectClick: () => void;
};

function readInitial(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'true';
  } catch {
    return false;
  }
}

/**
 * Activity feed presented as an overlay panel on the LIVE SYSTEM tab.
 *
 * Default state is collapsed so the visualizer keeps the full viewport. A
 * small handle on the left edge toggles the panel open. Open/close state is
 * persisted in localStorage so the operator's preference sticks across reloads.
 */
export function ActivitySidebar({ onArchitectClick }: Props) {
  const [expanded, setExpanded] = useState<boolean>(readInitial);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, expanded ? 'true' : 'false');
    } catch {
      /* localStorage unavailable — non-fatal. */
    }
  }, [expanded]);

  return (
    <>
      {/* Edge handle: visible whenever the panel is collapsed. Clicks expand. */}
      <button
        type="button"
        aria-label="Show activity feed"
        aria-expanded={expanded}
        aria-hidden={expanded}
        tabIndex={expanded ? -1 : 0}
        onClick={() => setExpanded(true)}
        className={[
          'absolute left-0 top-1/2 -translate-y-1/2 z-20',
          'flex items-center justify-center',
          'w-6 h-16 rounded-r-md',
          'bg-bg-card border border-l-0 border-border-default',
          'text-text-secondary hover:text-text-primary hover:bg-bg-panel transition-colors',
          'focus:outline-none focus:ring-1 focus:ring-border-hover',
          expanded ? 'opacity-0 pointer-events-none' : 'opacity-100',
        ].join(' ')}
      >
        <ChevronRightIcon />
      </button>

      {/* Sliding overlay panel. Solid bg keeps activity legible over the canvas. */}
      <aside
        role="complementary"
        aria-label="Recent activity"
        aria-hidden={!expanded}
        data-testid="activity-sidebar-panel"
        className={[
          'absolute left-0 top-0 bottom-0 z-20 w-[340px]',
          'bg-bg-card border-r border-border-default',
          'transition-transform duration-200 ease-out',
          expanded ? 'translate-x-0' : '-translate-x-full',
          'flex flex-col',
        ].join(' ')}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <span className="mono text-[10px] uppercase tracking-[0.22em] text-text-secondary">
            ACTIVITY
          </span>
          <button
            type="button"
            aria-label="Hide activity feed"
            onClick={() => setExpanded(false)}
            className={[
              'flex items-center justify-center w-6 h-6 rounded-md',
              'text-text-secondary hover:text-text-primary hover:bg-bg-panel transition-colors',
              'focus:outline-none focus:ring-1 focus:ring-border-hover',
            ].join(' ')}
          >
            <ChevronLeftIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <ActivityFeed onArchitectClick={onArchitectClick} />
        </div>
      </aside>
    </>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
